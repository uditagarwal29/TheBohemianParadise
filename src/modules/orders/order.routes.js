const { Router } = require("express");
const express = require("express");
const { STATES } = require("./order-state");
const { validate } = require("../../shared/http/validate");
const { controller, pageParams } = require("../../shared/http/respond");
const { forbidden } = require("../../shared/errors");
const { addressShape } = require("../users/user.routes");

const { label: _label, ...shippingAddressShape } = addressShape; // eslint-disable-line no-unused-vars
const checkoutShape = {
  items: { type: "array", max: 50, items: { type: "object", shape: { productId: { type: "objectId", required: true }, size: { type: "string", max: 20 }, qty: { type: "integer", required: true, min: 1, max: 20 } } } },
  addressId: { type: "objectId" },
  shippingAddress: { type: "object", shape: shippingAddressShape },
  paymentMethod: { type: "string", required: true, enum: ["stripe", "manual"] },
  customerNote: { type: "string", max: 500 },
};

function orderRoutes({ checkout, orderService: orders, guards }) {
  const router = Router();
  const { requireAuth, requireAdmin } = guards;

  router.get("/payment-methods", controller(() => checkout.paymentOptions()));
  router.post("/checkout", requireAuth, validate(checkoutShape), controller(async (req) => ({ status: 201, body: await checkout.checkout(req.user, req.data) })));
  router.get("/me", requireAuth, controller(async (req) => ({ orders: await orders.listMine(req.user._id) })));
  router.get("/find/:userId", requireAuth, controller((req) => { // legacy path
    if (!req.user.isAdmin && req.user._id.toString() !== req.params.userId) throw forbidden();
    return orders.listMine(req.params.userId);
  }));

  // admin (declared before /:id)
  router.get("/", requireAdmin, controller((req) => orders.adminList({ status: req.query.status, q: req.query.q, ...pageParams(req.query, { defaultLimit: 50, maxLimit: 200 }) })));
  router.get("/income", requireAdmin, controller(() => orders.incomeByMonth()));
  router.get("/admin/:id", requireAdmin, controller(async (req) => ({ order: await orders.adminGet(req.params.id) })));
  router.patch("/:id/status", requireAdmin, validate({
    status: { type: "string", required: true, enum: STATES },
    note: { type: "string", max: 500 },
    tracking: { type: "object", shape: { carrier: { type: "string", max: 60 }, number: { type: "string", max: 80 }, url: { type: "string", max: 300 } } },
  }), controller(async (req) => ({ order: await orders.setStatus(req.params.id, req.data) })));

  // single order (owner or admin)
  router.get("/:id", requireAuth, controller(async (req) => ({ order: await orders.getOwned(req.user, req.params.id) })));
  router.post("/:id/cancel", requireAuth, controller(async (req) => ({ order: await orders.cancel(req.user, req.params.id) })));
  router.post("/:id/payment-reference", requireAuth, validate({ reference: { type: "string", required: true, min: 4, max: 120 } }),
    controller(async (req) => ({ order: await orders.submitPaymentReference(req.user, req.params.id, req.data.reference) })));
  return router;
}

// Payment-provider webhook. Mounted before express.json() because the signature covers the raw bytes.
function webhookRoutes({ gateway, orderService: orders }) {
  const router = Router();
  router.post("/stripe", express.raw({ type: "application/json" }), async (req, res) => {
    if (!gateway.enabled) return res.status(503).json({ error: "Stripe not configured" });
    let evt;
    try {
      evt = gateway.parseWebhook(req.body, req.headers["stripe-signature"]);
    } catch (e) {
      return res.status(400).json({ error: `Invalid signature: ${e.message}` });
    }
    if (!evt) return res.json({ received: true, ignored: "unhandled event type" });
    try {
      res.json({ received: true, ...(await orders.handleGatewayEvent(evt)) });
    } catch (e) {
      console.error("webhook handling failed", e);
      res.status(500).json({ error: "handler failed" }); // 500 makes Stripe retry
    }
  });
  return router;
}

module.exports = orderRoutes;
module.exports.webhookRoutes = webhookRoutes;
