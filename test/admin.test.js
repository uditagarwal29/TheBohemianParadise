// Admin surface: analytics, uploads, admin product/order lists, view counting.
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.MONGO_URL = "mongodb://127.0.0.1:1/placeholder";
process.env.STORAGE_DRIVER = "local";
process.env.UPLOAD_DIR = require("path").join(__dirname, "fixtures", "uploads-tmp");
process.env.MAX_UPLOAD_MB = "1";

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

const { buildApp } = require("../src/app");
const User = require("../src/modules/users/user.model");
const Product = require("../src/modules/catalog/product.model");

// 1x1 PNG
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", "base64");

let mongod, app;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const ADDRESS = { fullName: "Buyer", phone: "9999999999", line1: "1 Art Lane", city: "Pune", state: "MH", postalCode: "411001" };

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = buildApp({ publicDir: path.join(__dirname, "fixtures", "public") });
});
after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
  fs.rmSync(process.env.UPLOAD_DIR, { recursive: true, force: true });
});
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  await Product.syncIndexes();
});

async function seed() {
  const admin = new User({ name: "Mom", email: "mom@example.com", isAdmin: true });
  await admin.setPassword("adminpass123");
  await admin.save();
  const adminToken = (await request(app).post("/api/auth/login").send({ email: "mom@example.com", password: "adminpass123" })).body.accessToken;
  const buyerToken = (await request(app).post("/api/auth/register").send({ name: "B", email: "b@example.com", password: "buyerpass123" })).body.accessToken;
  const p1 = await Product.create({ title: "Original A", desc: "x", price: 4000, stock: 1, isOriginal: true, categories: ["nature"] });
  const p2 = await Product.create({ title: "Print B", desc: "x", price: 1000, categories: ["zodiac"], variants: [{ size: "A4", price: 1000, stock: 2 }] });
  return { adminToken, buyerToken, p1, p2 };
}

async function placePaidOrder(adminToken, buyerToken, items) {
  const co = await request(app).post("/api/orders/checkout").set(auth(buyerToken)).send({ paymentMethod: "manual", shippingAddress: ADDRESS, items });
  assert.equal(co.status, 201, JSON.stringify(co.body));
  const paid = await request(app).patch(`/api/orders/${co.body.order._id}/status`).set(auth(adminToken)).send({ status: "paid" });
  assert.equal(paid.status, 200);
  return paid.body.order;
}

test("admin dashboard aggregates revenue, status counts, top products, low stock; customers are blocked", async () => {
  const { adminToken, buyerToken, p1, p2 } = await seed();
  await placePaidOrder(adminToken, buyerToken, [{ productId: p1._id, qty: 1 }, { productId: p2._id, size: "A4", qty: 1 }]);
  // an unpaid one with a reference waiting for confirmation
  const co = await request(app).post("/api/orders/checkout").set(auth(buyerToken)).send({ paymentMethod: "manual", shippingAddress: ADDRESS, items: [{ productId: p2._id, size: "A4", qty: 1 }] });
  await request(app).post(`/api/orders/${co.body.order._id}/payment-reference`).set(auth(buyerToken)).send({ reference: "UPI-1" });

  assert.equal((await request(app).get("/api/admin/dashboard").set(auth(buyerToken))).status, 403);
  assert.equal((await request(app).get("/api/admin/dashboard")).status, 401);

  const res = await request(app).get("/api/admin/dashboard").set(auth(adminToken));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const { summary, revenueByDay, topProducts, salesByCategory, recentOrders } = res.body;
  assert.equal(summary.revenue.last30, 5000);
  assert.equal(summary.revenue.allTime, 5000);
  assert.equal(summary.orders.last30, 1);
  assert.equal(summary.orders.byStatus.paid, 1);
  assert.equal(summary.orders.byStatus.pending_payment, 1);
  assert.equal(summary.orders.awaitingConfirmation, 1);
  assert.equal(summary.catalogue.soldOut, 1, "original sold out");
  assert.equal(summary.customers.total, 1);
  assert.equal(revenueByDay.length, 30);
  assert.equal(revenueByDay.at(-1).total, 5000, "today's bucket");
  assert.equal(topProducts[0].title, "Original A");
  assert.deepEqual(salesByCategory.map((c) => c.category).sort(), ["nature", "zodiac"]);
  assert.equal(recentOrders.length, 2);
  assert.equal(recentOrders[0].userId.email, "b@example.com");

  const settings = await request(app).get("/api/admin/settings").set(auth(adminToken));
  assert.equal(settings.body.storage, "local");
  assert.equal(settings.body.stripe, false);
});

