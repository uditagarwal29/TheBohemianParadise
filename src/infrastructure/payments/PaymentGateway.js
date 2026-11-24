// Adapter interface for an online payment processor, plus a Null Object used when none is
// configured so callers never branch on "is Stripe set up?" (Liskov substitution).
class PaymentGateway {
  get name() {
    return "none";
  }
  get enabled() {
    return false;
  }
  /** @returns {Promise<{id: string, status: string, clientSecret: string}>} */
  async createIntent(order) {
    void order;
    throw new Error("No payment gateway configured");
  }
  async cancelIntent(intentId) {
    void intentId;
  }
  /** Verify a webhook payload and return a normalised event or null if unknown. */
  parseWebhook(rawBody, signature) {
    void rawBody;
    void signature;
    throw new Error("No payment gateway configured");
  }
}

class NullPaymentGateway extends PaymentGateway {}

module.exports = { PaymentGateway, NullPaymentGateway };
