const User = require("../users/user.model");
const { signToken } = require("../../shared/middleware/auth");
const { unauthorized, conflict, badRequest } = require("../../shared/errors");
const google = require("../../infrastructure/auth/google");
const { sender } = require("../../infrastructure/notify");
const { config } = require("../../config");
const otp = require("./otp.service");

// ---- registration (requires a verified email or phone via OTP) ---------------

async function register({ name, email, phone, password, verificationToken }) {
  const verified = otp.readVerificationToken(verificationToken);
  email = email.toLowerCase();
  const phoneE164 = phone ? otp.normaliseDestination("sms", phone) : undefined;

  // The verified destination must be one of the identifiers being registered.
  const matchesEmail = verified.channel === "email" && verified.destination === email;
  const matchesPhone = verified.channel === "sms" && phoneE164 && verified.destination === phoneE164;
  if (!matchesEmail && !matchesPhone) throw badRequest("The verified contact doesn't match the details entered");

  if (await User.exists({ email })) throw conflict("An account with this email already exists");
  if (phoneE164 && (await User.exists({ phone: phoneE164 }))) throw conflict("An account with this mobile number already exists");

  const user = new User({ name, email, phone: phoneE164, emailVerified: matchesEmail, phoneVerified: Boolean(matchesPhone) });
  await user.setPassword(password);
  await user.save();
  return { user: user.toPublic(), accessToken: signToken(user) };
}

// ---- password sign-in -----------------------------------------------------------

async function login({ email, password }) {
  const user = await User.findOne({ email }).select("+passwordHash");
  if (!user || user.disabled) throw unauthorized("Invalid email or password");
  if (!user.passwordHash) {
    throw unauthorized("This account has no password yet. Sign in with Google or a one-time code, then set one from your account page.");
  }
  if (!(await user.verifyPassword(password))) throw unauthorized("Invalid email or password");
  return { user: user.toPublic(), accessToken: signToken(user) };
}

// ---- one-time codes ---------------------------------------------------------------

const requestOtp = (data, ctx) => otp.request(data, ctx);

async function verifyOtp({ purpose, channel, destination, code }) {
  const verified = await otp.verify({ purpose, channel, destination, code });
  if (purpose === "register") {
    return { verified: true, channel, destination: verified.destination, verificationToken: otp.issueVerificationToken(verified) };
  }
  // login: the destination belongs to an existing account (request() only sent a code if it did)
  const user = await otp.findUserByDestination(channel, verified.destination);
  if (!user || user.disabled) throw unauthorized("Account not available");
  if (channel === "email" && !user.emailVerified) user.emailVerified = true;
  if (channel === "sms" && !user.phoneVerified) user.phoneVerified = true;
  await user.save();
  // `otp` + issued-at let /auth/reset-password accept a new password briefly without the old one.
  return { user: user.toPublic(), accessToken: signToken(user, { via: "otp" }), canResetPassword: true };
}

// After an OTP sign-in (forgot password), set a new password within the reset window.
async function resetPassword(user, authPayload, password) {
  const fresh = authPayload?.via === "otp" && Date.now() / 1000 - authPayload.iat < config.otp.resetWindowMinutes * 60;
  if (!fresh) throw unauthorized("Sign in with a one-time code first to reset your password");
  const doc = await User.findById(user._id).select("+passwordHash");
  await doc.setPassword(password); // bumps tokenVersion: all sessions, including this one, must sign in again
  await doc.save();
}

// ---- google ------------------------------------------------------------------------

async function loginWithGoogle({ idToken }, verify = google.verifyIdToken) {
  if (!google.enabled()) throw badRequest("Google sign-in is not available");
  let profile;
  try {
    profile = await verify(idToken);
  } catch {
    throw unauthorized("Google sign-in failed, please try again");
  }
  if (!profile.email) throw unauthorized("Your Google account has no verified email");

  let user = await User.findOne({ $or: [{ googleId: profile.sub }, { email: profile.email }] }).select("+passwordHash");
  let created = false;
  if (!user) {
    user = new User({ name: profile.name, email: profile.email, googleId: profile.sub, avatar: profile.picture, emailVerified: true });
    created = true;
  } else {
    if (user.disabled) throw unauthorized("Account not available");
    if (!user.googleId) user.googleId = profile.sub;
    if (!user.avatar && profile.picture) user.avatar = profile.picture;
    user.emailVerified = true;
  }
  await user.save();
  return { user: user.toPublic(), accessToken: signToken(user), created };
}

async function setInitialPassword(userId, password) {
  const user = await User.findById(userId).select("+passwordHash");
  if (user.passwordHash) throw badRequest("You already have a password; use change password instead");
  await user.setPassword(password);
  await user.save();
}

async function logoutAll(user) {
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
}

function providers(send = sender()) {
  return {
    password: true,
    google: google.enabled() ? { clientId: config.auth.googleClientId } : false,
    otp: { email: Boolean(send.channels.email), sms: Boolean(send.channels.sms) },
  };
}

module.exports = { register, login, requestOtp, verifyOtp, resetPassword, loginWithGoogle, setInitialPassword, logoutAll, providers };
