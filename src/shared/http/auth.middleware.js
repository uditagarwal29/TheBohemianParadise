const { unauthorized, forbidden, wrap } = require("../errors");

function extractToken(req) {
  // Standard header first; the legacy frontend sent `token: Bearer <jwt>`.
  const header = req.headers.authorization || req.headers.token || "";
  const [scheme, value] = header.split(" ");
  return scheme && scheme.toLowerCase() === "bearer" && value ? value : null;
}

// Factory: guards are built from injected collaborators (token service + user repository)
// instead of reaching for globals, so they can be tested with fakes.
function createAuthGuards({ tokenService, users }) {
  async function resolveUser(req) {
    const token = extractToken(req);
    if (!token) return null;
    const payload = tokenService.verify(token);
    if (!payload) throw unauthorized("Invalid or expired token");
    // Role and status come from the database on every request, never from the token,
    // so demoting a user or changing a password takes effect immediately.
    const user = await users.findById(payload.sub);
    if (!user || user.disabled) throw unauthorized("Account not available");
    if ((user.tokenVersion || 0) !== (payload.v || 0)) throw unauthorized("Session expired, sign in again");
    req.authPayload = payload;
    return user;
  }

  const optionalAuth = wrap(async (req, res, next) => {
    if (extractToken(req)) req.user = await resolveUser(req);
    next();
  });
  const requireAuth = wrap(async (req, res, next) => {
    const user = await resolveUser(req);
    if (!user) throw unauthorized();
    req.user = user;
    next();
  });
  const requireAdmin = [requireAuth, (req, res, next) => (req.user.isAdmin ? next() : next(forbidden("Admin only")))];

  return { optionalAuth, requireAuth, requireAdmin };
}

module.exports = { createAuthGuards, extractToken };