test("image upload: admin only, type and size enforced, appended to a product, removable", async () => {
  const { adminToken, buyerToken, p1 } = await seed();

  assert.equal((await request(app).post("/api/products/images").set(auth(buyerToken)).attach("images", PNG, "a.png")).status, 403);

  const bad = await request(app).post("/api/products/images").set(auth(adminToken)).attach("images", Buffer.from("hello"), { filename: "a.txt", contentType: "text/plain" });
  assert.equal(bad.status, 400);
  assert.match(bad.body.error, /Unsupported/);

  const big = await request(app).post("/api/products/images").set(auth(adminToken)).attach("images", Buffer.alloc(1.5 * 1024 * 1024), { filename: "big.png", contentType: "image/png" });
  assert.equal(big.status, 400);
  assert.match(big.body.error, /larger than 1 MB/);

  const standalone = await request(app).post("/api/products/images").set(auth(adminToken)).attach("images", PNG, "a.png").attach("images", PNG, "b.png");
  assert.equal(standalone.status, 201, JSON.stringify(standalone.body));
  assert.equal(standalone.body.uploaded.length, 2);
  assert.match(standalone.body.uploaded[0].url, /^\/uploads\/[\w-]+\.png$/);
  // served back
  assert.equal((await request(app).get(standalone.body.uploaded[0].url)).status, 200);

  const attached = await request(app).post(`/api/products/${p1._id}/images`).set(auth(adminToken)).attach("images", PNG, "c.png");
  assert.equal(attached.status, 201);
  assert.equal(attached.body.product.images.length, 1);
  assert.equal(attached.body.product.img.length, 1, "legacy field mirrored");
  assert.equal(attached.body.product.imageKeys, undefined, "storage keys never leak");

  const url = attached.body.product.images[0];
  const removed = await request(app).delete(`/api/products/${p1._id}/images`).set(auth(adminToken)).send({ url });
  assert.equal(removed.status, 200);
  assert.equal(removed.body.images.length, 0);
  assert.equal((await request(app).get(url)).status, 404, "file deleted from disk");
});

test("admin product list filters (hidden, sold_out, low), restore, and view counting", async () => {
  const { adminToken, buyerToken, p1, p2 } = await seed();
  await Product.create({ title: "Hidden", desc: "x", price: 1, stock: 3, active: false });

  const all = await request(app).get("/api/products/admin/list").set(auth(adminToken));
  assert.equal(all.body.total, 3, "hidden items included for admin");
  assert.equal((await request(app).get("/api/products/admin/list?status=hidden").set(auth(adminToken))).body.total, 1);
  assert.equal((await request(app).get("/api/products/admin/list?status=low").set(auth(adminToken))).body.total, 2, "stock 1 and variant stock 2 are low");

  await placePaidOrder(adminToken, buyerToken, [{ productId: p1._id, qty: 1 }]);
  assert.equal((await request(app).get("/api/products/admin/list?status=sold_out").set(auth(adminToken))).body.total, 1);

  const hidden = (await request(app).get("/api/products/admin/list?status=hidden").set(auth(adminToken))).body.items[0];
  assert.equal((await request(app).post(`/api/products/${hidden._id}/restore`).set(auth(adminToken))).body.active, true);
  assert.equal((await request(app).get(`/api/products/${hidden._id}`)).status, 200, "visible to shoppers again");

  // views: shoppers count, admins don't
  await request(app).get(`/api/products/${p2.slug}`);
  await request(app).get(`/api/products/${p2.slug}`).set(auth(buyerToken));
  await request(app).get(`/api/products/${p2.slug}`).set(auth(adminToken));
  assert.equal((await Product.findById(p2._id)).views, 2);
  const viewed = await request(app).get("/api/admin/analytics/most-viewed").set(auth(adminToken));
  assert.equal(viewed.body[0].title, "Print B");

  // admin order list + search
  const orders = await request(app).get("/api/orders?status=paid").set(auth(adminToken));
  assert.equal(orders.body.total, 1);
  const byName = await request(app).get("/api/orders?q=buyer").set(auth(adminToken));
  assert.equal(byName.body.total, 1);
  const detail = await request(app).get(`/api/orders/admin/${orders.body.orders[0]._id}`).set(auth(adminToken));
  assert.equal(detail.body.order.userId.email, "b@example.com");

  // customer search
  const users = await request(app).get("/api/users?q=b@example").set(auth(adminToken));
  assert.equal(users.body.total, 1);
});
