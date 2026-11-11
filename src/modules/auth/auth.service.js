const User = require("../users/user.model");
const { signToken } = require("../../shared/middleware/auth");
const { unauthorized, conflict, badRequest } = require("../../shared/errors");
const google = require("../../infrastructure/auth/google");
const { config } = require("../../config");

async function register({ name, email, password }) {
  if (await User.exists({ email })) throw conflict("An account with this email already exists");
  const user = new User({ name, email, emailVerified: false });
  await user.setPassword(password);
  await user.save();
  return { user: user.toPublic(), accessToken: signToken(user) };
}

async function login({ email, password }) {
  const user = await User.findOne({ email }).select("+passwordHash");
  // Same message for unknown email and wrong password: don't leak which accounts exist.
  if (!user || user.disabled) throw unauthorized("Invalid email or password");
  if (!user.passwordHash) {
    // Account exists but was created with Google. Tell them how to get in (the email is theirs; they just typed it).
    throw unauthorized("This account uses Google sign-in. Continue with Google, or set a password from your account page after signing in.");
  }
  if (!(await user.verifyPassword(password))) throw unauthorized("Invalid email or password");
  return { user: user.toPublic(), accessToken: signToken(user) };
}

// Sign in or sign up with a Google ID token. Links to an existing account with the
// same verified email, so a customer who registered with a password can also use Google.
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

// For Google-only accounts: set a first password (no current password to check).
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

function providers() {
  return { password: true, google: google.enabled() ? { clientId: config.auth.googleClientId } : false };
}

module.exports = { register, login, loginWithGoogle, setInitialPassword, logoutAll, providers };
