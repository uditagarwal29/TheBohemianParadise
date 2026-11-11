require("dotenv").config();

function int(name, fallback) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) ? v : fallback;
}

const config = {
  env: process.env.NODE_ENV || "development",
  port: int("PORT", 5000),
  // Render (and any container host) needs 0.0.0.0 so the platform proxy can reach the process.
  // Locally we stay on loopback unless HOST is set explicitly.
  host: process.env.HOST || (process.env.RENDER ? "0.0.0.0" : "127.0.0.1"),
  mongoUrl: process.env.MONGO_URL,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
  corsOrigins: (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
  stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  currency: (process.env.CURRENCY || "inr").toLowerCase(),
  shippingFlat: int("SHIPPING_FLAT", 0),
  freeShippingAbove: int("FREE_SHIPPING_ABOVE", 0),
  reservationMinutes: int("RESERVATION_MINUTES", 30),
};

function assertConfig() {
  const missing = [];
  if (!config.mongoUrl) missing.push("MONGO_URL");
  if (!config.jwtSecret || config.jwtSecret.length < 32) missing.push("JWT_SECRET (>= 32 chars)");
  if (missing.length) {
    throw new Error(`Missing/invalid environment variables: ${missing.join(", ")}`);
  }
}

module.exports = { config, assertConfig };
