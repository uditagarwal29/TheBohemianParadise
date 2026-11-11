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

router.post("/register", limiter, validate({ name: { type: "string", required: true, min: 1, max: 80 }, ...credentials }),
  controller(async (req) => ({ status: 201, body: await service.register(req.data) })));

router.post("/login", limiter, validate(credentials), controller((req) => service.login(req.data)));

router.get("/me", requireAuth, controller((req) => ({ user: req.user.toPublic() })));

router.post("/logout-all", requireAuth, controller(async (req) => { await service.logoutAll(req.user); return { ok: true }; }));

module.exports = router;
