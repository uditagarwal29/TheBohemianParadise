const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const User = require("../models/User");
const { signToken, requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { wrap, unauthorized, conflict } = require("../errors");

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { error: "Too many attempts, try again later" },
});

const credentials = {
  email: { type: "email", required: true },
  password: { type: "string", required: true, min: 8, max: 128 },
};

// POST /api/auth/register  { name, email, password }
router.post(
  "/register",
  authLimiter,
  validate({ name: { type: "string", required: true, min: 1, max: 80 }, ...credentials }),
  wrap(async (req, res) => {
    const { name, email, password } = req.data;
    if (await User.exists({ email })) throw conflict("An account with this email already exists");
    const user = new User({ name, email });
    await user.setPassword(password);
    await user.save();
    res.status(201).json({ user: user.toPublic(), accessToken: signToken(user) });
  })
);

// POST /api/auth/login  { email, password }
router.post(
  "/login",
  authLimiter,
  validate(credentials),
  wrap(async (req, res) => {
    const { email, password } = req.data;
    const user = await User.findOne({ email }).select("+passwordHash");
    // Same message for unknown email and wrong password: don't leak which accounts exist.
    if (!user || user.disabled || !(await user.verifyPassword(password))) {
      throw unauthorized("Invalid email or password");
    }
    res.json({ user: user.toPublic(), accessToken: signToken(user) });
  })
);

// GET /api/auth/me
router.get("/me", requireAuth, (req, res) => res.json({ user: req.user.toPublic() }));

// POST /api/auth/logout-all  -> invalidates every issued token for this account
router.post(
  "/logout-all",
  requireAuth,
  wrap(async (req, res) => {
    req.user.tokenVersion = (req.user.tokenVersion || 0) + 1;
    await req.user.save();
    res.json({ ok: true });
  })
);

module.exports = router;
