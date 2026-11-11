const router = require("express").Router();
const Order = require("../models/Order");
const Cart = require("../models/Cart");
const { ORDER_STATUS } = require("../models/Order");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { priceItems } = require("../services/cart");
const stock = require("../services/stock");
const payments = require("../services/payments");
const { config } = require("../config");
const { wrap, badRequest, notFound, forbidden, conflict } = require("../errors");

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

// GET /api/orders/payment-methods -> what the checkout page may offer
router.get("/payment-methods", (req, res) => {
  const methods = [{ id: "manual", label: "UPI / bank transfer (confirmed by the seller)" }];
  if (payments.enabled()) methods.unshift({ id: "stripe", label: "Card / UPI via Stripe" });
  res.json({ methods, currency: config.currency, shippingFlat: config.shippingFlat, freeShippingAbove: config.freeShippingAbove });
});

// POST /api/orders/checkout
// { items?: [{productId,size,qty}], addressId? | shippingAddress?, paymentMethod: 'stripe'|'manual', customerNote? }
// Items default to the saved cart. Prices and totals are always recomputed server-side.
router.post(
  "/checkout",
  requireAuth,
  validate({
    items: { type: "array", max: 50, items: { type: "object", shape: { productId: { type: "objectId", required: true }, size: { type: "string", max: 20 }, qty: { type: "integer", required: true, min: 1, max: 20 } } } },
    addressId: { type: "objectId" },
    shippingAddress: { type: "object", shape: addressShape },
    paymentMethod: { type: "string", required: true, enum: ["stripe", "manual"] },
    customerNote: { type: "string", max: 500 },
  }),
  wrap(async (req, res) => {
    const { paymentMethod, customerNote } = req.data;
    if (paymentMethod === "stripe" && !payments.enabled()) throw badRequest("Card payments are not available right now");

    // 1. Address
    let address = req.data.shippingAddress;
    if (!address && req.data.addressId) {
      const saved = req.user.addresses.find((a) => a._id.toString() === req.data.addressId);
      if (!saved) throw badRequest("Saved address not found");
      address = saved.toObject();
      delete address._id;
    }
    if (!address) throw badRequest("A shipping address is required");

    // 2. Items -> priced against the catalogue
    let rawItems = req.data.items;
    let fromCart = false;
    if (!rawItems) {
      const cart = await Cart.findOne({ userId: req.user._id });
      rawItems = cart?.items || [];
      fromCart = true;
    }
    if (!rawItems.length) throw badRequest("Your cart is empty");
    const priced = await priceItems(rawItems);
    const blocking = priced.problems.filter((p) => p.code !== "price_changed");
    if (blocking.length) throw conflict("Some items in your cart need attention", { problems: priced.problems, cart: priced });

    // 3. Reserve stock atomically (fails if someone else bought the last piece)
    const lines = priced.items.map(({ productId, size, qty }) => ({ productId, size, qty }));
    await stock.reserveAll(lines);

    // 4. Create the order
    const order = new Order({
      userId: req.user._id,
      items: priced.items.map(({ productId, title, image, size, unitPrice, qty }) => ({ productId, title, image, size, unitPrice, qty })),
      subtotal: priced.subtotal,
      shipping: priced.shipping,
      total: priced.total,
      currency: priced.currency,
      shippingAddress: address,
      customerNote,
      payment: { method: paymentMethod, provider: paymentMethod === "stripe" ? "stripe" : "manual" },
      reservedUntil: new Date(Date.now() + config.reservationMinutes * 60_000),
    });
    order.history.push({ status: "pending_payment", by: "customer" });

    let clientSecret = null;
    try {
      if (paymentMethod === "stripe") {
        const intent = await payments.createPaymentIntent(order);
        order.payment.intentId = intent.id;
        order.payment.status = intent.status;
        clientSecret = intent.client_secret;
      } else {
        // Manual payments: hold stock longer (seller confirms by hand).
        order.reservedUntil = new Date(Date.now() + Math.max(config.reservationMinutes, 24 * 60) * 60_000);
      }
      await order.save();
    } catch (e) {
      await stock.releaseOrder(order, "system", "Order creation failed");
      throw e;
    }

    if (fromCart) await Cart.updateOne({ userId: req.user._id }, { $set: { items: [] } });

    res.status(201).json({
      order,
      payment: {
        method: paymentMethod,
        clientSecret,
        instructions: paymentMethod === "manual" ? "Pay via UPI/bank transfer and share the reference; the seller confirms within 24h." : undefined,
      },
      priceChanges: priced.problems.filter((p) => p.code === "price_changed"),
    });
  })
);

// GET /api/orders/me
router.get(
  "/me",
  requireAuth,
  wrap(async (req, res) => {
    const orders = await Order.find({ userId: req.user._id }).sort({ createdAt: -1 }).limit(100);
    res.json({ orders });
  })
);

