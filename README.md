# The Bohemian Paradise — backend (v2)

Express + MongoDB API for the TBP art store, also serving the built storefront from `public/`.
Every piece has real stock (originals are `stock: 1`), checkout reserves stock atomically, and
prices/totals are always computed server-side.

## Run locally

```bash
cp .env.example .env     # fill MONGO_URL and JWT_SECRET (openssl rand -hex 32)
npm install
npm run dev              # http://127.0.0.1:5000
npm test                 # in-memory MongoDB, no services needed
```

## Deploy on Render

Build command `npm ci`, start command `npm start`. Environment: `MONGO_URL`, `JWT_SECRET`, optionally
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CORS_ORIGINS`, `SHIPPING_FLAT`, `FREE_SHIPPING_ABOVE`.
Render sets `PORT` and `RENDER` itself; the server binds `0.0.0.0` only when `RENDER` is present.
Stripe webhook endpoint: `https://<host>/api/webhooks/stripe` (events `payment_intent.succeeded`,
`payment_intent.payment_failed`, `payment_intent.canceled`, `charge.refunded`).

## Migrating an existing v1 database

```bash
node scripts/migrate-v2.js            # dry run
PASS_SEC=<old secret> npm i --no-save crypto-js && PASS_SEC=<old secret> node scripts/migrate-v2.js --apply
ADMIN_EMAIL=you@example.com node scripts/create-admin.js
```

## Customer journey

| Step | Guest | Signed in |
|---|---|---|
| Browse / search / filter | `GET /api/products`, `GET /api/products/categories`, `GET /api/products/:idOrSlug` | same |
| Cart | kept in the browser; `POST /api/carts/validate` re-prices and flags stock problems | `GET/PUT /api/carts/me`, `POST /api/carts/me/items`, `PATCH/DELETE /api/carts/me/items/:productId?size=` |
| Login | `POST /api/auth/register`, `POST /api/auth/login` → `accessToken` | `POST /api/carts/me/merge` folds the guest cart in |
| Checkout | must sign in | `POST /api/orders/checkout` `{ paymentMethod: stripe\|manual, addressId \| shippingAddress, items? }` → order `pending_payment`, stock reserved for `RESERVATION_MINUTES` |
| Pay | | Stripe: confirm `clientSecret` in the browser, webhook marks `paid`. Manual: `POST /api/orders/:id/payment-reference`, admin marks `paid` |
| Track | | `GET /api/orders/me`, `GET /api/orders/:id`, `POST /api/orders/:id/cancel` (while unpaid) |
| Account | | `GET /api/auth/me`, `PATCH /api/users/me`, `POST /api/users/me/password`, `POST/DELETE /api/users/me/addresses` |

Auth header: `Authorization: Bearer <token>` (legacy `token: Bearer <token>` still accepted).
Errors are JSON `{ error, details? }`; `409` on checkout carries `details.problems` describing which lines sold out.

## Admin

`POST/PATCH/DELETE /api/products`, `POST /api/products/:id/stock {delta,size?}`, `GET /api/orders?status=`,
`PATCH /api/orders/:id/status {status,note?,tracking?}`, `GET /api/orders/income`, `GET /api/users`, `GET /api/users/stats`,
`PATCH /api/users/:id {isAdmin?,disabled?}`. Product delete is a soft delete so past orders keep their reference.

Order statuses: `pending_payment → paid → processing → shipped → delivered`, plus `cancelled`, `payment_failed`
(reservation expired or Stripe declined; stock returned automatically) and `refunded`.
