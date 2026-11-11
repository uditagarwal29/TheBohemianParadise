const Product = require("../models/Product");
const Order = require("../models/Order");
const { conflict } = require("../errors");

// Atomically decrement stock for one line. The filter guarantees we never go
// below zero even when two customers check out the last piece at the same time.
async function reserveLine({ productId, size, qty }) {
  const filter = { _id: productId, active: true };
  const update = {};
  if (size) {
    filter.variants = { $elemMatch: { size, stock: { $gte: qty } } };
    update.$inc = { "variants.$.stock": -qty };
  } else {
    filter.stock = { $gte: qty };
    update.$inc = { stock: -qty };
  }
  const res = await Product.updateOne(filter, update);
  return res.modifiedCount === 1;
}

async function releaseLine({ productId, size, qty }) {
  if (size) {
    await Product.updateOne({ _id: productId, "variants.size": size }, { $inc: { "variants.$.stock": qty } });
  } else {
    await Product.updateOne({ _id: productId }, { $inc: { stock: qty } });
  }
}

// Reserve every line or none. Without transactions (Atlas free tier may lack a
// replica set) we roll back the lines that succeeded if a later one fails.
async function reserveAll(items) {
  const done = [];
  for (const item of items) {
    const ok = await reserveLine(item);
    if (!ok) {
      for (const d of done) await releaseLine(d);
      throw conflict("Some items just sold out", { productId: item.productId, size: item.size });
    }
    done.push(item);
  }
}

async function releaseOrder(order, by, note) {
  if (order.stockReleased) return;
  for (const item of order.items) await releaseLine(item);
  order.stockReleased = true;
  if (note) order.history.push({ status: order.status, by, note });
}

async function markSold(order) {
  for (const item of order.items) {
    await Product.updateOne({ _id: item.productId }, { $inc: { sold: item.qty } });
  }
}

// Cancel unpaid orders whose reservation has lapsed and give the stock back.
async function expireStaleReservations() {
  const stale = await Order.find({
    status: "pending_payment",
    stockReleased: false,
    reservedUntil: { $lt: new Date() },
  }).limit(100);
  for (const order of stale) {
    order.transition("payment_failed", "system", "Reservation expired");
    await releaseOrder(order, "system");
    await order.save();
  }
  return stale.length;
}

let timer = null;
function startSweeper(intervalMs = 60_000) {
  if (timer) return;
  timer = setInterval(() => {
    expireStaleReservations().catch((e) => console.error("sweeper error", e));
  }, intervalMs);
  timer.unref();
}
function stopSweeper() {
  if (timer) clearInterval(timer);
  timer = null;
}

module.exports = { reserveAll, releaseOrder, markSold, expireStaleReservations, startSweeper, stopSweeper };
