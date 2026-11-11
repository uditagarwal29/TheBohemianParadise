const router = require("express").Router();
const { requireAuth } = require("../../shared/middleware/auth");
const { validate } = require("../../shared/http/validate");
const { controller } = require("../../shared/http/respond");
const service = require("./cart.service");

const lineShape = {
  productId: { type: "objectId", required: true },
  size: { type: "string", max: 20 },
  qty: { type: "integer", required: true, min: 1, max: 20 },
  unitPrice: { type: "number" }, // what the client last saw, to flag price changes
};
const itemsShape = { items: { type: "array", required: true, max: 50, items: { type: "object", shape: lineShape } } };

// Guests: price-check a browser-side cart (no auth).
router.post("/validate", validate(itemsShape), controller((req) => service.validateGuest(req.data.items)));

// Signed-in: one server-side cart per account.
router.get("/me", requireAuth, controller((req) => service.get(req.user._id)));
router.put("/me", requireAuth, validate(itemsShape), controller((req) => service.replace(req.user._id, req.data.items)));
router.post("/me/merge", requireAuth, validate(itemsShape), controller((req) => service.merge(req.user._id, req.data.items)));
router.post("/me/items", requireAuth, validate(lineShape), controller(async (req) => ({ status: 201, body: await service.addLine(req.user._id, req.data) })));
router.patch("/me/items/:productId", requireAuth, validate({ qty: { type: "integer", required: true, min: 0, max: 20 } }),
  controller((req) => service.setQty(req.user._id, req.params.productId, req.query.size || null, req.data.qty)));
router.delete("/me/items/:productId", requireAuth, controller((req) => service.removeLine(req.user._id, req.params.productId, req.query.size || null)));
router.delete("/me", requireAuth, controller((req) => service.clear(req.user._id)));

module.exports = router;
