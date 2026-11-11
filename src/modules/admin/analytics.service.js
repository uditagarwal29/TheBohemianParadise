// Read-only aggregations for the admin dashboard. Nothing here mutates data.
const Order = require("../orders/order.model");
const Product = require("../catalog/product.model");
const User = require("../users/user.model");
const { PAID_STATES } = require("../orders/order.service");

const dayKey = { $dateToString: { format: "%Y-%m-%d", date: "$payment.paidAt" } };
// All day bucketing is in UTC so the keys match $dateToString.
const startOfDay = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

async function summary() {
  const now = new Date();
  const today = startOfDay(now);
  const d30 = new Date(today.getTime() - 30 * 86_400_000);
  const d60 = new Date(today.getTime() - 60 * 86_400_000);
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));

  const revenue = async (from, to) => {
    const [r] = await Order.aggregate([
      { $match: { status: { $in: PAID_STATES }, "payment.paidAt": { $gte: from, ...(to ? { $lt: to } : {}) } } },
      { $group: { _id: null, total: { $sum: "$total" }, orders: { $sum: 1 } } },
    ]);
    return r || { total: 0, orders: 0 };
  };

  const [last30, prev30, thisMonth, allTime, byStatus, pendingManual, lowStock, soldOut, customers, newCustomers30, activeProducts] = await Promise.all([
    revenue(d30),
    revenue(d60, d30),
    revenue(monthStart),
    revenue(new Date(0)),
    Order.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]),
    Order.countDocuments({ status: "pending_payment", "payment.method": "manual", "payment.reference": { $exists: true, $ne: "" } }),
    Product.find({ active: true, $or: [{ variants: { $size: 0 }, stock: { $gt: 0, $lte: 2 } }, { "variants.stock": { $gt: 0, $lte: 2 } }] }).select("title slug stock variants images").limit(10),
    Product.countDocuments({ active: true, stock: { $lte: 0 }, $nor: [{ "variants.stock": { $gt: 0 } }] }),
    User.countDocuments({ isAdmin: false }),
    User.countDocuments({ isAdmin: false, createdAt: { $gte: d30 } }),
    Product.countDocuments({ active: true }),
  ]);

  const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : a ? 100 : 0);
  return {
    revenue: {
      last30: last30.total,
      prev30: prev30.total,
      changePct: pct(last30.total, prev30.total),
      thisMonth: thisMonth.total,
      allTime: allTime.total,
      avgOrder: last30.orders ? Math.round(last30.total / last30.orders) : 0,
    },
    orders: {
      last30: last30.orders,
      prev30: prev30.orders,
      byStatus: Object.fromEntries(byStatus.map((s) => [s._id, s.n])),
      awaitingConfirmation: pendingManual,
    },
    catalogue: { active: activeProducts, soldOut, lowStock },
    customers: { total: customers, new30: newCustomers30 },
  };
}

// Daily revenue + orders for the last N days (zero-filled).
async function revenueByDay(days = 30) {
  const from = new Date(startOfDay(new Date()).getTime() - (days - 1) * 86_400_000);
  const rows = await Order.aggregate([
    { $match: { status: { $in: PAID_STATES }, "payment.paidAt": { $gte: from } } },
    { $group: { _id: dayKey, total: { $sum: "$total" }, orders: { $sum: 1 } } },
  ]);
  const map = new Map(rows.map((r) => [r._id, r]));
  const out = [];
  for (let i = 0; i < days; i++) {
    const d = new Date(from.getTime() + i * 86_400_000);
    const k = d.toISOString().slice(0, 10);
    out.push({ date: k, total: map.get(k)?.total || 0, orders: map.get(k)?.orders || 0 });
  }
  return out;
}

async function topProducts(limit = 8) {
  const rows = await Order.aggregate([
    { $match: { status: { $in: PAID_STATES } } },
    { $unwind: "$items" },
    { $group: { _id: "$items.productId", title: { $first: "$items.title" }, image: { $first: "$items.image" }, qty: { $sum: "$items.qty" }, revenue: { $sum: { $multiply: ["$items.unitPrice", "$items.qty"] } } } },
    { $sort: { revenue: -1 } },
    { $limit: limit },
  ]);
  return rows.map((r) => ({ productId: r._id, title: r.title, image: r.image, qty: r.qty, revenue: r.revenue }));
}

const mostViewed = (limit = 8) => Product.find({ active: true }).sort({ views: -1 }).limit(limit).select("title slug images views sold stock variants");

async function salesByCategory() {
  const rows = await Order.aggregate([
    { $match: { status: { $in: PAID_STATES } } },
    { $unwind: "$items" },
    { $lookup: { from: "products", localField: "items.productId", foreignField: "_id", as: "p" } },
    { $unwind: { path: "$p", preserveNullAndEmptyArrays: true } },
    { $unwind: { path: "$p.categories", preserveNullAndEmptyArrays: true } },
    { $group: { _id: { $ifNull: ["$p.categories", "uncategorised"] }, revenue: { $sum: { $multiply: ["$items.unitPrice", "$items.qty"] } }, qty: { $sum: "$items.qty" } } },
    { $sort: { revenue: -1 } },
  ]);
  return rows.map((r) => ({ category: r._id, revenue: r.revenue, qty: r.qty }));
}

const recentOrders = (limit = 10) => Order.find().sort({ createdAt: -1 }).limit(limit).populate("userId", "name email");

async function dashboard() {
  const [sum, daily, top, viewed, cats, recent] = await Promise.all([summary(), revenueByDay(30), topProducts(), mostViewed(), salesByCategory(), recentOrders()]);
  return { summary: sum, revenueByDay: daily, topProducts: top, mostViewed: viewed, salesByCategory: cats, recentOrders: recent, generatedAt: new Date() };
}

module.exports = { summary, revenueByDay, topProducts, mostViewed, salesByCategory, recentOrders, dashboard };
