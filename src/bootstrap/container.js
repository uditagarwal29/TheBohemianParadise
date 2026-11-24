// Composition root. The only place that knows which concrete class fulfils which role.
// Everything else receives collaborators through its constructor (Dependency Inversion).
// `overrides` lets tests swap any adapter (e.g. a fake identity provider) without mocks.
const { config: defaultConfig } = require("../config");
const { EventBus } = require("../shared/kernel/events");
const { createStorage } = require("../infrastructure/storage");
const { createPaymentGateway } = require("../infrastructure/payments");
const { TokenService } = require("../infrastructure/auth/TokenService");
const { GoogleIdentityProvider } = require("../infrastructure/auth/GoogleIdentityProvider");
const { createAuthGuards } = require("../shared/http/auth.middleware");
const { createUpload } = require("../shared/http/upload");

const { ProductRepository } = require("../modules/catalog/product.repository");
const { UserRepository } = require("../modules/users/user.repository");
const { CartRepository } = require("../modules/cart/cart.repository");
const { OrderRepository } = require("../modules/orders/order.repository");

const { CatalogService, registerCatalogListeners } = require("../modules/catalog/catalog.service");
const { CachedCatalogService } = require("../modules/catalog/cached-catalog.service");
const { StockService, ReservationSweeper } = require("../modules/inventory/stock.service");
const { PricingService } = require("../modules/cart/pricing/pricing.service");
const { LineRuleChain } = require("../modules/cart/pricing/rules");
const { createShippingStrategy } = require("../modules/cart/pricing/shipping");
const { CartService } = require("../modules/cart/cart.service");
const { OrderStateMachine } = require("../modules/orders/order-state");
const { ManualPaymentStrategy, StripePaymentStrategy, PaymentMethods } = require("../modules/orders/payment-strategies");
const { CheckoutService } = require("../modules/orders/checkout.service");
const { OrderService } = require("../modules/orders/order.service");
const { UserService } = require("../modules/users/user.service");
const { AuthService } = require("../modules/auth/auth.service");
const { AnalyticsService } = require("../modules/admin/analytics.service");

function createContainer(overrides = {}) {
  const config = overrides.config || defaultConfig;
  const c = { config };

  // ---- kernel + infrastructure (adapters chosen by factories) --------------------
  c.events = overrides.events || new EventBus();
  c.storage = overrides.storage || createStorage(config.storage);
  c.gateway = overrides.gateway || createPaymentGateway(config.payments);
  c.tokens = overrides.tokens || new TokenService({ secret: config.auth.jwtSecret, expiresIn: config.auth.jwtExpiresIn });
  c.identityProviders = overrides.identityProviders || [new GoogleIdentityProvider({ clientId: config.auth.googleClientId })];

  // ---- repositories -------------------------------------------------------------
  c.products = new ProductRepository();
  c.users = new UserRepository();
  c.carts = new CartRepository();
  c.orders = new OrderRepository();

  // ---- domain services ----------------------------------------------------------
  c.orderState = new OrderStateMachine({ events: c.events });
  c.inventory = new StockService({ products: c.products, orders: c.orders, events: c.events });
  c.sweeper = new ReservationSweeper({ orders: c.orders, orderState: c.orderState });

  const catalog = new CatalogService({ products: c.products, storage: c.storage, events: c.events });
  c.catalog = config.catalog.cacheSeconds > 0 ? new CachedCatalogService(catalog, { events: c.events, ttlMs: config.catalog.cacheSeconds * 1000 }) : catalog;
  registerCatalogListeners({ events: c.events, products: c.products });

  c.pricing = new PricingService({ products: c.products, rules: LineRuleChain.standard(), shipping: createShippingStrategy(config.store), currency: config.store.currency });
  c.cart = new CartService({ carts: c.carts, pricing: c.pricing });

  c.paymentMethods = new PaymentMethods([new StripePaymentStrategy({ gateway: c.gateway }), new ManualPaymentStrategy()]);
  c.checkout = new CheckoutService({ orders: c.orders, carts: c.carts, pricing: c.pricing, inventory: c.inventory, paymentMethods: c.paymentMethods, orderState: c.orderState, storeConfig: config.store });
  c.orderService = new OrderService({ orders: c.orders, orderState: c.orderState, paymentMethods: c.paymentMethods, gateway: c.gateway });

  c.userService = new UserService({ users: c.users, orders: c.orders });
  c.auth = new AuthService({ users: c.users, tokens: c.tokens, identityProviders: c.identityProviders });
  c.analytics = new AnalyticsService({ orders: c.orders, products: c.products, users: c.users });

  // ---- http helpers -------------------------------------------------------------
  c.guards = createAuthGuards({ tokenService: c.tokens, users: c.users });
  c.upload = createUpload({ maxUploadMb: config.storage.maxUploadMb });

  return c;
}

module.exports = { createContainer };
