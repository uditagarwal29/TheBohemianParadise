// End-to-end walk of the customer journey against an in-memory MongoDB.
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.MONGO_URL = "mongodb://127.0.0.1:1/placeholder";
process.env.SHIPPING_FLAT = "100";
process.env.FREE_SHIPPING_ABOVE = "2000";
process.env.RESERVATION_MINUTES = "30";

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

const { buildApp } = require("../src/app");
const User = require("../src/models/User");
const Product = require("../src/models/Product");
const Order = require("../src/models/Order");
const stock = require("../src/services/stock");

let mongod, app;

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = buildApp();
});
after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  await Product.syncIndexes();
});

async function seed() {
  const admin = new User({ name: "Mom", email: "mom@example.com", isAdmin: true });
  await admin.setPassword("adminpass123");
  await admin.save();
  const original = await Product.create({
    title: "Cherry Blossom (original)",
    desc: "Watercolour on paper",
    images: ["https://img.example/cb.jpg"],
    categories: ["Nature"],
    price: 1500,
    stock: 1,
    isOriginal: true,
  });
  const print = await Product.create({
    title: "Zodiac print",
    desc: "Giclée print",
    categories: ["zodiac"],
    price: 1000,
    variants: [
      { size: "A4", price: 1000, stock: 3 },
      { size: "A3", price: 1400, stock: 0 },
    ],
  });
  const hidden = await Product.create({ title: "Hidden", desc: "x", price: 1, stock: 5, active: false });
  return { admin, original, print, hidden };
}

async function register(email = "buyer@example.com", password = "buyerpass123") {
  const res = await request(app).post("/api/auth/register").send({ name: "Buyer", email, password });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.accessToken;
}
async function login(email, password) {
  const res = await request(app).post("/api/auth/login").send({ email, password });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body.accessToken;
}
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const ADDRESS = { fullName: "Buyer B", phone: "9999999999", line1: "1 Art Lane", city: "Pune", state: "MH", postalCode: "411001" };

// ---------------------------------------------------------------- guest ----

test("guest: browse catalogue, categories, product by slug; hidden products are invisible", async () => {
  const { original, hidden } = await seed();

  const list = await request(app).get("/api/products");
  assert.equal(list.status, 200);
  assert.ok(Array.isArray(list.body), "legacy array shape kept");
  assert.equal(list.body.length, 2);
  assert.ok(list.body.every((p) => p.inStock !== undefined && p.totalStock !== undefined));

  const paged = await request(app).get("/api/products?page=1&limit=1&sort=price_desc");
  assert.equal(paged.body.total, 2);
  assert.equal(paged.body.items[0].title, "Cherry Blossom (original)");

  const cats = await request(app).get("/api/products/categories");
  assert.deepEqual(cats.body, [{ name: "nature", count: 1 }, { name: "zodiac", count: 1 }]);

  const byCat = await request(app).get("/api/products?category=Nature");
  assert.equal(byCat.body.length, 1);

  const bySlug = await request(app).get(`/api/products/${original.slug}`);
  assert.equal(bySlug.status, 200);
  assert.equal(bySlug.body.title, original.title);
  const legacy = await request(app).get(`/api/products/find/${original._id}`);
  assert.equal(legacy.status, 200);

  assert.equal((await request(app).get(`/api/products/${hidden._id}`)).status, 404);
  assert.equal((await request(app).get(`/api/products/nope-nope`)).status, 404);
});

test("guest: validate a browser cart -> prices, stock problems, shipping", async () => {
  const { original, print } = await seed();
  const res = await request(app)
    .post("/api/carts/validate")
    .send({
      items: [
        { productId: original._id, qty: 2, unitPrice: 999 }, // only 1 in stock, stale price
        { productId: print._id, size: "A3", qty: 1 }, // sold out size
        { productId: print._id, size: "A4", qty: 1 },
        { productId: print._id, size: "A4", qty: 1 }, // duplicate line merges
      ],
    });
  assert.equal(res.status, 200);
  const codes = res.body.problems.map((p) => p.code).sort();
  assert.deepEqual(codes, ["price_changed", "qty_reduced", "sold_out"]);
  assert.equal(res.body.items.length, 2);
  const a4 = res.body.items.find((i) => i.size === "A4");
  assert.equal(a4.qty, 2);
  assert.equal(res.body.subtotal, 1500 + 2000);
  assert.equal(res.body.shipping, 0, "free shipping above 2000");
});

test("guest: protected routes demand a token; bad token is rejected", async () => {
  assert.equal((await request(app).get("/api/carts/me")).status, 401);
  assert.equal((await request(app).post("/api/orders/checkout").send({})).status, 401);
  assert.equal((await request(app).get("/api/orders/me").set(auth("garbage"))).status, 401);
  assert.equal((await request(app).get("/api/users")).status, 401);
});

