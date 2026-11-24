# Architecture

Feature modules with a layered inside (`routes → service → repository → model`), wired together in one
composition root. Every class receives its collaborators through its constructor; nothing reaches for a
global. The layout follows the layered controller/service/repository pattern organised as feature modules
([dev.to write-up](https://dev.to/devanshu_patil/production-grade-expressjs-architecture-layered-controller-service-and-repository-pattern-55e0),
[How to Structure Large Node.js Applications](https://oneuptime.com/blog/post/2026-02-03-nodejs-large-app-structure/view)).

```
index.js                         process bootstrap: config check, DB connect, container, listen, sweeper, shutdown
src/
  app.js                         Express wiring only: security middleware, module mount table, static SPA, error handler
  bootstrap/container.js         COMPOSITION ROOT: builds adapters via factories and injects them into services
  config/index.js                every env var read once, grouped (db, auth, http, store, catalog, payments, storage)
  shared/
    kernel/events.js             EventBus (Observer)
    kernel/repository.js         BaseRepository (Template Method)
    errors.js                    HttpError + factories, wrap(), JSON error handler
    http/validate.js             allowlist body validation -> req.data (blocks mass assignment)
    http/respond.js              controller() adapter, pageParams()
    http/auth.middleware.js      createAuthGuards({ tokenService, users }) -> requireAuth / requireAdmin / optionalAuth
    http/upload.js               createUpload({ maxUploadMb }) -> multer in memory with MIME/size limits
  infrastructure/                adapters for the outside world; no domain logic
    storage/                     StorageAdapter (interface) · LocalStorageAdapter · CloudinaryStorageAdapter · createStorage()
    payments/                    PaymentGateway (interface) · NullPaymentGateway · StripeGateway · createPaymentGateway()
    auth/                        TokenService (JWT) · IdentityProvider / GoogleIdentityProvider
  modules/<feature>/
    *.routes.js                  factory (container) -> Router; paths, guards, validation shapes, one service call each
    *.service.js                 business rules; depends on repositories and other services, never on Express or Mongoose
    *.repository.js              intent-named queries on top of BaseRepository; the only layer that knows Mongoose filters
    *.model.js                   schema + document helpers
    catalog/                     CatalogService · CachedCatalogService (Decorator) · view-count listener
    inventory/                   StockService (event subscriber) · ReservationSweeper (job)
    cart/                        CartService · pricing/{PricingService, rules (Chain of Responsibility), shipping (Strategy)}
    orders/                      CheckoutService (Facade) · OrderService · OrderStateMachine (State) · payment-strategies (Strategy)
    users/ auth/ admin/          UserService · AuthService (identity providers as adapters) · AnalyticsService (read-only)
scripts/                         migrate, seed demo, create admin, dev stack
test/                            black-box HTTP tests on mongodb-memory-server; test/unit/ pure pattern tests
frontend/                        Vite + React storefront and /admin (built into public/)
```

## SOLID, concretely

| Principle | Where it shows |
|---|---|
| **S**ingle responsibility | `TokenService` only signs/verifies; `PricingService` only orchestrates rules; `StockService` only moves stock; routes only translate HTTP. The old `order.service` was split into `CheckoutService`, `OrderService`, `OrderStateMachine`, `payment-strategies`. |
| **O**pen/closed | New shipping policy → new `ShippingStrategy`; new cart rule → new `LineRule`; new payment method → new `PaymentStrategy`; new image host → new `StorageAdapter`; new reaction to an order event → new `events.on(...)`. None require editing existing classes. |
| **L**iskov substitution | `NullPaymentGateway` stands in for `StripeGateway`; `LocalStorageAdapter` for `CloudinaryStorageAdapter`; `CachedCatalogService` for `CatalogService`; tests substitute a fake `IdentityProvider`. Callers cannot tell. |
| **I**nterface segregation | Guards get `{ tokenService, users }`, not the whole container. `StockService` sees a repository with `reserve/release/incrementSold`, not the Mongoose model. The webhook route gets `{ gateway, orderService }`. |
| **D**ependency inversion | Services depend on abstractions (`StorageAdapter`, `PaymentGateway`, `IdentityProvider`, repositories, `EventBus`). Concrete classes are chosen in `bootstrap/container.js` from config; tests pass `overrides`. |

## Patterns in use

**Creational**
- *Factory Method*: `createStorage(config)`, `createPaymentGateway(config)`, `createShippingStrategy(config)`, `createAuthGuards`, `createUpload`, route factories `moduleRoutes(container)`.
- *Dependency Injection / Composition Root*: `bootstrap/container.js` is the single place that `new`s concrete classes.
- *Null Object*: `NullPaymentGateway` when Stripe is not configured; `FreeShipping` when no flat rate is set.
- *Builder-style construction*: `CheckoutService` assembles the order document from priced items, address, payment strategy and hold time in one place (`orders.build(...)`).

**Structural**
- *Adapter*: storage, payment gateway and identity provider each hide a third-party SDK behind a small interface.
- *Repository*: `*.repository.js` give services domain-language queries and keep Mongoose out of business logic.
- *Facade*: `CheckoutService.checkout()` coordinates pricing → stock reservation → order build → payment strategy → cart clearing.
- *Decorator*: `CachedCatalogService` wraps `CatalogService`, memoises `list`/`categories`, and clears itself on `product.changed`. Enabled by `CATALOG_CACHE_SECONDS` (on in production, off in tests).

**Behavioural**
- *State*: `OrderStateMachine` owns the transition table (from → to → allowed actors), entry actions (`paid` stamps `paidAt`) and history.
- *Observer*: `EventBus`. The state machine emits `order.<status>`; `StockService` returns or counts stock on those events; `CatalogService` emits `product.viewed` / `product.changed`, consumed by the view counter and the cache.
- *Strategy*: `PaymentStrategy` (manual vs Stripe: hold time, how to begin/abandon payment) and `ShippingStrategy`.
- *Chain of Responsibility*: `LineRuleChain` runs `ProductAvailable → SizeKnown → InStock → QuantityCap → PriceChanged` over each cart line; rejecting rules stop the chain, adjusting rules annotate and continue.
- *Template Method*: `BaseRepository` provides the generic CRUD; subclasses add the specific queries.

## Rules of the road

- Dependencies point inward: `routes → service → repository → model`. Services may use other services; nothing imports a route.
- Routes carry no logic. A route declares path, guard, validation shape and one service call wrapped in `controller()`.
- Validation is an allowlist. `validate(shape)` copies only declared keys into `req.data`.
- Authorization comes from the database, not the token. The JWT carries only `sub` and `tokenVersion`.
- Money and stock are server truth. Prices are recomputed by `PricingService` at every step; stock changes are single atomic `updateOne` filters in `ProductRepository`.
- Side effects between modules go through events, awaited synchronously, so a transition and its consequences are saved together.
- Errors are thrown as `HttpError`s and rendered by one handler; services never touch `res`.
- Tests: `test/*.test.js` drive the HTTP API against an in-memory MongoDB; `test/unit/` exercise the pattern classes with fakes and no I/O.

## Scaling path

1. **Caching**: raise `CATALOG_CACHE_SECONDS` or swap the `Map` in `CachedCatalogService` for Redis; nothing else changes.
2. **Background work**: `ReservationSweeper` and future email notifications become `events.on(...)` subscribers that enqueue to a worker when there is more than one instance.
3. **Another payment provider**: a `PaymentGateway` adapter plus a `PaymentStrategy`; register both in the container.
4. **Splitting a module out**: its routes file is already its public contract; move the folder and expose it over HTTP.
