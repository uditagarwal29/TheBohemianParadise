// Strategy: how an order gets paid. Checkout asks the chosen strategy to begin payment and
// never branches on "stripe vs manual" itself. A new method (Razorpay, COD) is a new class.
const { badRequest } = require("../../shared/errors");

class PaymentStrategy {
  get id() {
    throw new Error("not implemented");
  }
  get label() {
    throw new Error("not implemented");
  }
  /** Whether this method can be offered right now. */
  get available() {
    return true;
  }
  /** Minutes the stock stays reserved while the customer pays. */
  holdMinutes(storeConfig) {
    return storeConfig.reservationMinutes;
  }
  /** Prepare the payment for a freshly built (unsaved) order; may mutate order.payment. */
  async begin(order) {
    void order;
    return {};
  }
  /** Undo any provider-side artefact when the customer cancels before paying. */
  async abandon(order) {
    void order;
  }
}

// Seller confirms a UPI/bank transfer by hand, so stock is held longer.
class ManualPaymentStrategy extends PaymentStrategy {
  get id() {
    return "manual";
  }
  get label() {
    return "UPI / bank transfer (confirmed by the seller)";
  }
  holdMinutes(storeConfig) {
    return Math.max(storeConfig.reservationMinutes, storeConfig.manualReservationMinutes);
  }
  async begin() {
    return { instructions: "Pay via UPI/bank transfer and share the reference; the seller confirms within 24h." };
  }
}

class StripePaymentStrategy extends PaymentStrategy {
  constructor({ gateway }) {
    super();
    this.gateway = gateway;
  }
  get id() {
    return "stripe";
  }
  get label() {
    return "Card / UPI via Stripe";
  }
  get available() {
    return this.gateway.enabled;
  }
  async begin(order) {
    const intent = await this.gateway.createIntent(order);
    order.payment.intentId = intent.id;
    order.payment.status = intent.status;
    return { clientSecret: intent.clientSecret };
  }
  async abandon(order) {
    await this.gateway.cancelIntent(order.payment.intentId);
  }
}

// Registry of strategies; the container decides which are installed.
class PaymentMethods {
  constructor(strategies) {
    this.strategies = strategies;
  }
  available() {
    return this.strategies.filter((s) => s.available);
  }
  get(id) {
    const s = this.strategies.find((x) => x.id === id);
    if (!s) throw badRequest("Unknown payment method");
    if (!s.available) throw badRequest(`${s.label} is not available right now`);
    return s;
  }
  /** Strategy for an existing order, even if it is no longer offered for new ones. */
  forOrder(order) {
    return this.strategies.find((x) => x.id === order.payment.method) || new ManualPaymentStrategy();
  }
  describe() {
    return this.available().map((s) => ({ id: s.id, label: s.label }));
  }
}

module.exports = { PaymentStrategy, ManualPaymentStrategy, StripePaymentStrategy, PaymentMethods };