// Legacy path used by the old frontend.
router.get("/find/:userId", requireAuth, (req, res, next) => {
  if (!req.user.isAdmin && req.user._id.toString() !== req.params.userId) return next(forbidden());
  Order.find({ userId: req.params.userId }).sort({ createdAt: -1 }).then((o) => res.json(o), next);
});

// ---- admin list / stats (declared before /:id) ---------------------------

router.get(
  "/",
  requireAdmin,
  wrap(async (req, res) => {
    const filter = {};
    if (req.query.status && ORDER_STATUS.includes(req.query.status)) filter.status = req.query.status;
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const [orders, total] = await Promise.all([
      Order.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).populate("userId", "name email"),
      Order.countDocuments(filter),
    ]);
    res.json({ orders, page, limit, total });
  })
);

router.get(
  "/income",
  requireAdmin,
  wrap(async (req, res) => {
    const since = new Date();
    since.setMonth(since.getMonth() - 12);
    const rows = await Order.aggregate([
      { $match: { status: { $in: ["paid", "processing", "shipped", "delivered"] }, "payment.paidAt": { $gte: since } } },
      { $group: { _id: { y: { $year: "$payment.paidAt" }, m: { $month: "$payment.paidAt" } }, total: { $sum: "$total" }, orders: { $sum: 1 } } },
      { $sort: { "_id.y": 1, "_id.m": 1 } },
    ]);
    res.json(rows.map((r) => ({ year: r._id.y, month: r._id.m, total: r.total, orders: r.orders })));
  })
);

// ---- single order -------------------------------------------------------

async function loadOwnedOrder(req) {
  const order = await Order.findById(req.params.id);
  if (!order) throw notFound("Order not found");
  if (!req.user.isAdmin && !order.userId.equals(req.user._id)) throw forbidden();
  return order;
}

router.get("/:id", requireAuth, wrap(async (req, res) => res.json({ order: await loadOwnedOrder(req) })));

// POST /api/orders/:id/cancel  (customer, only while unpaid)
router.post(
  "/:id/cancel",
  requireAuth,
  wrap(async (req, res) => {
    const order = await loadOwnedOrder(req);
    if (order.status !== "pending_payment") throw badRequest("Only unpaid orders can be cancelled");
    await payments.cancelPaymentIntent(order.payment.intentId);
    order.transition("cancelled", req.user.isAdmin ? "admin" : "customer");
    await stock.releaseOrder(order, "system");
    await order.save();
    res.json({ order });
  })
);

// POST /api/orders/:id/payment-reference  { reference }  (customer, manual payments)
router.post(
  "/:id/payment-reference",
  requireAuth,
  validate({ reference: { type: "string", required: true, min: 4, max: 120 } }),
  wrap(async (req, res) => {
    const order = await loadOwnedOrder(req);
    if (order.payment.method !== "manual" || order.status !== "pending_payment") throw badRequest("Not applicable to this order");
    order.payment.reference = req.data.reference;
    order.history.push({ status: order.status, by: "customer", note: "Payment reference submitted" });
    await order.save();
    res.json({ order });
  })
);

// PATCH /api/orders/:id/status  admin  { status, note?, tracking? }
const ADMIN_TRANSITIONS = {
  pending_payment: ["paid", "cancelled"],
  paid: ["processing", "shipped", "refunded", "cancelled"],
  processing: ["shipped", "refunded", "cancelled"],
  shipped: ["delivered", "refunded"],
  delivered: ["refunded"],
  payment_failed: [],
  cancelled: [],
  refunded: [],
};

router.patch(
  "/:id/status",
  requireAdmin,
  validate({
    status: { type: "string", required: true, enum: ORDER_STATUS },
    note: { type: "string", max: 500 },
    tracking: { type: "object", shape: { carrier: { type: "string", max: 60 }, number: { type: "string", max: 80 }, url: { type: "string", max: 300 } } },
  }),
  wrap(async (req, res) => {
    const order = await Order.findById(req.params.id);
    if (!order) throw notFound("Order not found");
    const { status, note, tracking } = req.data;
    if (!ADMIN_TRANSITIONS[order.status].includes(status)) {
      throw badRequest(`Cannot move an order from ${order.status} to ${status}`);
    }
    if (status === "paid") {
      order.payment.status = "succeeded";
      order.payment.paidAt = new Date();
      await stock.markSold(order);
    }
    if (status === "cancelled" || status === "refunded") {
      await stock.releaseOrder(order, "admin", "Stock returned");
    }
    if (tracking) order.tracking = tracking;
    order.transition(status, "admin", note);
    await order.save();
    res.json({ order });
  })
);

module.exports = router;
