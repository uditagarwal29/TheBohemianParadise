const { config } = require("../../config");

let stripe = null;
if (config.payments.stripeSecretKey) {
  stripe = require("stripe")(config.payments.stripeSecretKey);
}

const ZERO_DECIMAL = new Set(["jpy", "krw", "vnd", "clp", "pyg", "xaf", "xof"]);

// Prices are stored in whole currency units (₹1500). Stripe wants the smallest unit.
function toMinorUnits(amount, currency) {
  return ZERO_DECIMAL.has(currency) ? Math.round(amount) : Math.round(amount * 100);
}

function enabled() {
  return Boolean(stripe);
}

async function createPaymentIntent(order) {
  const intent = await stripe.paymentIntents.create(
    {
      amount: toMinorUnits(order.total, order.currency),
      currency: order.currency,
      automatic_payment_methods: { enabled: true },
      metadata: { orderId: order._id.toString(), orderNumber: order.orderNumber },
      description: `TBP order ${order.orderNumber}`,
    },
    { idempotencyKey: `order-${order._id}` }
  );
  return intent;
}

async function cancelPaymentIntent(intentId) {
  if (!stripe || !intentId) return;
  try {
    await stripe.paymentIntents.cancel(intentId);
  } catch (e) {
    // Already succeeded/cancelled: nothing to do.
    if (e.code !== "payment_intent_unexpected_state") throw e;
  }
}

function constructWebhookEvent(rawBody, signature) {
  return stripe.webhooks.constructEvent(rawBody, signature, config.payments.stripeWebhookSecret);
}

module.exports = { enabled, createPaymentIntent, cancelPaymentIntent, constructWebhookEvent, toMinorUnits };
