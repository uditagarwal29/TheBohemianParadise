const router = require("express").Router();
const rateLimit = require("express-rate-limit");
const { config } = require("../../config");
const { requireAuth } = require("../../shared/middleware/auth");
const { validate } = require("../../shared/http/validate");
const { controller } = require("../../shared/http/respond");
const service = require("./auth.service");

const limiter = rateLimit({ ...config.http.authRateLimit, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many attempts, try again later" } });

const credentials = {
  email: { type: "email", required: true },
  password: { type: "string", required: true, min: 8, max: 128 },
};

// GET /api/auth/providers -> which sign-in methods the UI should offer
router.get("/providers", controller(() => service.providers()));

router.post("/register", limiter, validate({ name: { type: "string", required: true, min: 1, max: 80 }, ...credentials }),
  controller(async (req) => ({ status: 201, body: await service.register(req.data) })));

router.post("/login", limiter, validate(credentials), controller((req) => service.login(req.data)));

// POST /api/auth/google { idToken } -> sign in or create the account
router.post("/google", limiter, validate({ idToken: { type: "string", required: true, max: 4096 } }),
  controller(async (req) => {
    const result = await service.loginWithGoogle(req.data, req.app.get("googleVerifier"));
    return { status: result.created ? 201 : 200, body: result };
  }));

router.get("/me", requireAuth, controller((req) => ({ user: req.user.toPublic() })));

// POST /api/auth/set-password { password }  (Google-only accounts)
router.post("/set-password", requireAuth, validate({ password: { type: "string", required: true, min: 8, max: 128 } }),
  controller(async (req) => { await service.setInitialPassword(req.user._id, req.data.password); return { ok: true, reauthenticate: true }; }));

router.post("/logout-all", requireAuth, controller(async (req) => { await service.logoutAll(req.user); return { ok: true }; }));

module.exports = router;
