// Google sign-in: new account, linking to an existing email, password-less login message, set-password.
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.MONGO_URL = "mongodb://127.0.0.1:1/placeholder";
process.env.GOOGLE_CLIENT_ID = "test-client-id.apps.googleusercontent.com";

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");

const { buildApp } = require("../src/app");
const User = require("../src/modules/users/user.model");

// Fake Google: token "good:<sub>:<email>" is valid; anything else throws like the real verifier.
const fakeVerify = async (idToken) => {
  const [tag, sub, email, unverified] = idToken.split(":");
  if (tag !== "good") throw new Error("Invalid token signature");
  return { sub, email: unverified ? null : email, name: "Google Person", picture: "https://lh3.example/p.jpg" };
};

let mongod, app;
const auth = (t) => ({ Authorization: `Bearer ${t}` });

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = buildApp({ publicDir: path.join(__dirname, "fixtures", "public"), googleVerifier: fakeVerify });
});
after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
});

test("providers endpoint advertises Google with the client id", async () => {
  const res = await request(app).get("/api/auth/providers");
  assert.deepEqual(res.body, { password: true, google: { clientId: "test-client-id.apps.googleusercontent.com" } });
});

test("first Google sign-in creates the account (201); second signs in (200); profile is public-safe", async () => {
  const first = await request(app).post("/api/auth/google").send({ idToken: "good:sub-1:priya@example.com" });
  assert.equal(first.status, 201, JSON.stringify(first.body));
  assert.equal(first.body.created, true);
  assert.equal(first.body.user.email, "priya@example.com");
  assert.equal(first.body.user.hasPassword, false);
  assert.equal(first.body.user.googleLinked, true);
  assert.equal(first.body.user.isAdmin, false);
  assert.ok(first.body.accessToken);

  const again = await request(app).post("/api/auth/google").send({ idToken: "good:sub-1:priya@example.com" });
  assert.equal(again.status, 200);
  assert.equal(again.body.created, false);
  assert.equal(await User.countDocuments(), 1);

  const me = await request(app).get("/api/auth/me").set(auth(again.body.accessToken));
  assert.equal(me.status, 200);
  assert.equal(me.body.user.avatar, "https://lh3.example/p.jpg");
  const raw = await User.findById(me.body.user.id).select("+passwordHash");
  assert.equal(raw.passwordHash, undefined);
});

test("Google links to an existing password account with the same email; both methods keep working", async () => {
  const reg = await request(app).post("/api/auth/register").send({ name: "Priya", email: "priya@example.com", password: "buyerpass123" });
  assert.equal(reg.status, 201);
  const g = await request(app).post("/api/auth/google").send({ idToken: "good:sub-9:priya@example.com" });
  assert.equal(g.status, 200, "existing account -> sign in, not create");
  assert.equal(g.body.user.id, reg.body.user.id);
  assert.equal(g.body.user.googleLinked, true);
  assert.equal(g.body.user.hasPassword, true);
  assert.equal((await request(app).post("/api/auth/login").send({ email: "priya@example.com", password: "buyerpass123" })).status, 200);
  assert.equal(await User.countDocuments(), 1);
});

test("bad or unverified Google tokens are rejected; disabled accounts cannot sign in", async () => {
  assert.equal((await request(app).post("/api/auth/google").send({ idToken: "bad:x:y" })).status, 401);
  const unverified = await request(app).post("/api/auth/google").send({ idToken: "good:sub-2:nobody@example.com:unverified" });
  assert.equal(unverified.status, 401);
  assert.match(unverified.body.error, /verified email/);
  assert.equal((await request(app).post("/api/auth/google").send({})).status, 400);

  await request(app).post("/api/auth/google").send({ idToken: "good:sub-3:d@example.com" });
  await User.updateOne({ email: "d@example.com" }, { disabled: true });
  assert.equal((await request(app).post("/api/auth/google").send({ idToken: "good:sub-3:d@example.com" })).status, 401);
});

test("password login on a Google-only account explains what to do; set-password then enables it", async () => {
  const g = await request(app).post("/api/auth/google").send({ idToken: "good:sub-4:g@example.com" });
  const pw = await request(app).post("/api/auth/login").send({ email: "g@example.com", password: "whatever123" });
  assert.equal(pw.status, 401);
  assert.match(pw.body.error, /Google sign-in/);

  const set = await request(app).post("/api/auth/set-password").set(auth(g.body.accessToken)).send({ password: "newpass12345" });
  assert.equal(set.status, 200);
  assert.equal(set.body.reauthenticate, true);
  assert.equal((await request(app).get("/api/auth/me").set(auth(g.body.accessToken))).status, 401, "old token invalidated");
  const login = await request(app).post("/api/auth/login").send({ email: "g@example.com", password: "newpass12345" });
  assert.equal(login.status, 200);
  assert.equal(login.body.user.hasPassword, true);
  // second set-password is refused; change-password is the path now
  assert.equal((await request(app).post("/api/auth/set-password").set(auth(login.body.accessToken)).send({ password: "another12345" })).status, 400);
});
