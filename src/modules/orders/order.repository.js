const { BaseRepository } = require("../../shared/kernel/repository");
const Order = require("./order.model");
const { escapeRegex } = require("../users/user.repository");

class OrderRepository extends BaseRepository {
  constructor() {
    super(Order);
  }
  forUser(userId, limit = 100) {
    return this.find({ userId }, { sort: { createdAt: -1 }, limit });
  }
  findByIntent(intentId) {
    return this.findOne({ "payment.intentId": intentId });
  }
  findWithCustomer(id) {
    return this.findById(id).populate("userId", "name email");
  }
  staleReservations(limit = 100) {
    return this.find({ status: "pending_payment", stockReleased: false, reservedUntil: { $lt: new Date() } }, { limit });
  }
  adminFilter({ status, q, validStatuses }) {
    const filter = {};
    if (status && validStatuses.includes(status)) filter.status = status;
    if (q) {
      const rx = new RegExp(escapeRegex(q), "i");
      filter.$or = [{ orderNumber: rx }, { "shippingAddress.fullName": rx }];
    }
    return filter;
  }
  countByStatus() {
    return this.aggregate([{ $group: { _id: "$status", n: { $sum: 1 } } }]).then((rows) => Object.fromEntries(rows.map((s) => [s._id, s.n])));
  }
  revenueBetween(states, from, to) {
    return this.aggregate([
      { $match: { status: { $in: states }, "payment.paidAt": { $gte: from, ...(to ? { $lt: to } : {}) } } },
      { $group: { _id: null, total: { $sum: "$total" }, orders: { $sum: 1 } } },
    ]).then(([r]) => r || { total: 0, orders: 0 });
  }
  revenueByDay(states, from) {
    return this.aggregate([
      { $match: { status: { $in: states }, "payment.paidAt": { $gte: from } } },
      { $group: { _id: { $dateToString: { format: "%Y-%m-%d", date: "$payment.paidAt" } }, total: { $sum: "$total" }, orders: { $sum: 1 } } },
    ]);
  }
  revenueByMonth(states, since) {
    return this.aggregate([
      { $match: { status: { $in: states }, "payment.paidAt": { $gte: since } } },
      { $group: { _id: { y: { $year: "$payment.paidAt" }, m: { $month: "$payment.paidAt" } }, total: { $sum: "$total" }, orders: { $sum: 1 } } },
      { $sort: { "_id.y": 1, "_id.m": 1 } },
    ]).then((rows) => rows.map((r) => ({ year: r._id.y, month: r._id.m, total: r.total, orders: r.orders })));
  }
  topProducts(states, limit) {
    return this.aggregate([
      { $match: { status: { $in: states } } },
      { $unwind: "$items" },
      { $group: { _id: "$items.productId", title: { $first: "$items.title" }, image: { $first: "$items.image" }, qty: { $sum: "$items.qty" }, revenue: { $sum: { $multiply: ["$items.unitPrice", "$items.qty"] } } } },
      { $sort: { revenue: -1 } },
      { $limit: limit },
    ]).then((rows) => rows.map((r) => ({ productId: r._id, title: r.title, image: r.image, qty: r.qty, revenue: r.revenue })));
  }
  salesByCategory(states) {
    return this.aggregate([
      { $match: { status: { $in: states } } },
      { $unwind: "$items" },
      { $lookup: { from: "products", localField: "items.productId", foreignField: "_id", as: "p" } },
      { $unwind: { path: "$p", preserveNullAndEmptyArrays: true } },
      { $unwind: { path: "$p.categories", preserveNullAndEmptyArrays: true } },
      { $group: { _id: { $ifNull: ["$p.categories", "uncategorised"] }, revenue: { $sum: { $multiply: ["$items.unitPrice", "$items.qty"] } }, qty: { $sum: "$items.qty" } } },
      { $sort: { revenue: -1 } },
    ]).then((rows) => rows.map((r) => ({ category: r._id, revenue: r.revenue, qty: r.qty })));
  }
}

module.exports = { OrderRepository };
