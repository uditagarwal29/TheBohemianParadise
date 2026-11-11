# The Bohemian Paradise — backend (v2)

Express + MongoDB API for the TBP art store, also serving the built storefront from `public/`.
Every piece has real stock (originals are `stock: 1`), checkout reserves stock atomically, and
prices/totals are always computed server-side.

## Run locally

```bash
cp .env.example .env     # fill MONGO_URL and JWT_SECRET (openssl rand -hex 32)
npm install
npm run build            # builds frontend/ into public/
npm run dev              # http://127.0.0.1:5000 serves API + storefront
npm test                 # backend tests, in-memory MongoDB

# No MongoDB handy? Full demo stack with seeded sample art, nothing external:
npm run dev:stack        # http://127.0.0.1:5000, admin@example.com / adminpass123

# Frontend hot reload (proxies /api to :5000)
cd frontend && npm install && npm run dev
```

## Deploy on Render

Build command `npm ci && npm run build`, start command `npm start`. Environment: `MONGO_URL`, `JWT_SECRET`, optionally
`GOOGLE_CLIENT_ID` + `VITE_GOOGLE_CLIENT_ID`, `CLOUDINARY_URL`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `CORS_ORIGINS`, `SHIPPING_FLAT`, `FREE_SHIPPING_ABOVE`, and
`VITE_STRIPE_PUBLISHABLE_KEY` (read at build time by the storefront when Stripe is on).
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

**Google sign-in.** `GET /api/auth/providers` tells the UI what is on. `POST /api/auth/google { idToken }` verifies a
Google ID token (Google Identity Services in the browser) and signs in, creating the account on first use or linking to an
existing account with the same verified email. Google-only accounts can add a password with `POST /api/auth/set-password`.
Enable by setting `GOOGLE_CLIENT_ID` (server) and `VITE_GOOGLE_CLIENT_ID` (frontend build) to the same OAuth Web client ID,
with `https://tbp.onrender.com` (and `http://127.0.0.1:8080` for dev) in the client's *Authorized JavaScript origins*.

Auth header: `Authorization: Bearer <token>` (legacy `token: Bearer <token>` still accepted).
Errors are JSON `{ error, details? }`; `409` on checkout carries `details.problems` describing which lines sold out.

## Admin

Sign in with an admin account and open `/admin` (also linked from the shop nav). Dashboard: revenue and
orders over 30 days, orders awaiting your UPI confirmation, sales by theme, best sellers, most viewed,
low stock, recent orders. Products: list with Live / Low / Sold out / Hidden filters, inline stock +/−,
add/edit with drag-and-drop photo upload, per-size variants, themes, hide/restore. Orders: filter by
status, search, confirm payment, ship with tracking, cancel/refund (returns stock). Customers: search,
order history, promote/disable.

Images go through `src/infrastructure/storage`: local disk in development, Cloudinary when
`CLOUDINARY_URL` is set (required on Render, whose disk is wiped on deploy).

API: `GET /api/admin/dashboard`, `/api/admin/analytics/*`, `/api/admin/settings`, `GET /api/products/admin/list`,
`POST /api/products/images`, `POST/DELETE /api/products/:id/images`, `POST /api/products/:id/restore`,
`POST/PATCH/DELETE /api/products`, `POST /api/products/:id/stock {delta,size?}`, `GET /api/orders?status=`,
`PATCH /api/orders/:id/status {status,note?,tracking?}`, `GET /api/orders/income`, `GET /api/users`, `GET /api/users/stats`,
`PATCH /api/users/:id {isAdmin?,disabled?}`. Product delete is a soft delete so past orders keep their reference.

Order statuses: `pending_payment → paid → processing → shipped → delivered`, plus `cancelled`, `payment_failed`
(reservation expired or Stripe declined; stock returned automatically) and `refunded`.

See `ARCHITECTURE.md` for the module layout and the rules it follows.

## Storefront (`frontend/`)

Vite + React 18 + React Router, no state library: `src/store.jsx` holds auth and the bag.
Guests keep their bag in `localStorage` and every change is re-priced through `POST /api/carts/validate`;
on sign-in or registration the bag is merged into the account cart (`POST /api/carts/me/merge`).

Pages: `/` home · `/products[/:category]?q=&sort=&inStock=1&page=` · `/product/:slug` · `/cart` · `/login` · `/register` ·
`/checkout` · `/orders` · `/orders/:id` · `/account`. Checkout, orders and account require sign-in and bounce back via `?next=`.
Stock states shown everywhere: *Sold out*, *Only N left*, *Original · 1 of 1*; quantity is capped to what is available.
