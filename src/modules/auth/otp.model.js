const mongoose = require("mongoose");

// One-time codes for registration and passwordless sign-in. The code itself is
// never stored, only an HMAC of it; documents expire automatically (TTL index).
const otpSchema = new mongoose.Schema(
  {
    purpose: { type: String, enum: ["register", "login"], required: true },
    channel: { type: String, enum: ["email", "sms"], required: true },
    destination: { type: String, required: true }, // lowercased email or E.164 phone
    codeHash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    consumedAt: { type: Date },
    requestIp: { type: String },
  },
  { timestamps: true }
);

otpSchema.index({ purpose: 1, channel: 1, destination: 1, createdAt: -1 });
otpSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("Otp", otpSchema);
