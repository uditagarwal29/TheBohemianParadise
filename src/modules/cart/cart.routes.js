const { Router } = require("express");
const { validate } = require("../../shared/http/validate");
const { controller } = require("../../shared/http/respond");

const lineShape = {
  productId: { type: "objectId", required: true },
  size: { type: "string", max: 20 },
  qty: { type: "integer", required: true, min: 1, max: 20 },
  unitPrice: { type: "number" }, // what the client last saw, to flag price changes
};
const itemsShape = { items: { type: "array", required: true, max: 50, items: { type: "object", shape: lineShape } } };

module.exports = function cartRoutes({ cart, guards }) {
  const router = Router();
  const { requireAuth } = guards;
  const uid = (req) => req.user._id;

  router.post("/validate", validate(itemsShape), controller((req) => cart.validateGuest(req.data.items))); // guests
  router.get("/me", requireAuth, controller((req) => cart.get(uid(req))));
  router.put("/me", requireAuth, validate(itemsShape), controller((req) => cart.replace(uid(req), req.data.items)));
  router.post("/me/merge", requireAuth, validate(itemsShape), controller((req) => cart.merge(uid(req), req.data.items)));
  router.post("/me/items", requireAuth, validate(lineShape), controller(async (req) => ({ status: 201, body: await cart.addLine(uid(req), req.data) })));
  router.patch("/me/items/:productId", requireAuth, validate({ qty: { type: "integer", required: true, min: 0, max: 20 } }),
    controller((req) => cart.setQty(uid(req), req.params.productId, req.query.size || null, req.data.qty)));
  router.delete("/me/items/:productId", requireAuth, controller((req) => cart.removeLine(uid(req), req.params.productId, req.query.size || null)));
  router.delete("/me", requireAuth, controller((req) => cart.clear(uid(req))));
  return router;
};
