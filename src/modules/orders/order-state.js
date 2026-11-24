// State pattern for the order lifecycle. One table declares which transitions exist and who may
// perform them; `transition()` applies the change, records history and publishes an event so
// other modules (inventory, notifications) react without this file knowing about them.
const { badRequest, forbidden } = require("../../shared/errors");

const STATES = ["pending_payment", "paid", "processing", "shipped", "delivered", "cancelled", "payment_failed", "refunded"];
const PAID_STATES = ["paid", "processing", "shipped", "delivered"];
const ACTORS = ["customer", "admin", "system", "stripe"];

// from -> to -> actors allowed to trigger it
const TRANSITIONS = {
  pending_payment: {
    paid: ["admin", "stripe"],
    cancelled: ["customer", "admin"],
    payment_failed: ["system", "stripe"],
  },
  paid: { processing: ["admin"], shipped: ["admin"], refunded: ["admin", "stripe"], cancelled: ["admin"] },
  processing: { shipped: ["admin"], refunded: ["admin", "stripe"], cancelled: ["admin"] },
  shipped: { delivered: ["admin"], refunded: ["admin", "stripe"] },
  delivered: { refunded: ["admin", "stripe"] },
  payment_failed: {},
  cancelled: {},
  refunded: {},
};

class OrderStateMachine {
  constructor({ events }) {
    this.events = events;
  }

  static canTransition(from, to, by) {
    return Boolean(TRANSITIONS[from]?.[to]?.includes(by));
  }
  static allowedFor(from, by) {
    return Object.entries(TRANSITIONS[from] || {}).filter(([, actors]) => actors.includes(by)).map(([to]) => to);
  }

  /**
   * Move `order` to `to` on behalf of `by`. Mutates the document (does not save) and emits
   * `order.transitioned` plus `order.<to>` with { order, from, to, by, note }.
   */
  async transition(order, to, { by, note } = {}) {
    const from = order.status;
    if (!STATES.includes(to)) throw badRequest(`Unknown status ${to}`);
    if (!ACTORS.includes(by)) throw forbidden(`Unknown actor ${by}`);
    if (!OrderStateMachine.canTransition(from, to, by)) {
      throw by === "admin" || by === "customer"
        ? badRequest(`Cannot move an order from ${from} to ${to}`)
        : badRequest(`Illegal transition ${from} -> ${to} by ${by}`);
    }
    // Entry actions that belong to the state itself.
    if (to === "paid") {
      order.payment.status = "succeeded";
      if (!order.payment.paidAt) order.payment.paidAt = new Date();
    }
    order.status = to;
    order.history.push({ status: to, by, note });
    const payload = { order, from, to, by, note };
    await this.events.emit("order.transitioned", payload);
    await this.events.emit(`order.${to}`, payload);
    return order;
  }
}

module.exports = { OrderStateMachine, STATES, PAID_STATES, TRANSITIONS };
