const router = require("express").Router();
const express = require("express");
const Order = require("../models/Order");
const stock = require("../services/stock");
const payments = require("../services/payments");
const { config } = require("../config");

// POST /api/webhooks/stripe  (raw body: Stripe signs the exact bytes)
router.post("/stripe", express.raw({ type: "application/json" }), async (req, res) => {
  if (!payments.enabled() || !config.stripeWebhookSecret) return res.status(503).json({ error: "Stripe not configured" });
  let event;
  try {
    event = payments.constructWebhookEvent(req.body, req.headers["stripe-signature"]);
  } catch (e) {
    return res.status(400).json({ error: `Invalid signature: ${e.message}` });
  }

  try {
    const intent = event.data.object;
    const order = intent?.metadata?.orderId
      ? await Order.findById(intent.metadata.orderId)
      : await Order.findOne({ "payment.intentId": intent?.id });
    if (!order) return res.json({ received: true, ignored: "no matching order" });

    switch (event.type) {
      case "payment_intent.succeeded":
        if (order.status === "pending_payment") {
          order.payment.status = "succeeded";
          order.payment.paidAt = new Date();
          order.transition("paid", "stripe");
          await stock.markSold(order);
          await order.save();
        }
        break;
      case "payment_intent.payment_failed":
      case "payment_intent.canceled":
        if (order.status === "pending_payment") {
          order.payment.status = intent.status;
          order.transition("payment_failed", "stripe", intent.last_payment_error?.message);
          await stock.releaseOrder(order, "system");
          await order.save();
        }
        break;
      case "charge.refunded":
        if (["paid", "processing", "shipped", "delivered"].includes(order.status)) {
          order.transition("refunded", "stripe");
          await stock.releaseOrder(order, "system", "Refunded, stock returned");
          await order.save();
        }
        break;
      default:
        break;
    }
    res.json({ received: true });
  } catch (e) {
    console.error("webhook handling failed", e);
    // 500 makes Stripe retry.
    res.status(500).json({ error: "handler failed" });
  }
});

module.exports = router;
