// Pure unit tests for the pattern classes: no database, no HTTP.
const { test } = require("node:test");
const assert = require("node:assert/strict");

const { EventBus } = require("../../src/shared/kernel/events");
const { OrderStateMachine, PAID_STATES } = require("../../src/modules/orders/order-state");
const { LineRuleChain, LineRule } = require("../../src/modules/cart/pricing/rules");
const { PricingService } = require("../../src/modules/cart/pricing/pricing.service");
const { FlatRateWithThreshold, FreeShipping, createShippingStrategy } = require("../../src/modules/cart/pricing/shipping");
const { PaymentMethods, ManualPaymentStrategy, StripePaymentStrategy } = require("../../src/modules/orders/payment-strategies");
const { NullPaymentGateway } = require("../../src/infrastructure/payments/PaymentGateway");
const { CachedCatalogService } = require("../../src/modules/catalog/cached-catalog.service");
const { TokenService } = require("../../src/infrastructure/auth/TokenService");

const fakeOrder = (status = "pending_payment") => ({ status, payment: { method: "manual" }, history: [], items: [] });
const fakeProduct = (o) => ({
  _id: o.id, title: o.title, slug: o.title, active: o.active ?? true, images: [], variants: o.variants || [], stock: o.stock ?? 0,
  priceFor(size) { if (!this.variants.length) return o.price; const v = this.variants.find((x) => x.size === size); return v ? v.price : null; },
  stockFor(size) { if (!this.variants.length) return this.stock; return this.variants.find((x) => x.size === size)?.stock ?? 0; },
});

test("EventBus: awaits listeners in order, supports wildcard and unsubscribe", async () => {
  const bus = new EventBus();
  const log = [];
  const off = bus.on("x", async (p) => { await new Promise((r) => setTimeout(r, 5)); log.push(`a:${p}`); });
  bus.on("x", (p) => log.push(`b:${p}`));
  bus.on("*", (p, name) => log.push(`*:${name}`));
  await bus.emit("x", 1);
  assert.deepEqual(log, ["a:1", "b:1", "*:x"]);
  off();
  await bus.emit("x", 2);
  assert.deepEqual(log.slice(3), ["b:2", "*:x"]);
});

test("OrderStateMachine: enforces table, actors and entry actions; publishes events", async () => {
  const bus = new EventBus();
  const seen = [];
  bus.on("order.transitioned", ({ from, to, by }) => seen.push(`${from}>${to}:${by}`));
  bus.on("order.paid", ({ order }) => seen.push(`paid-hook:${order.payment.paidAt instanceof Date}`));
  const sm = new OrderStateMachine({ events: bus });

  const o = fakeOrder();
  await sm.transition(o, "paid", { by: "admin", note: "cash" });
  assert.equal(o.status, "paid");
  assert.equal(o.payment.status, "succeeded");
  assert.deepEqual(o.history.map((h) => h.status), ["paid"]);
  assert.deepEqual(seen, ["pending_payment>paid:admin", "paid-hook:true"]);

  await assert.rejects(sm.transition(o, "pending_payment", { by: "admin" }), /Cannot move an order from paid to pending_payment/);
  await assert.rejects(sm.transition(fakeOrder(), "paid", { by: "customer" }), /Cannot move/); // customers can't mark paid
  await assert.rejects(sm.transition(fakeOrder(), "paid", { by: "hacker" }), /Unknown actor/);
  await assert.rejects(sm.transition(fakeOrder(), "teleported", { by: "admin" }), /Unknown status/);
  assert.deepEqual(OrderStateMachine.allowedFor("paid", "admin"), ["processing", "shipped", "refunded", "cancelled"]);
  assert.deepEqual(OrderStateMachine.allowedFor("pending_payment", "customer"), ["cancelled"]);
  assert.ok(PAID_STATES.includes("shipped") && !PAID_STATES.includes("refunded"));
});

test("LineRuleChain: stops on rejecting rules, accumulates adjustments, is extensible", () => {
  const chain = LineRuleChain.standard();
  const p = fakeProduct({ id: "p1", title: "Print", variants: [{ size: "A4", price: 100, stock: 2 }, { size: "A3", price: 150, stock: 0 }] });

  assert.deepEqual(chain.evaluate({ line: { productId: "p1", size: "A4", qty: 1 }, product: null }).problems.map((x) => x.code), ["unavailable"]);
  assert.deepEqual(chain.evaluate({ line: { productId: "p1", size: "XL", qty: 1 }, product: p }).problems.map((x) => x.code), ["bad_size"]);
  assert.deepEqual(chain.evaluate({ line: { productId: "p1", size: "A3", qty: 1 }, product: p }).problems.map((x) => x.code), ["sold_out"]);

  const ctx = { line: { productId: "p1", size: "A4", qty: 5, unitPrice: 90 }, product: p };
  const r = chain.evaluate(ctx);
  assert.equal(r.accepted, true);
  assert.deepEqual(r.problems.map((x) => x.code), ["qty_reduced", "price_changed"]);
  assert.equal(ctx.qty, 2);
  assert.equal(ctx.unitPrice, 100);

  // Open/Closed: a new policy is a new rule, not an edit.
  class MaxTwoOriginalsRule extends LineRule {
    apply(ctx) { if (ctx.product.isOriginal && ctx.qty > 1) { ctx.qty = 1; return { problem: { code: "one_per_customer" } }; } return null; }
  }
  const extended = new LineRuleChain([...chain.rules, new MaxTwoOriginalsRule()]);
  const orig = fakeProduct({ id: "o", title: "Orig", price: 500, stock: 3 });
  orig.isOriginal = true;
  const c2 = { line: { productId: "o", qty: 3 }, product: orig };
  assert.deepEqual(extended.evaluate(c2).problems.map((x) => x.code), ["one_per_customer"]);
  assert.equal(c2.qty, 1);
});

