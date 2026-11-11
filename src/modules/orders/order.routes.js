const router = require("express").Router();
const { ORDER_STATUS } = require("./order.model");
const { requireAuth, requireAdmin } = require("../../shared/middleware/auth");
const { validate } = require("../../shared/http/validate");
const { controller, pageParams } = require("../../shared/http/respond");
const { forbidden } = require("../../shared/errors");
const service = require("./order.service");

const addressShape = {
  fullName: { type: "string", required: true, max: 80 },
  phone: { type: "string", required: true, max: 20 },
  line1: { type: "string", required: true, max: 120 },
  line2: { type: "string", max: 120 },
  city: { type: "string", required: true, max: 60 },
  state: { type: "string", required: true, max: 60 },
  postalCode: { type: "string", required: true, max: 12 },
  country: { type: "string", max: 2 },
};

router.get("/payment-methods", controller(() => service.paymentMethods()));

router.post("/checkout", requireAuth, validate({
  items: { type: "array", max: 50, items: { type: "object", shape: { productId: { type: "objectId", required: true }, size: { type: "string", max: 20 }, qty: { type: "integer", required: true, min: 1, max: 20 } } } },
  addressId: { type: "objectId" },
  shippingAddress: { type: "object", shape: addressShape },
  paymentMethod: { type: "string", required: true, enum: ["stripe", "manual"] },
  customerNote: { type: "string", max: 500 },
}), controller(async (req) => ({ status: 201, body: await service.checkout(req.user, req.data) })));

router.get("/me", requireAuth, controller(async (req) => ({ orders: await service.listMine(req.user._id) })));

// Legacy path used by the old frontend.
router.get("/find/:userId", requireAuth, controller((req) => {
  if (!req.user.isAdmin && req.user._id.toString() !== req.params.userId) throw forbidden();
  return service.listMine(req.params.userId);
}));

// ---- admin (declared before /:id) ------------------------------------------
router.get("/", requireAdmin, controller((req) => service.adminList({ status: req.query.status, q: req.query.q, ...pageParams(req.query, { defaultLimit: 50, maxLimit: 200 }) })));
router.get("/income", requireAdmin, controller(() => service.incomeByMonth()));
router.get("/admin/:id", requireAdmin, controller(async (req) => ({ order: await service.adminGet(req.params.id) })));
router.patch("/:id/status", requireAdmin, validate({
  status: { type: "string", required: true, enum: ORDER_STATUS },
  note: { type: "string", max: 500 },
  tracking: { type: "object", shape: { carrier: { type: "string", max: 60 }, number: { type: "string", max: 80 }, url: { type: "string", max: 300 } } },
}), controller(async (req) => ({ order: await service.setStatus(req.params.id, req.data) })));

// ---- single order (owner or admin) ------------------------------------------
router.get("/:id", requireAuth, controller(async (req) => ({ order: await service.getOwned(req.user, req.params.id) })));
router.post("/:id/cancel", requireAuth, controller(async (req) => ({ order: await service.cancel(req.user, req.params.id) })));
router.post("/:id/payment-reference", requireAuth, validate({ reference: { type: "string", required: true, min: 4, max: 120 } }),
  controller(async (req) => ({ order: await service.submitPaymentReference(req.user, req.params.id, req.data.reference) })));

module.exports = router;
