const Order = require("./order.model");
const { ORDER_STATUS } = require("./order.model");
const Cart = require("../cart/cart.model");
const { priceItems } = require("../cart/pricing.service");
const stock = require("../inventory/stock.service");
const payments = require("../../infrastructure/payments/stripe");
const { config } = require("../../config");
const { badRequest, notFound, forbidden, conflict } = require("../../shared/errors");

const PAID_STATES = ["paid", "processing", "shipped", "delivered"];

// Admin-driven status machine. Stripe/system transitions live in the webhook and sweeper.
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

function paymentMethods() {
  const methods = [{ id: "manual", label: "UPI / bank transfer (confirmed by the seller)" }];
  if (payments.enabled()) methods.unshift({ id: "stripe", label: "Card / UPI via Stripe" });
  const { currency, shippingFlat, freeShippingAbove } = config.store;
  return { methods, currency, shippingFlat, freeShippingAbove };
}

function resolveAddress(user, { shippingAddress, addressId }) {
  if (shippingAddress) return shippingAddress;
  if (addressId) {
    const saved = user.addresses.find((a) => a._id.toString() === addressId);
    if (!saved) throw badRequest("Saved address not found");
    const a = saved.toObject();
    delete a._id;
    return a;
  }
  throw badRequest("A shipping address is required");
}

async function checkout(user, data) {
  const { paymentMethod, customerNote } = data;
  if (paymentMethod === "stripe" && !payments.enabled()) throw badRequest("Card payments are not available right now");

  const address = resolveAddress(user, data);

  // Items default to the saved cart; prices are always recomputed here.
  let rawItems = data.items;
  const fromCart = !rawItems;
  if (fromCart) rawItems = (await Cart.findOne({ userId: user._id }))?.items || [];
  if (!rawItems.length) throw badRequest("Your cart is empty");

  const priced = await priceItems(rawItems);
  const blocking = priced.problems.filter((p) => p.code !== "price_changed");
  if (blocking.length) throw conflict("Some items in your cart need attention", { problems: priced.problems, cart: priced });

  await stock.reserveAll(priced.items.map(({ productId, size, qty }) => ({ productId, size, qty })));

  const holdMinutes = paymentMethod === "manual" ? Math.max(config.store.reservationMinutes, config.store.manualReservationMinutes) : config.store.reservationMinutes;
  const order = new Order({
    userId: user._id,
    items: priced.items.map(({ productId, title, image, size, unitPrice, qty }) => ({ productId, title, image, size, unitPrice, qty })),
    subtotal: priced.subtotal,
    shipping: priced.shipping,
    total: priced.total,
    currency: priced.currency,
    shippingAddress: address,
    customerNote,
    payment: { method: paymentMethod, provider: paymentMethod },
    reservedUntil: new Date(Date.now() + holdMinutes * 60_000),
  });
  order.history.push({ status: "pending_payment", by: "customer" });

  let clientSecret = null;
  try {
    if (paymentMethod === "stripe") {
      const intent = await payments.createPaymentIntent(order);
      order.payment.intentId = intent.id;
      order.payment.status = intent.status;
      clientSecret = intent.client_secret;
    }
    await order.save();
  } catch (e) {
    await stock.releaseOrder(order, "system", "Order creation failed");
    throw e;
  }

  if (fromCart) await Cart.updateOne({ userId: user._id }, { $set: { items: [] } });

  return {
    order,
    payment: {
      method: paymentMethod,
      clientSecret,
      instructions: paymentMethod === "manual" ? "Pay via UPI/bank transfer and share the reference; the seller confirms within 24h." : undefined,
    },
    priceChanges: priced.problems.filter((p) => p.code === "price_changed"),
  };
}

const listMine = (userId) => Order.find({ userId }).sort({ createdAt: -1 }).limit(100);

async function getOwned(user, id) {
  const order = await Order.findById(id);
  if (!order) throw notFound("Order not found");
  if (!user.isAdmin && !order.userId.equals(user._id)) throw forbidden();
  return order;
}

async function cancel(user, id) {
  const order = await getOwned(user, id);
  if (order.status !== "pending_payment") throw badRequest("Only unpaid orders can be cancelled");
  await payments.cancelPaymentIntent(order.payment.intentId);
  order.transition("cancelled", user.isAdmin ? "admin" : "customer");
  await stock.releaseOrder(order, "system");
  await order.save();
  return order;
}

async function submitPaymentReference(user, id, reference) {
  const order = await getOwned(user, id);
  if (order.payment.method !== "manual" || order.status !== "pending_payment") throw badRequest("Not applicable to this order");
  order.payment.reference = reference;
  order.history.push({ status: order.status, by: "customer", note: "Payment reference submitted" });
  await order.save();
  return order;
}

// ---- admin ----------------------------------------------------------------

async function adminList({ status, q, page, limit, skip }) {
  const filter = {};
  if (status && ORDER_STATUS.includes(status)) filter.status = status;
  if (q) filter.$or = [{ orderNumber: new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }, { "shippingAddress.fullName": new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") }];
  const [orders, total] = await Promise.all([
    Order.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).populate("userId", "name email"),
    Order.countDocuments(filter),
  ]);
  return { orders, page, limit, total, pages: Math.ceil(total / limit) };
}

async function adminGet(id) {
  const order = await Order.findById(id).populate("userId", "name email");
  if (!order) throw notFound("Order not found");
  return order;
}

async function setStatus(id, { status, note, tracking }) {
  const order = await Order.findById(id);
  if (!order) throw notFound("Order not found");
  if (!ADMIN_TRANSITIONS[order.status].includes(status)) throw badRequest(`Cannot move an order from ${order.status} to ${status}`);
  if (status === "paid") {
    order.payment.status = "succeeded";
    order.payment.paidAt = new Date();
    await stock.markSold(order);
  }
  if (status === "cancelled" || status === "refunded") await stock.releaseOrder(order, "admin", "Stock returned");
  if (tracking) order.tracking = tracking;
  order.transition(status, "admin", note);
  await order.save();
  return order;
}

async function incomeByMonth(months = 12) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const rows = await Order.aggregate([
    { $match: { status: { $in: PAID_STATES }, "payment.paidAt": { $gte: since } } },
    { $group: { _id: { y: { $year: "$payment.paidAt" }, m: { $month: "$payment.paidAt" } }, total: { $sum: "$total" }, orders: { $sum: 1 } } },
    { $sort: { "_id.y": 1, "_id.m": 1 } },
  ]);
  return rows.map((r) => ({ year: r._id.y, month: r._id.m, total: r.total, orders: r.orders }));
}

module.exports = { paymentMethods, checkout, listMine, getOwned, cancel, submitPaymentReference, adminList, adminGet, setStatus, incomeByMonth, ADMIN_TRANSITIONS, PAID_STATES };
