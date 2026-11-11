const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const { config } = require("../../config");
const { requireAuth } = require("../../shared/middleware/auth");
const { validate } = require("../../shared/http/validate");
const { controller } = require("../../shared/http/respond");
const service = require("./auth.service");

const limiter = rateLimit({ ...config.http.authRateLimit, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many attempts, try again later" } });
const otpLimiter = rateLimit({ windowMs: 15 * 60_000, limit: 30, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many code requests, try again later" } });

const password = { type: "string", required: true, min: 8, max: 128 };
const otpTarget = {
  purpose: { type: "string", required: true, enum: ["register", "login"] },
  channel: { type: "string", required: true, enum: ["email", "sms"] },
  destination: { type: "string", required: true, min: 3, max: 120 },
};

// GET /api/auth/providers -> which sign-in methods the UI should offer
router.get("/providers", controller((req) => service.providers(req.app.get("otpSender"))));

// ---- one-time codes ---------------------------------------------------------------
// POST /api/auth/otp/request { purpose, channel, destination }
router.post("/otp/request", otpLimiter, validate(otpTarget),
  controller((req) => service.requestOtp(req.data, { ip: req.ip, send: req.app.get("otpSender") })));

// POST /api/auth/otp/verify { purpose, channel, destination, code }
//   register -> { verificationToken }   login -> { user, accessToken, canResetPassword }
router.post("/otp/verify", limiter, validate({ ...otpTarget, code: { type: "string", required: true, min: 4, max: 8 } }),
  controller((req) => service.verifyOtp(req.data)));

// POST /api/auth/register { name, email, phone?, password, verificationToken }
router.post("/register", limiter, validate({
  name: { type: "string", required: true, min: 1, max: 80 },
  email: { type: "email", required: true },
  phone: { type: "string", max: 20 },
  password,
  verificationToken: { type: "string", required: true, max: 2048 },
}), controller(async (req) => ({ status: 201, body: await service.register(req.data) })));

router.post("/login", limiter, validate({ email: { type: "email", required: true }, password }), controller((req) => service.login(req.data)));

// POST /api/auth/reset-password { password }  (within minutes of an OTP sign-in)
router.post("/reset-password", requireAuth, validate({ password }),
  controller(async (req) => { await service.resetPassword(req.user, req.authPayload, req.data.password); return { ok: true, reauthenticate: true }; }));

// ---- google -------------------------------------------------------------------------
router.post("/google", limiter, validate({ idToken: { type: "string", required: true, max: 4096 } }),
  controller(async (req) => {
    const result = await service.loginWithGoogle(req.data, req.app.get("googleVerifier"));
    return { status: result.created ? 201 : 200, body: result };
  }));

// ---- session ------------------------------------------------------------------------
router.get("/me", requireAuth, controller((req) => ({ user: req.user.toPublic() })));

router.post("/set-password", requireAuth, validate({ password }),
  controller(async (req) => { await service.setInitialPassword(req.user._id, req.data.password); return { ok: true, reauthenticate: true }; }));

router.post("/logout-all", requireAuth, controller(async (req) => { await service.logoutAll(req.user); return { ok: true }; }));

module.exports = router;
