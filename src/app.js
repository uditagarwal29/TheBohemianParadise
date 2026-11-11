const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { config } = require("./config");
const { notFoundHandler, errorHandler } = require("./shared/errors");
const { storage } = require("./infrastructure/storage");

// Each feature module exposes an express.Router; this file only wires them.
const modules = [
  ["/api/auth", require("./modules/auth/auth.routes")],
  ["/api/users", require("./modules/users/user.routes")],
  ["/api/products", require("./modules/catalog/catalog.routes")],
  ["/api/carts", require("./modules/cart/cart.routes")],
  ["/api/orders", require("./modules/orders/order.routes")],
  ["/api/admin", require("./modules/admin/admin.routes")],
];

function buildApp({ publicDir = path.join(__dirname, "..", "public") } = {}) {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Render terminates TLS in front of us

  app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" } }));
  if (config.http.corsOrigins.length) {
    app.use(cors({ origin: config.http.corsOrigins, credentials: false, methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] }));
  }

  // Webhooks need the raw body: mount before express.json().
  app.use("/api/webhooks/stripe", require("./modules/orders/stripe.webhook"));

  app.use(express.json({ limit: config.http.jsonLimit }));
  app.use("/api", rateLimit({ ...config.http.rateLimit, standardHeaders: "draft-7", legacyHeaders: false }));

  app.get("/api/health", (req, res) => res.json({ ok: true, uptime: process.uptime(), storage: storage().name }));
  for (const [prefix, router] of modules) app.use(prefix, router);
  app.use("/api", notFoundHandler);

  // Locally stored uploads (dev). Cloudinary URLs bypass this entirely.
  if (storage().name === "local") app.use("/uploads", express.static(storage().dir, { maxAge: "7d", immutable: true }));

  // Static storefront (Vite build in /public) with SPA fallback for client routes.
  app.use(express.static(publicDir, { maxAge: "1h", index: "index.html" }));
  app.get("*", (req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/") || req.path.startsWith("/uploads/")) return next();
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.use(errorHandler);
  return app;
}

module.exports = { buildApp };