// ------------------------------------------------------------ signed in ----

test("auth: register, login, me; wrong password and duplicate email handled; password never leaks", async () => {
  await seed();
  const token = await register();
  const me = await request(app).get("/api/auth/me").set(auth(token));
  assert.equal(me.body.user.email, "buyer@example.com");
  assert.equal(me.body.user.isAdmin, false);
  assert.equal(me.body.user.password, undefined);
  assert.equal(me.body.user.passwordHash, undefined);

  const dup = await request(app).post("/api/auth/register").send({ name: "x", email: "buyer@example.com", password: "whatever123" });
  assert.equal(dup.status, 409);
  const bad = await request(app).post("/api/auth/login").send({ email: "buyer@example.com", password: "wrongpass123" });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.accessToken, undefined);
  const unknown = await request(app).post("/api/auth/login").send({ email: "ghost@example.com", password: "wrongpass123" });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.body.error, bad.body.error, "same message for unknown email and wrong password");

  // legacy header still accepted
  const legacy = await request(app).get("/api/auth/me").set("token", `Bearer ${token}`);
  assert.equal(legacy.status, 200);
});

test("auth: a customer cannot make themselves admin; password change invalidates old tokens", async () => {
  await seed();
  const token = await register();
  const esc = await request(app).patch("/api/users/me").set(auth(token)).send({ name: "Evil", isAdmin: true });
  assert.equal(esc.status, 200);
  assert.equal(esc.body.user.isAdmin, false);
  const me = await request(app).get("/api/auth/me").set(auth(token));
  assert.equal(me.body.user.name, "Evil");
  assert.equal(me.body.user.isAdmin, false);

  const stillForbidden = await request(app).post("/api/products").set(auth(token)).send({ title: "x", desc: "y", price: 1 });
  assert.equal(stillForbidden.status, 403);

  const pw = await request(app).post("/api/users/me/password").set(auth(token)).send({ currentPassword: "buyerpass123", newPassword: "newpass12345" });
  assert.equal(pw.status, 200);
  assert.equal((await request(app).get("/api/auth/me").set(auth(token))).status, 401, "old token dead");
  const fresh = await login("buyer@example.com", "newpass12345");
  assert.equal((await request(app).get("/api/auth/me").set(auth(fresh))).status, 200);
});

test("cart: merge guest cart on login, add/update/remove lines, self-healing when a product disappears", async () => {
  const { original, print } = await seed();
  const token = await register();

  const merged = await request(app)
    .post("/api/carts/me/merge")
    .set(auth(token))
    .send({ items: [{ productId: original._id, qty: 1 }, { productId: print._id, size: "A4", qty: 1 }] });
  assert.equal(merged.status, 200);
  assert.equal(merged.body.items.length, 2);

  const add = await request(app).post("/api/carts/me/items").set(auth(token)).send({ productId: print._id, size: "A4", qty: 2 });
  assert.equal(add.status, 201);
  assert.equal(add.body.items.find((i) => i.size === "A4").qty, 3);

  const capped = await request(app).patch(`/api/carts/me/items/${print._id}?size=A4`).set(auth(token)).send({ qty: 5 });
  assert.equal(capped.body.items.find((i) => i.size === "A4").qty, 3, "qty capped to available");
  assert.ok(capped.body.problems.some((p) => p.code === "qty_reduced"));

  const removed = await request(app).delete(`/api/carts/me/items/${print._id}?size=A4`).set(auth(token));
  assert.equal(removed.body.items.length, 1);

  await Product.updateOne({ _id: original._id }, { active: false });
  const healed = await request(app).get("/api/carts/me").set(auth(token));
  assert.equal(healed.body.items.length, 0);
  assert.ok(healed.body.problems.some((p) => p.code === "unavailable"));
});

