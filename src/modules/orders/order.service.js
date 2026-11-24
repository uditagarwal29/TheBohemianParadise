const { OrderStateMachine, PAID_STATES, STATES } = require("./order-state");
const { badRequest, notFound, forbidden } = require("../../shared/errors");

// Order lifecycle after checkout: reading, customer actions, admin transitions, webhooks.
class OrderService {
  constructor({ orders, orderState, paymentMethods, gateway }) {
    this.orders = orders;
    this.orderState = orderState;
    this.paymentMethods = paymentMethods;
    this.gateway = gateway;
  }

  listMine(userId) {
    return this.orders.forUser(userId);
  }

  async getOwned(user, id) {
    const order = await this.orders.findById(id);
    if (!order) throw notFound("Order not found");
    if (!user.isAdmin && !order.userId.equals(user._id)) throw forbidden();
    return order;
  }

  async cancel(user, id) {
    const order = await this.getOwned(user, id);
    if (order.status !== "pending_payment") throw badRequest("Only unpaid orders can be cancelled");
    await this.paymentMethods.forOrder(order).abandon(order);
    await this.orderState.transition(order, "cancelled", { by: user.isAdmin ? "admin" : "customer" });
    await this.orders.save(order);
    return order;
  }

  async submitPaymentReference(user, id, reference) {
    const order = await this.getOwned(user, id);
    if (order.payment.method !== "manual" || order.status !== "pending_payment") throw badRequest("Not applicable to this order");
    order.payment.reference = reference;
    order.history.push({ status: order.status, by: "customer", note: "Payment reference submitted" });
    await this.orders.save(order);
    return order;
  }

  // ---- admin ----------------------------------------------------------------

  adminList({ status, q, page, limit, skip }) {
    const filter = this.orders.adminFilter({ status, q, validStatuses: STATES });
    return this.orders.findPage(filter, { sort: { createdAt: -1 }, page, limit, skip, populate: { path: "userId", select: "name email" } }).then(({ items, ...rest }) => ({ orders: items, ...rest }));
  }

  async adminGet(id) {
    const order = await this.orders.findWithCustomer(id);
    if (!order) throw notFound("Order not found");
    return order;
  }

  async setStatus(id, { status, note, tracking }) {
    const order = await this.orders.findById(id);
    if (!order) throw notFound("Order not found");
    if (tracking) order.tracking = tracking;
    await this.orderState.transition(order, status, { by: "admin", note });
    await this.orders.save(order);
    return order;
  }

  incomeByMonth(months = 12) {
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    return this.orders.revenueByMonth(PAID_STATES, since);
  }

  // ---- payment provider callbacks -----------------------------------------------

  async handleGatewayEvent(evt) {
    const order = evt.orderId ? await this.orders.findById(evt.orderId) : await this.orders.findByIntent(evt.intentId);
    if (!order) return { ignored: "no matching order" };
    const map = {
      succeeded: order.status === "pending_payment" && "paid",
      failed: order.status === "pending_payment" && "payment_failed",
      refunded: PAID_STATES.includes(order.status) && "refunded",
    };
    const to = map[evt.type];
    if (!to) return { ignored: `event ${evt.type} in state ${order.status}` };
    if (evt.status) order.payment.status = evt.status;
    await this.orderState.transition(order, to, { by: "stripe", note: evt.reason });
    await this.orders.save(order);
    return { applied: to };
  }

  static allowedAdminTransitions(from) {
    return OrderStateMachine.allowedFor(from, "admin");
  }
}

module.exports = { OrderService };