test("PricingService: merges duplicate lines and delegates shipping to the strategy", async () => {
  const p = fakeProduct({ id: "p1", title: "Print", price: 100, stock: 10 });
  const products = { findManyByIds: async () => [p] };
  const svc = new PricingService({ products, rules: LineRuleChain.standard(), shipping: new FlatRateWithThreshold({ flat: 50, freeAbove: 500 }), currency: "inr" });
  const small = await svc.price([{ productId: "p1", qty: 1 }, { productId: "p1", qty: 2 }]);
  assert.equal(small.items.length, 1);
  assert.equal(small.items[0].qty, 3);
  assert.equal(small.shipping, 50);
  assert.equal(small.total, 350);
  const big = await svc.price([{ productId: "p1", qty: 6 }]);
  assert.equal(big.shipping, 0, "free above threshold");
  assert.equal((await svc.price([])).shipping, 0, "empty cart ships for nothing");
});

test("Shipping strategy factory picks FreeShipping when no flat rate is configured", () => {
  assert.ok(createShippingStrategy({ shippingFlat: 0, freeShippingAbove: 0 }) instanceof FreeShipping);
  assert.ok(createShippingStrategy({ shippingFlat: 100, freeShippingAbove: 2000 }) instanceof FlatRateWithThreshold);
});

test("PaymentMethods: Null gateway hides Stripe; unknown/unavailable methods are rejected; forOrder falls back", async () => {
  const methods = new PaymentMethods([new StripePaymentStrategy({ gateway: new NullPaymentGateway() }), new ManualPaymentStrategy()]);
  assert.deepEqual(methods.describe().map((m) => m.id), ["manual"]);
  assert.throws(() => methods.get("stripe"), /not available/);
  assert.throws(() => methods.get("bitcoin"), /Unknown payment method/);
  const manual = methods.get("manual");
  assert.equal(manual.holdMinutes({ reservationMinutes: 30, manualReservationMinutes: 1440 }), 1440);
  assert.match((await manual.begin(fakeOrder())).instructions, /UPI/);
  assert.equal(methods.forOrder({ payment: { method: "stripe" } }).id, "stripe", "existing Stripe orders still resolve their strategy");

  const enabledGateway = { enabled: true, createIntent: async () => ({ id: "pi_1", status: "requires_payment_method", clientSecret: "sec" }), cancelIntent: async () => {} };
  const withStripe = new PaymentMethods([new StripePaymentStrategy({ gateway: enabledGateway }), new ManualPaymentStrategy()]);
  assert.deepEqual(withStripe.describe().map((m) => m.id), ["stripe", "manual"]);
  const o = fakeOrder();
  const info = await withStripe.get("stripe").begin(o);
  assert.equal(info.clientSecret, "sec");
  assert.equal(o.payment.intentId, "pi_1");
});

test("CachedCatalogService: memoises reads, invalidates on product.changed, passes other calls through", async () => {
  const bus = new EventBus();
  let calls = 0;
  const inner = { async list() { calls++; return [calls]; }, async categories() { calls++; return ["c"]; }, async getAny(id) { return `any:${id}`; } };
  const cached = new CachedCatalogService(inner, { events: bus, ttlMs: 10_000 });
  assert.deepEqual(await cached.list({}, { page: 1 }, true), [1]);
  assert.deepEqual(await cached.list({}, { page: 1 }, true), [1], "second call served from cache");
  assert.deepEqual(await cached.list({ q: "x" }, { page: 1 }, true), [2], "different query is a different key");
  await cached.categories();
  assert.equal(cached.stats.entries, 3);
  await bus.emit("product.changed", {});
  assert.equal(cached.stats.entries, 0);
  assert.deepEqual(await cached.list({}, { page: 1 }, true), [4], "recomputed after invalidation");
  assert.equal(await cached.getAny("7"), "any:7", "non-cached methods proxy to the inner service");
});

test("TokenService: round-trips claims and returns null for tampered or foreign tokens", () => {
  const t = new TokenService({ secret: "s".repeat(40), expiresIn: "1h" });
  const token = t.sign({ _id: { toString: () => "u1" }, tokenVersion: 3 }, { via: "test" });
  const payload = t.verify(token);
  assert.equal(payload.sub, "u1");
  assert.equal(payload.v, 3);
  assert.equal(payload.via, "test");
  assert.equal(t.verify(token.slice(0, -2) + "xx"), null);
  assert.equal(new TokenService({ secret: "other".repeat(10), expiresIn: "1h" }).verify(token), null);
});