test("checkout: manual payment from saved cart, stock reserved, cart emptied, order visible; admin confirms payment", async () => {
  const { admin, original, print } = await seed();
  const token = await register();
  const adminToken = await login("mom@example.com", "adminpass123");

  await request(app).put("/api/carts/me").set(auth(token)).send({ items: [{ productId: original._id, qty: 1 }, { productId: print._id, size: "A4", qty: 2 }] });
  const addr = await request(app).post("/api/users/me/addresses").set(auth(token)).send(ADDRESS);
  assert.equal(addr.status, 201);
  const addressId = addr.body.addresses[0]._id;

  const co = await request(app).post("/api/orders/checkout").set(auth(token)).send({ paymentMethod: "manual", addressId, customerNote: "gift wrap please" });
  assert.equal(co.status, 201, JSON.stringify(co.body));
  const order = co.body.order;
  assert.equal(order.status, "pending_payment");
  assert.equal(order.subtotal, 1500 + 2000);
  assert.equal(order.shipping, 0);
  assert.equal(order.total, 3500);
  assert.match(order.orderNumber, /^TBP-\d{8}-[A-Z0-9]{5}$/);
  assert.equal(order.shippingAddress.city, "Pune");

  // stock held
  assert.equal((await Product.findById(original._id)).stock, 0);
  assert.equal((await Product.findById(print._id)).stockFor("A4"), 1);
  // original now shows sold out to everyone
  const pub = await request(app).get(`/api/products/${original._id}`);
  assert.equal(pub.body.inStock, false);
  // cart emptied
  assert.equal((await request(app).get("/api/carts/me").set(auth(token))).body.items.length, 0);

  // customer sees it, another customer does not
  const mine = await request(app).get("/api/orders/me").set(auth(token));
  assert.equal(mine.body.orders.length, 1);
  const other = await register("other@example.com");
  assert.equal((await request(app).get(`/api/orders/${order._id}`).set(auth(other))).status, 403);

  // customer submits UPI reference, admin marks paid
  const ref = await request(app).post(`/api/orders/${order._id}/payment-reference`).set(auth(token)).send({ reference: "UPI-12345" });
  assert.equal(ref.status, 200);
  const paid = await request(app).patch(`/api/orders/${order._id}/status`).set(auth(adminToken)).send({ status: "paid", note: "received" });
  assert.equal(paid.status, 200);
  assert.equal(paid.body.order.status, "paid");
  assert.ok(paid.body.order.payment.paidAt);
  assert.equal((await Product.findById(original._id)).sold, 1);

  // cannot cancel after payment; admin can ship with tracking
  assert.equal((await request(app).post(`/api/orders/${order._id}/cancel`).set(auth(token))).status, 400);
  const shipped = await request(app).patch(`/api/orders/${order._id}/status`).set(auth(adminToken)).send({ status: "shipped", tracking: { carrier: "DTDC", number: "X1" } });
  assert.equal(shipped.body.order.tracking.carrier, "DTDC");
  assert.equal((await request(app).patch(`/api/orders/${order._id}/status`).set(auth(adminToken)).send({ status: "paid" })).status, 400, "illegal transition");

  // income report
  const income = await request(app).get("/api/orders/income").set(auth(adminToken));
  assert.equal(income.body[0].total, 3500);
  void admin;
});

test("checkout: last piece goes to exactly one of two concurrent buyers; loser gets 409 and nothing is reserved", async () => {
  const { original } = await seed();
  const a = await register("a@example.com");
  const b = await register("b@example.com");
  const body = { paymentMethod: "manual", shippingAddress: ADDRESS, items: [{ productId: original._id, qty: 1 }] };
  const [ra, rb] = await Promise.all([
    request(app).post("/api/orders/checkout").set(auth(a)).send(body),
    request(app).post("/api/orders/checkout").set(auth(b)).send(body),
  ]);
  const statuses = [ra.status, rb.status].sort();
  assert.deepEqual(statuses, [201, 409]);
  assert.equal((await Product.findById(original._id)).stock, 0);
  assert.equal(await Order.countDocuments(), 1);
});

test("checkout: all-or-nothing reservation; cancel releases stock; expired reservations are swept", async () => {
  const { original, print } = await seed();
  const token = await register();
  // A3 is sold out -> whole checkout rejected, original must still be in stock
  const bad = await request(app).post("/api/orders/checkout").set(auth(token)).send({
    paymentMethod: "manual",
    shippingAddress: ADDRESS,
    items: [{ productId: original._id, qty: 1 }, { productId: print._id, size: "A3", qty: 1 }],
  });
  assert.equal(bad.status, 409);
  assert.equal(bad.body.details.problems[0].code, "sold_out");
  assert.equal((await Product.findById(original._id)).stock, 1);

  const ok = await request(app).post("/api/orders/checkout").set(auth(token)).send({ paymentMethod: "manual", shippingAddress: ADDRESS, items: [{ productId: original._id, qty: 1 }] });
  assert.equal(ok.status, 201);
  assert.equal((await Product.findById(original._id)).stock, 0);
  const cancel = await request(app).post(`/api/orders/${ok.body.order._id}/cancel`).set(auth(token));
  assert.equal(cancel.body.order.status, "cancelled");
  assert.equal((await Product.findById(original._id)).stock, 1, "stock back after cancel");
  assert.equal((await request(app).post(`/api/orders/${ok.body.order._id}/cancel`).set(auth(token))).status, 400, "double cancel rejected");

  // sweeper
  const again = await request(app).post("/api/orders/checkout").set(auth(token)).send({ paymentMethod: "manual", shippingAddress: ADDRESS, items: [{ productId: original._id, qty: 1 }] });
  assert.equal(again.status, 201);
  await Order.updateOne({ _id: again.body.order._id }, { reservedUntil: new Date(Date.now() - 1000) });
  assert.equal(await stock.expireStaleReservations(), 1);
  assert.equal((await Order.findById(again.body.order._id)).status, "payment_failed");
  assert.equal((await Product.findById(original._id)).stock, 1);
});

