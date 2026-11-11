const jwt = require("jsonwebtoken");
const { config } = require("../../config");
const User = require("../../modules/users/user.model");
const { unauthorized, forbidden, wrap } = require("../errors");

function extractToken(req) {
  // Standard header first; the legacy frontend sent `token: Bearer <jwt>`.
  const header = req.headers.authorization || req.headers.token || "";
  const [scheme, value] = header.split(" ");
  if (scheme && scheme.toLowerCase() === "bearer" && value) return value;
  return null;
}

function signToken(user) {
  return jwt.sign({ sub: user._id.toString(), v: user.tokenVersion || 0 }, config.auth.jwtSecret, {
    expiresIn: config.auth.jwtExpiresIn,
  });
}

async function resolveUser(req) {
  const token = extractToken(req);
  if (!token) return null;
  let payload;
  try {
    payload = jwt.verify(token, config.auth.jwtSecret, { algorithms: ["HS256"] });
  } catch {
    throw unauthorized("Invalid or expired token");
  }
  // Role and status come from the database on every request, never from the token,
  // so demoting a user or changing a password takes effect immediately.
  const user = await User.findById(payload.sub);
  if (!user || user.disabled) throw unauthorized("Account not available");
  if ((user.tokenVersion || 0) !== (payload.v || 0)) throw unauthorized("Session expired, sign in again");
  return user;
}

// Attaches req.user when a valid token is present; anonymous otherwise.
const optionalAuth = wrap(async (req, res, next) => {
  if (!extractToken(req)) return next();
  req.user = await resolveUser(req);
  next();
});

const requireAuth = wrap(async (req, res, next) => {
  const user = await resolveUser(req);
  if (!user) throw unauthorized();
  req.user = user;
  next();
});

const requireAdmin = [
  requireAuth,
  (req, res, next) => (req.user.isAdmin ? next() : next(forbidden("Admin only"))),
];

// Owner of :id (user id) or admin.
const requireSelfOrAdmin = [
  requireAuth,
  (req, res, next) =>
    req.user.isAdmin || req.user._id.toString() === req.params.id ? next() : next(forbidden()),
];

module.exports = { signToken, optionalAuth, requireAuth, requireAdmin, requireSelfOrAdmin };
