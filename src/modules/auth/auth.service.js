const User = require("../users/user.model");
const { signToken } = require("../../shared/middleware/auth");
const { unauthorized, conflict } = require("../../shared/errors");

async function register({ name, email, password }) {
  if (await User.exists({ email })) throw conflict("An account with this email already exists");
  const user = new User({ name, email });
  await user.setPassword(password);
  await user.save();
  return { user: user.toPublic(), accessToken: signToken(user) };
}

async function login({ email, password }) {
  const user = await User.findOne({ email }).select("+passwordHash");
  // Same message for unknown email and wrong password: don't leak which accounts exist.
  if (!user || user.disabled || !(await user.verifyPassword(password))) throw unauthorized("Invalid email or password");
  return { user: user.toPublic(), accessToken: signToken(user) };
}

async function logoutAll(user) {
  user.tokenVersion = (user.tokenVersion || 0) + 1;
  await user.save();
}

module.exports = { register, login, logoutAll };
