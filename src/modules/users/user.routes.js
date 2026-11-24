const { Router } = require("express");
const { validate } = require("../../shared/http/validate");
const { controller, pageParams } = require("../../shared/http/respond");

const addressShape = {
  label: { type: "string", max: 40 },
  fullName: { type: "string", required: true, max: 80 },
  phone: { type: "string", required: true, max: 20 },
  line1: { type: "string", required: true, max: 120 },
  line2: { type: "string", max: 120 },
  city: { type: "string", required: true, max: 60 },
  state: { type: "string", required: true, max: 60 },
  postalCode: { type: "string", required: true, max: 12 },
  country: { type: "string", max: 2 },
};

module.exports = function userRoutes({ userService: users, guards }) {
  const router = Router();
  const { requireAuth, requireAdmin } = guards;

  // self-service
  router.patch("/me", requireAuth, validate({ name: { type: "string", min: 1, max: 80 }, email: { type: "email" } }),
    controller(async (req) => ({ user: await users.updateProfile(req.user, req.data) })));
  router.post("/me/password", requireAuth, validate({ currentPassword: { type: "string", required: true }, newPassword: { type: "string", required: true, min: 8, max: 128 } }),
    controller(async (req) => { await users.changePassword(req.user._id, req.data.currentPassword, req.data.newPassword); return { ok: true, reauthenticate: true }; }));
  router.post("/me/addresses", requireAuth, validate(addressShape), controller(async (req) => ({ status: 201, body: { addresses: await users.addAddress(req.user, req.data) } })));
  router.delete("/me/addresses/:addressId", requireAuth, controller(async (req) => ({ addresses: await users.removeAddress(req.user, req.params.addressId) })));
  router.delete("/me", requireAuth, controller(async (req) => { await users.closeAccount(req.user); return { ok: true }; }));

  // admin
  router.get("/", requireAdmin, controller((req) => users.list({ q: req.query.q, ...pageParams(req.query, { defaultLimit: 50, maxLimit: 200 }) })));
  router.get("/stats", requireAdmin, controller(() => users.signupsByMonth()));
  router.get("/:id", requireAdmin, controller((req) => users.getWithOrders(req.params.id)));
  router.patch("/:id", requireAdmin, validate({ isAdmin: { type: "boolean" }, disabled: { type: "boolean" } }),
    controller(async (req) => ({ user: await users.adminUpdate(req.user, req.params.id, req.data) })));
  return router;
};

module.exports.addressShape = addressShape;
