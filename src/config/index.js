require("dotenv").config();

function int(name, fallback) {
  const v = parseInt(process.env[name], 10);
  return Number.isFinite(v) ? v : fallback;
}
const list = (name) => (process.env[name] || "").split(",").map((s) => s.trim()).filter(Boolean);

const config = {
  env: process.env.NODE_ENV || "development",
  isProd: process.env.NODE_ENV === "production",
  port: int("PORT", 5000),
  // Render (and any container host) needs 0.0.0.0 so the platform proxy can reach the process.
  // Locally we stay on loopback unless HOST is set explicitly.
  host: process.env.HOST || (process.env.RENDER ? "0.0.0.0" : "127.0.0.1"),
  publicUrl: process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || "",

  db: { url: process.env.MONGO_URL },

  auth: {
    jwtSecret: process.env.JWT_SECRET,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || "7d",
    // Google Sign-In (OAuth client ID of type "Web application"). Empty = feature off.
    googleClientId: process.env.GOOGLE_CLIENT_ID || "",
  },

  http: {
    corsOrigins: list("CORS_ORIGINS"),
    jsonLimit: "100kb",
    rateLimit: { windowMs: 60_000, limit: 300 },
    authRateLimit: { windowMs: 15 * 60_000, limit: 20 },
  },

  store: {
    currency: (process.env.CURRENCY || "inr").toLowerCase(),
    shippingFlat: int("SHIPPING_FLAT", 0),
    freeShippingAbove: int("FREE_SHIPPING_ABOVE", 0),
    reservationMinutes: int("RESERVATION_MINUTES", 30),
    manualReservationMinutes: int("MANUAL_RESERVATION_MINUTES", 24 * 60),
  },

  payments: {
    stripeSecretKey: process.env.STRIPE_SECRET_KEY || "",
    stripeWebhookSecret: process.env.STRIPE_WEBHOOK_SECRET || "",
  },

  // Product images. "cloudinary" when CLOUDINARY_URL is set, else local disk
  // (fine for development; on Render the disk is wiped on every deploy).
  storage: {
    driver: process.env.STORAGE_DRIVER || (process.env.CLOUDINARY_URL ? "cloudinary" : "local"),
    cloudinaryUrl: process.env.CLOUDINARY_URL || "",
    cloudinaryFolder: process.env.CLOUDINARY_FOLDER || "tbp",
    localDir: process.env.UPLOAD_DIR || "uploads",
    maxUploadMb: int("MAX_UPLOAD_MB", 8),
  },
};

function assertConfig() {
  const missing = [];
  if (!config.db.url) missing.push("MONGO_URL");
  if (!config.auth.jwtSecret || config.auth.jwtSecret.length < 32) missing.push("JWT_SECRET (>= 32 chars)");
  if (config.storage.driver === "cloudinary" && !config.storage.cloudinaryUrl) missing.push("CLOUDINARY_URL");
  if (missing.length) throw new Error(`Missing/invalid environment variables: ${missing.join(", ")}`);
}

module.exports = { config, assertConfig };