test("checkout: stripe is refused when not configured; empty cart and missing address are 400", async () => {
  const { original } = await seed();
  const token = await register();
  const noStripe = await request(app).post("/api/orders/checkout").set(auth(token)).send({ paymentMethod: "stripe", shippingAddress: ADDRESS, items: [{ productId: original._id, qty: 1 }] });
  assert.equal(noStripe.status, 400);
  const empty = await request(app).post("/api/orders/checkout").set(auth(token)).send({ paymentMethod: "manual", shippingAddress: ADDRESS });
  assert.equal(empty.status, 400);
  const noAddr = await request(app).post("/api/orders/checkout").set(auth(token)).send({ paymentMethod: "manual", items: [{ productId: original._id, qty: 1 }] });
  assert.equal(noAddr.status, 400);
  const methods = await request(app).get("/api/orders/payment-methods");
  assert.deepEqual(methods.body.methods.map((m) => m.id), ["manual"]);
});

// ---------------------------------------------------------------- admin ----

test("admin: product CRUD with variants, stock adjust, soft delete; customers are blocked", async () => {
  await seed();
  const adminToken = await login("mom@example.com", "adminpass123");
  const customer = await register();

  const created = await request(app).post("/api/products").set(auth(adminToken)).send({
    title: "Monsoon",
    desc: "Acrylic",
    price: 2500,
    stock: 1,
    categories: ["Nature", "monsoon"],
    images: ["https://img.example/m.jpg"],
    isAdmin: true, // unknown key ignored
  });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  assert.equal(created.body.slug, "monsoon");
  assert.deepEqual(created.body.categories, ["nature", "monsoon"]);
  assert.deepEqual(created.body.img, ["https://img.example/m.jpg"], "legacy img mirrored");

  const invalid = await request(app).post("/api/products").set(auth(adminToken)).send({ title: "x", desc: "y", price: -5 });
  assert.equal(invalid.status, 400);
  assert.ok(invalid.body.details.price);

  const adj = await request(app).post(`/api/products/${created.body._id}/stock`).set(auth(adminToken)).send({ delta: 4 });
  assert.equal(adj.body.stock, 5);
  assert.equal((await request(app).post(`/api/products/${created.body._id}/stock`).set(auth(adminToken)).send({ delta: -9 })).status, 400);

  const upd = await request(app).patch(`/api/products/${created.body._id}`).set(auth(adminToken)).send({ variants: [{ size: "A4", price: 900, stock: 2 }] });
  assert.deepEqual(upd.body.size, ["A4"]);
  assert.equal(upd.body.totalStock, 2);

  assert.equal((await request(app).post("/api/products").set(auth(customer)).send({ title: "h", desc: "h", price: 1 })).status, 403);
  assert.equal((await request(app).delete(`/api/products/${created.body._id}`).set(auth(customer))).status, 403);

  const del = await request(app).delete(`/api/products/${created.body._id}`).set(auth(adminToken));
  assert.equal(del.status, 200);
  assert.equal((await request(app).get(`/api/products/${created.body._id}`)).status, 404);
  assert.ok(await Product.findById(created.body._id), "soft deleted, still in DB for order history");

  const users = await request(app).get("/api/users").set(auth(adminToken));
  assert.equal(users.body.total, 2);
  assert.ok(users.body.users.every((u) => u.passwordHash === undefined));
});

test("hygiene: unknown api route is JSON 404, malformed JSON is 400, SPA fallback serves index.html", async () => {
  assert.equal((await request(app).get("/api/nope")).status, 404);
  const bad = await request(app).post("/api/auth/login").set("Content-Type", "application/json").send("{oops");
  assert.equal(bad.status, 400);
  const spa = await request(app).get("/products/anything");
  assert.equal(spa.status, 200);
  assert.match(spa.headers["content-type"], /html/);
  assert.equal((await request(app).get("/api/health")).body.ok, true);
});
