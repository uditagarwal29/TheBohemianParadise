const mongoose = require("mongoose");
const { addressSchema } = require("../users/user.model");

const ORDER_STATUS = [
  "pending_payment", // created, stock reserved, waiting for Stripe / manual payment
  "paid", // payment confirmed
  "processing", // being packed
  "shipped",
  "delivered",
  "cancelled", // by customer before payment, or by admin
  "payment_failed", // Stripe declined/expired; stock released
  "refunded",
];

const orderItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: "Product", required: true },
    title: { type: String, required: true },
    image: { type: String },
    size: { type: String, default: null },
    unitPrice: { type: Number, required: true, min: 0 },
    qty: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    orderNumber: { type: String, unique: true, index: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
    items: { type: [orderItemSchema], validate: (v) => v.length > 0 },
    subtotal: { type: Number, required: true, min: 0 },
    shipping: { type: Number, required: true, min: 0, default: 0 },
    total: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true },
    shippingAddress: { type: addressSchema, required: true },
    customerNote: { type: String, maxlength: 500 },
    status: { type: String, enum: ORDER_STATUS, default: "pending_payment", index: true },
    payment: {
      method: { type: String, enum: ["stripe", "manual"], required: true },
      provider: { type: String },
      intentId: { type: String, index: true, sparse: true },
      status: { type: String },
      paidAt: { type: Date },
      // Admin-entered reference for manual payments (UPI txn id, etc.)
      reference: { type: String, maxlength: 120 },
    },
    // Stock is held until this time; a sweeper cancels unpaid orders after it.
    reservedUntil: { type: Date, index: true },
    stockReleased: { type: Boolean, default: false },
    tracking: {
      carrier: { type: String, maxlength: 60 },
      number: { type: String, maxlength: 80 },
      url: { type: String, maxlength: 300 },
    },
    history: [
      {
        _id: false,
        status: String,
        at: { type: Date, default: Date.now },
        by: { type: String }, // 'customer' | 'admin' | 'system' | 'stripe'
        note: String,
      },
    ],
  },
  { timestamps: true }
);

orderSchema.pre("validate", function (next) {
  if (!this.orderNumber) {
    const d = new Date();
    const ymd = d.toISOString().slice(0, 10).replace(/-/g, "");
    const rand = Math.random().toString(36).slice(2, 7).toUpperCase();
    this.orderNumber = `TBP-${ymd}-${rand}`;
  }
  next();
});

orderSchema.methods.transition = function (status, by, note) {
  this.status = status;
  this.history.push({ status, by, note });
};

orderSchema.set("toJSON", {
  transform(doc, ret) {
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Order", orderSchema);
module.exports.ORDER_STATUS = ORDER_STATUS;
