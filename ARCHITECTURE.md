# Architecture

The backend follows a **feature-module layout with a layered inside** (routes → service → model), the
structure most current Node/Express guidance converges on for apps that outgrow a flat
`routes/ controllers/ models/` tree: code that changes together lives together, cross-cutting concerns
are shared, and anything that talks to the outside world sits behind an adapter. See the layered
controller/service/repository write-up on [dev.to](https://dev.to/devanshu_patil/production-grade-expressjs-architecture-layered-controller-service-and-repository-pattern-55e0)
and the feature-module argument in [How to Structure Large Node.js Applications](https://oneuptime.com/blog/post/2026-02-03-nodejs-large-app-structure/view).

```
index.js                      process bootstrap: config check, DB connect, listen, sweeper, graceful shutdown
src/
  app.js                      Express wiring only: security middleware, module mount table, static SPA, error handler
  config/index.js             every env var read in one place, grouped (db, auth, http, store, payments, storage)
  shared/                     cross-cutting, no business rules
    errors.js                 HttpError + factories, wrap(), JSON error handler
    http/validate.js          allowlist body/query validation -> req.data (blocks mass assignment)
    http/respond.js           controller() adapter, pageParams()
    http/upload.js            multer in memory + MIME/size limits
    middleware/auth.js        JWT verify, requireAuth / requireAdmin / optionalAuth
  infrastructure/             adapters for external systems; swappable, no domain logic
    storage/                  image storage: local disk (dev) | Cloudinary (prod), one interface
    payments/stripe.js        PaymentIntents + webhook signature check
  modules/<feature>/          one folder per business capability
    *.routes.js               HTTP surface: paths, auth guards, validation shapes, calls the service
    *.service.js              business rules; the only layer that touches models
    *.model.js                Mongoose schema + document helpers (acts as the repository)
    auth/      register, login, token invalidation
    users/     profile, addresses, admin user management
    catalog/   products, categories, search, images, view counting
    inventory/ atomic stock reservation, release, expiry sweeper
    cart/      server cart + guest cart pricing (pricing.service)
    orders/    checkout, status machine, payment reference, Stripe webhook
    admin/     read-only analytics for the dashboard, deployment settings
scripts/                      operational one-offs: migrate, seed demo, create admin, dev stack
test/                         supertest end-to-end against mongodb-memory-server
frontend/                     Vite + React storefront and /admin app (built into public/)
```

## Rules of the road

- **Dependencies point inward.** `routes → service → model`. Services may call other modules' services
  (orders uses inventory, cart pricing, payments) but never another module's routes. Infrastructure is
  only called from services.
- **Routes carry no logic.** A route declares the path, the guard (`requireAuth`, `requireAdmin`), the
  validation shape, and one service call wrapped in `controller()`. If a route grows an `if`, move it.
- **Validation is an allowlist.** `validate(shape)` copies only declared keys into `req.data`; unknown
  keys (e.g. `isAdmin`) never reach a model. Mongoose validation is the second line, not the first.
- **Authorization comes from the database, not the token.** The JWT carries only `sub` and a
  `tokenVersion`; role and disabled state are read per request, so demotions and password changes take
  effect immediately.
- **Money and stock are server truth.** Prices, totals, shipping and availability are recomputed in
  `cart/pricing.service` at every step; stock changes are single atomic `updateOne` filters in
  `inventory/stock.service`, never read-then-write.
- **External systems are adapters.** Switching image hosting or payment provider means a new file in
  `infrastructure/`, not edits across modules. Config decides which adapter is live.
- **Errors are thrown, not returned.** Services throw `HttpError`s; `controller()`/`wrap()` route them to
  the single JSON error handler. No `res.status(...)` in services.
- **Tests are black-box.** `test/` drives the HTTP API against an in-memory MongoDB and asserts behaviour
  (who can do what, what stock is left), not implementation.

## Scaling path

The module boundaries are the seams for growth, in this order:

1. **Caching** read-heavy catalogue endpoints (list, categories) in `catalog.service` with a TTL cache or
   Redis; nothing outside the module changes.
2. **Background jobs**: the reservation sweeper in `inventory` is a `setInterval` today; move it (and
   order emails) to a queue worker under `infrastructure/jobs/` when there is more than one instance.
3. **Repositories**: if Mongoose ever needs replacing, introduce `*.repository.js` per module and point
   services at it; today the model is the repository to avoid a pass-through layer.
4. **Split a module into its own service** by moving its folder and exposing it over HTTP; the routes
   file already is the public contract.
