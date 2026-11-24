const { conflict } = require("../../shared/errors");

// Owns stock movements. Subscribes to order events (Observer) so orders never call inventory
// directly: paid -> count sales, cancelled/refunded/payment_failed -> return stock.
class StockService {
  constructor({ products, orders, events }) {
    this.products = products;
    this.orders = orders;
    events.on("order.paid", ({ order }) => this.markSold(order));
    events.on("order.cancelled", ({ order }) => this.releaseOrder(order));
    events.on("order.refunded", ({ order }) => this.releaseOrder(order, "Refunded, stock returned"));
    events.on("order.payment_failed", ({ order }) => this.releaseOrder(order));
  }

  // Reserve every line or none. Without transactions (Atlas free tier may lack a replica set)
  // we roll back the lines that succeeded if a later one fails.
  async reserveAll(items) {
    const done = [];
    for (const item of items) {
      if (!(await this.products.reserve(item))) {
        for (const d of done) await this.products.release(d);
        throw conflict("Some items just sold out", { productId: item.productId, size: item.size });
      }
      done.push(item);
    }
  }

  async releaseOrder(order, note) {
    if (order.stockReleased) return;
    for (const item of order.items) await this.products.release(item);
    order.stockReleased = true;
    if (note) order.history.push({ status: order.status, by: "system", note });
  }

  async markSold(order) {
    for (const item of order.items) await this.products.incrementSold(item.productId, item.qty);
  }
}

// Background job: cancel unpaid orders whose hold lapsed. Separate class so the policy
// (how often, how many) is independent of the stock rules.
class ReservationSweeper {
  constructor({ orders, orderState, intervalMs = 60_000 }) {
    this.orders = orders;
    this.orderState = orderState;
    this.intervalMs = intervalMs;
    this.timer = null;
  }
  async runOnce() {
    const stale = await this.orders.staleReservations();
    for (const order of stale) {
      await this.orderState.transition(order, "payment_failed", { by: "system", note: "Reservation expired" });
      await this.orders.save(order);
    }
    return stale.length;
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this.runOnce().catch((e) => console.error("sweeper error", e)), this.intervalMs);
    this.timer.unref();
  }
  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}

module.exports = { StockService, ReservationSweeper };
