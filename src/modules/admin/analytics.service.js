// Read-only aggregations for the admin dashboard. Nothing here mutates data.
const { PAID_STATES } = require("../orders/order-state");
const { ProductRepository } = require("../catalog/product.repository");

const DAY = 86_400_000;
// All day bucketing is in UTC so keys match $dateToString.
const startOfDayUtc = (d) => new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));

class AnalyticsService {
  constructor({ orders, products, users }) {
    this.orders = orders;
    this.products = products;
    this.users = users;
  }

  async summary() {
    const now = new Date();
    const today = startOfDayUtc(now);
    const d30 = new Date(today.getTime() - 30 * DAY);
    const d60 = new Date(today.getTime() - 60 * DAY);
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const revenue = (from, to) => this.orders.revenueBetween(PAID_STATES, from, to);

    const [last30, prev30, thisMonth, allTime, byStatus, pendingManual, lowStock, soldOut, customers, newCustomers30, activeProducts] = await Promise.all([
      revenue(d30),
      revenue(d60, d30),
      revenue(monthStart),
      revenue(new Date(0)),
      this.orders.countByStatus(),
      this.orders.count({ status: "pending_payment", "payment.method": "manual", "payment.reference": { $exists: true, $ne: "" } }),
      this.products.find({ active: true, ...ProductRepository.lowStockFilter() }, { select: "title slug stock variants images", limit: 10 }),
      this.products.count({ active: true, ...ProductRepository.soldOutFilter() }),
      this.users.count({ isAdmin: false }),
      this.users.count({ isAdmin: false, createdAt: { $gte: d30 } }),
      this.products.count({ active: true }),
    ]);

    const pct = (a, b) => (b ? Math.round(((a - b) / b) * 100) : a ? 100 : 0);
    return {
      revenue: { last30: last30.total, prev30: prev30.total, changePct: pct(last30.total, prev30.total), thisMonth: thisMonth.total, allTime: allTime.total, avgOrder: last30.orders ? Math.round(last30.total / last30.orders) : 0 },
      orders: { last30: last30.orders, prev30: prev30.orders, byStatus, awaitingConfirmation: pendingManual },
      catalogue: { active: activeProducts, soldOut, lowStock },
      customers: { total: customers, new30: newCustomers30 },
    };
  }

  async revenueByDay(days = 30) {
    const from = new Date(startOfDayUtc(new Date()).getTime() - (days - 1) * DAY);
    const rows = await this.orders.revenueByDay(PAID_STATES, from);
    const map = new Map(rows.map((r) => [r._id, r]));
    return Array.from({ length: days }, (_, i) => {
      const k = new Date(from.getTime() + i * DAY).toISOString().slice(0, 10);
      return { date: k, total: map.get(k)?.total || 0, orders: map.get(k)?.orders || 0 };
    });
  }

  topProducts(limit = 8) {
    return this.orders.topProducts(PAID_STATES, limit);
  }
  mostViewed(limit = 8) {
    return this.products.find({ active: true }, { sort: { views: -1 }, limit, select: "title slug images views sold stock variants" });
  }
  salesByCategory() {
    return this.orders.salesByCategory(PAID_STATES);
  }
  recentOrders(limit = 10) {
    return this.orders.find({}, { sort: { createdAt: -1 }, limit, populate: { path: "userId", select: "name email" } });
  }

  async dashboard() {
    const [summary, revenueByDay, topProducts, mostViewed, salesByCategory, recentOrders] = await Promise.all([
      this.summary(),
      this.revenueByDay(30),
      this.topProducts(),
      this.mostViewed(),
      this.salesByCategory(),
      this.recentOrders(),
    ]);
    return { summary, revenueByDay, topProducts, mostViewed, salesByCategory, recentOrders, generatedAt: new Date() };
  }
}

module.exports = { AnalyticsService };
