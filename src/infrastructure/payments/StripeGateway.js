const { PaymentGateway } = require("./PaymentGateway");

const ZERO_DECIMAL = new Set(["jpy", "krw", "vnd", "clp", "pyg", "xaf", "xof"]);
const toMinorUnits = (amount, currency) => (ZERO_DECIMAL.has(currency) ? Math.round(amount) : Math.round(amount * 100));

// Adapter: translates our order/webhook vocabulary to Stripe's API.
class StripeGateway extends PaymentGateway {
  constructor({ secretKey, webhookSecret }) {
    super();
    this.stripe = require("stripe")(secretKey);
    this.webhookSecret = webhookSecret;
  }
  get name() {
    return "stripe";
  }
  get enabled() {
    return true;
  }
  async createIntent(order) {
    const intent = await this.stripe.paymentIntents.create(
      {
        amount: toMinorUnits(order.total, order.currency),
        currency: order.currency,
        automatic_payment_methods: { enabled: true },
        metadata: { orderId: order._id.toString(), orderNumber: order.orderNumber },
        description: `TBP order ${order.orderNumber}`,
      },
      { idempotencyKey: `order-${order._id}` }
    );
    return { id: intent.id, status: intent.status, clientSecret: intent.client_secret };
  }
  async cancelIntent(intentId) {
    if (!intentId) return;
    try {
      await this.stripe.paymentIntents.cancel(intentId);
    } catch (e) {
      if (e.code !== "payment_intent_unexpected_state") throw e; // already settled: nothing to do
    }
  }
  // Normalise Stripe's event zoo into { type, orderId, intentId, status, reason }.
  parseWebhook(rawBody, signature) {
    if (!this.webhookSecret) throw new Error("STRIPE_WEBHOOK_SECRET is not set");
    const event = this.stripe.webhooks.constructEvent(rawBody, signature, this.webhookSecret);
    const obj = event.data.object || {};
    const base = { orderId: obj.metadata?.orderId, intentId: obj.payment_intent || obj.id, status: obj.status };
    switch (event.type) {
      case "payment_intent.succeeded":
        return { type: "succeeded", ...base };
      case "payment_intent.payment_failed":
      case "payment_intent.canceled":
        return { type: "failed", ...base, reason: obj.last_payment_error?.message };
      case "charge.refunded":
        return { type: "refunded", ...base };
      default:
        return null;
    }
  }
}

module.exports = { StripeGateway, toMinorUnits };
