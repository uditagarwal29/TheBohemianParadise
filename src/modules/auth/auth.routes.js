const { Router } = require("express");
const rateLimit = require("express-rate-limit");
const { validate } = require("../../shared/http/validate");
const { controller } = require("../../shared/http/respond");

const credentials = {
  email: { type: "email", required: true },
  password: { type: "string", required: true, min: 8, max: 128 },
};

// Route factories receive the container: HTTP surface only, no business logic.
module.exports = function authRoutes({ auth, guards, config }) {
  const router = Router();
  const limiter = rateLimit({ ...config.http.authRateLimit, standardHeaders: "draft-7", legacyHeaders: false, message: { error: "Too many attempts, try again later" } });

  router.get("/providers", controller(() => auth.providers()));
  router.post("/register", limiter, validate({ name: { type: "string", required: true, min: 1, max: 80 }, ...credentials }),
    controller(async (req) => ({ status: 201, body: await auth.register(req.data) })));
  router.post("/login", limiter, validate(credentials), controller((req) => auth.login(req.data)));
  router.post("/google", limiter, validate({ idToken: { type: "string", required: true, max: 4096 } }),
    controller(async (req) => {
      const result = await auth.loginWithProvider("google", req.data.idToken);
      return { status: result.created ? 201 : 200, body: result };
    }));
  router.get("/me", guards.requireAuth, controller((req) => ({ user: req.user.toPublic() })));
  router.post("/set-password", guards.requireAuth, validate({ password: credentials.password }),
    controller(async (req) => { await auth.setInitialPassword(req.user._id, req.data.password); return { ok: true, reauthenticate: true }; }));
  router.post("/logout-all", guards.requireAuth, controller(async (req) => { await auth.logoutAll(req.user); return { ok: true }; }));
  return router;
};
