const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { createContainer } = require("./bootstrap/container");
const { notFoundHandler, errorHandler } = require("./shared/errors");

// Each module exports a route factory taking the container. This table is the whole HTTP map.
const modules = [
  ["/api/auth", require("./modules/auth/auth.routes")],
  ["/api/users", require("./modules/users/user.routes")],
  ["/api/products", require("./modules/catalog/catalog.routes")],
  ["/api/carts", require("./modules/cart/cart.routes")],
  ["/api/orders", require("./modules/orders/order.routes")],
  ["/api/admin", require("./modules/admin/admin.routes")],
];

function buildApp({ publicDir = path.join(__dirname, "..", "public"), container, overrides } = {}) {
  const c = container || createContainer(overrides);
  const { config } = c;
  const app = express();
  app.set("container", c);
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Render terminates TLS in front of us

  app.use(
    helmet({
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
      crossOriginResourcePolicy: { policy: "cross-origin" },
      // Google Sign-In's popup must talk back to this window; default COOP would sever it.
      crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" },
    })
  );
  if (config.http.corsOrigins.length) {
    app.use(cors({ origin: config.http.corsOrigins, credentials: false, methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] }));
  }

  // Webhooks need the raw body: mount before express.json().
  app.use("/api/webhooks", require("./modules/orders/order.routes").webhookRoutes(c));

  app.use(express.json({ limit: config.http.jsonLimit }));
  app.use("/api", rateLimit({ ...config.http.rateLimit, standardHeaders: "draft-7", legacyHeaders: false }));

  app.get("/api/health", (req, res) => res.json({ ok: true, uptime: process.uptime(), storage: c.storage.name, payments: c.gateway.name }));
  for (const [prefix, factory] of modules) app.use(prefix, factory(c));
  app.use("/api", notFoundHandler);

  // Locally stored uploads (dev). CDN-backed adapters return null and serve their own URLs.
  const uploads = c.storage.staticHandler();
  if (uploads) app.use("/uploads", uploads);

  // Static storefront (Vite build in /public) with SPA fallback for client routes.
  app.use(express.static(publicDir, { maxAge: "1h", index: "index.html" }));
  app.get("*", (req, res, next) => {
    if (!["GET", "HEAD"].includes(req.method) || req.path.startsWith("/api/") || req.path.startsWith("/uploads/")) return next();
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.use(errorHandler);
  return app;
}

module.exports = { buildApp };
