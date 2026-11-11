const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const Otp = require("./otp.model");
const User = require("../users/user.model");
const { config } = require("../../config");
const { sender } = require("../../infrastructure/notify");
const { badRequest, unauthorized, conflict } = require("../../shared/errors");

const CODE_LENGTH = 6;
const hash = (code, destination) => crypto.createHmac("sha256", config.auth.jwtSecret).update(`${destination}:${code}`).digest("hex");

// ---- destination normalisation ----------------------------------------------

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function normaliseDestination(channel, raw) {
  const v = String(raw || "").trim();
  if (channel === "email") {
    if (!EMAIL.test(v)) throw badRequest("Enter a valid email address");
    return v.toLowerCase();
  }
  // Phone: digits only; 10-digit Indian numbers get +91, otherwise expect a country code.
  const digits = v.replace(/[^\d+]/g, "");
  let e164 = digits.startsWith("+") ? digits : digits.length === 10 ? `+91${digits}` : `+${digits}`;
  if (!/^\+[1-9]\d{7,14}$/.test(e164)) throw badRequest("Enter a valid mobile number with country code");
  return e164;
}

function findUserByDestination(channel, destination) {
  return channel === "email" ? User.findOne({ email: destination }) : User.findOne({ phone: destination });
}

// ---- request ------------------------------------------------------------------

async function request({ purpose, channel, destination: raw }, { ip, send = sender() } = {}) {
  if (!send.channels[channel]) throw badRequest(channel === "sms" ? "SMS codes are not available right now, use email" : "Email codes are not available right now");
  const destination = normaliseDestination(channel, raw);
  const existing = await findUserByDestination(channel, destination);

  if (purpose === "register" && existing) {
    throw conflict(channel === "email" ? "An account with this email already exists. Sign in instead." : "An account with this mobile number already exists. Sign in instead.");
  }

  // Throttle: one code per cooldown window, and a cap per hour per destination.
  const recent = await Otp.findOne({ purpose, channel, destination, createdAt: { $gte: new Date(Date.now() - config.otp.cooldownSeconds * 1000) } });
  if (recent) throw badRequest(`Please wait ${config.otp.cooldownSeconds} seconds before requesting another code`);
  const lastHour = await Otp.countDocuments({ channel, destination, createdAt: { $gte: new Date(Date.now() - 3_600_000) } });
  if (lastHour >= config.otp.maxPerHour) throw badRequest("Too many codes requested. Try again in an hour.");

  // For sign-in we always answer the same way so account existence isn't revealed.
  if (purpose === "login" && !existing) return { sent: true, channel, destination: mask(channel, destination) };

  const code = crypto.randomInt(0, 10 ** CODE_LENGTH).toString().padStart(CODE_LENGTH, "0");
  await Otp.updateMany({ purpose, channel, destination, consumedAt: null }, { $set: { consumedAt: new Date() } }); // invalidate older codes
  await Otp.create({ purpose, channel, destination, codeHash: hash(code, destination), expiresAt: new Date(Date.now() + config.otp.ttlMinutes * 60_000), requestIp: ip });

  const what = purpose === "register" ? "finish creating your account" : "sign in";
  const text = `${code} is your The Bohemian Paradise code to ${what}. It expires in ${config.otp.ttlMinutes} minutes. Never share it.`;
  if (channel === "email") {
    await send.email({ to: destination, subject: `${code} is your code`, text, html: `<p>Use this code to ${what}:</p><p style="font-size:28px;letter-spacing:6px;font-weight:700">${code}</p><p>It expires in ${config.otp.ttlMinutes} minutes. If you didn't request it, ignore this email.</p>` });
  } else {
    await send.sms({ to: destination, text });
  }

  const out = { sent: true, channel, destination: mask(channel, destination), expiresInSeconds: config.otp.ttlMinutes * 60 };
  if (send.name === "console" && !config.isProd) out.devCode = code; // local development only
  return out;
}

function mask(channel, d) {
  if (channel === "email") {
    const [u, h] = d.split("@");
    return `${u.slice(0, 2)}${"•".repeat(Math.max(1, u.length - 2))}@${h}`;
  }
  return `${d.slice(0, 3)}${"•".repeat(Math.max(1, d.length - 6))}${d.slice(-3)}`;
}

// ---- verify -------------------------------------------------------------------

async function verify({ purpose, channel, destination: raw, code }) {
  const destination = normaliseDestination(channel, raw);
  const otp = await Otp.findOne({ purpose, channel, destination, consumedAt: null }).sort({ createdAt: -1 });
  if (!otp || otp.expiresAt < new Date()) throw unauthorized("That code has expired. Request a new one.");
  if (otp.attempts >= config.otp.maxAttempts) throw unauthorized("Too many wrong attempts. Request a new code.");
  const ok = crypto.timingSafeEqual(Buffer.from(otp.codeHash), Buffer.from(hash(String(code).trim(), destination)));
  if (!ok) {
    otp.attempts += 1;
    await otp.save();
    throw unauthorized(`Incorrect code. ${config.otp.maxAttempts - otp.attempts} attempts left.`);
  }
  otp.consumedAt = new Date();
  await otp.save();
  return { channel, destination };
}

// Short-lived proof that a destination was verified, handed to /auth/register.
function issueVerificationToken({ channel, destination }) {
  return jwt.sign({ typ: "verified", channel, destination }, config.auth.jwtSecret, { expiresIn: `${config.otp.verificationTokenMinutes}m` });
}
function readVerificationToken(token) {
  try {
    const p = jwt.verify(token, config.auth.jwtSecret, { algorithms: ["HS256"] });
    if (p.typ !== "verified") throw new Error("wrong type");
    return { channel: p.channel, destination: p.destination };
  } catch {
    throw unauthorized("Your verification expired. Request a new code.");
  }
}

module.exports = { request, verify, issueVerificationToken, readVerificationToken, normaliseDestination, findUserByDestination };
