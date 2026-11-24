// Factory Method for the payment gateway; returns the Null Object when nothing is configured.
const { StripeGateway } = require("./StripeGateway");
const { PaymentGateway, NullPaymentGateway } = require("./PaymentGateway");

function createPaymentGateway(paymentsConfig) {
  if (paymentsConfig.stripeSecretKey) {
    return new StripeGateway({ secretKey: paymentsConfig.stripeSecretKey, webhookSecret: paymentsConfig.stripeWebhookSecret });
  }
  return new NullPaymentGateway();
}

module.exports = { createPaymentGateway, PaymentGateway, NullPaymentGateway };
