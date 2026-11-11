const path = require("path");
const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const rateLimit = require("express-rate-limit");
const { config } = require("./config");
const { notFoundHandler, errorHandler } = require("./errors");

function buildApp() {
  const app = express();
  app.disable("x-powered-by");
  app.set("trust proxy", 1); // Render terminates TLS in front of us

  app.use(
    helmet({
      // The CRA bundle is served from this origin; keep CSP permissive enough for it.
      contentSecurityPolicy: false,
      crossOriginEmbedderPolicy: false,
    })
  );

  // Same-origin by default. Set CORS_ORIGINS when the frontend lives elsewhere.
  if (config.corsOrigins.length) {
    app.use(cors({ origin: config.corsOrigins, credentials: false, methods: ["GET", "POST", "PUT", "PATCH", "DELETE"] }));
  }

  // Webhooks need the raw body: mount before express.json().
  app.use("/api/webhooks", require("./routes/webhooks"));

  app.use(express.json({ limit: "100kb" }));
  app.use(
    "/api",
    rateLimit({ windowMs: 60 * 1000, limit: 300, standardHeaders: "draft-7", legacyHeaders: false })
  );

  app.get("/api/health", (req, res) => res.json({ ok: true, uptime: process.uptime() }));
  app.use("/api/auth", require("./routes/auth"));
  app.use("/api/users", require("./routes/users"));
  app.use("/api/products", require("./routes/products"));
  app.use("/api/carts", require("./routes/cart"));
  app.use("/api/orders", require("./routes/orders"));
  app.use("/api", notFoundHandler);

  // Static storefront (CRA build in /public) with SPA fallback for client routes.
  const publicDir = path.join(__dirname, "..", "public");
  app.use(express.static(publicDir, { maxAge: "1h", index: "index.html" }));
  app.get("*", (req, res, next) => {
    if (req.method !== "GET" || req.path.startsWith("/api/")) return next();
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.use(errorHandler);
  return app;
}

module.exports = { buildApp };
