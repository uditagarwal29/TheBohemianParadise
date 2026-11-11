// One-time codes: registration gate (email and SMS), passwordless sign-in, forgot-password reset,
// throttling, wrong-code lockout, and that the code never leaks in production mode.
process.env.JWT_SECRET = "test-secret-test-secret-test-secret-123456";
process.env.MONGO_URL = "mongodb://127.0.0.1:1/placeholder";
process.env.AUTH_RATE_LIMIT = "100000";
process.env.OTP_COOLDOWN_SECONDS = "0";
process.env.OTP_MAX_PER_HOUR = "8";
process.env.OTP_MAX_ATTEMPTS = "3";

const { test, before, after, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");
const mongoose = require("mongoose");
const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const { buildApp } = require("../src/app");
const { captureSender, registerUser } = require("./helpers");
const User = require("../src/modules/users/user.model");
const Otp = require("../src/modules/auth/otp.model");

const otpSender = captureSender();
let mongod, app;
const auth = (t) => ({ Authorization: `Bearer ${t}` });
const req = (purpose, channel, destination) => request(app).post("/api/auth/otp/request").send({ purpose, channel, destination });
const ver = (purpose, channel, destination, code) => request(app).post("/api/auth/otp/verify").send({ purpose, channel, destination, code });

before(async () => {
  mongod = await MongoMemoryServer.create();
  await mongoose.connect(mongod.getUri());
  app = buildApp({ publicDir: path.join(__dirname, "fixtures", "public"), otpSender });
});
after(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});
beforeEach(async () => {
  await Promise.all(Object.values(mongoose.connection.collections).map((c) => c.deleteMany({})));
  otpSender.sent.length = 0;
});

test("registration needs a verified contact: no token -> 400, forged/mismatched token -> rejected, valid -> 201", async () => {
  const noToken = await request(app).post("/api/auth/register").send({ name: "P", email: "p@example.com", password: "buyerpass123" });
  assert.equal(noToken.status, 400);
  assert.ok(noToken.body.details.verificationToken);

  const forged = await request(app).post("/api/auth/register").send({ name: "P", email: "p@example.com", password: "buyerpass123", verificationToken: "abc.def.ghi" });
  assert.equal(forged.status, 401);

  const r1 = await req("register", "email", "P@Example.com ");
  assert.equal(r1.status, 200, JSON.stringify(r1.body));
  assert.equal(r1.body.destination, "p•@example.com");
  assert.equal(r1.body.devCode, undefined, "capture sender is not the console sender; no code in the response");
  const { code, to } = otpSender.last();
  assert.equal(to, "p@example.com", "destination normalised");
  assert.match(code, /^\d{6}$/);

  const v = await ver("register", "email", "p@example.com", code);
  assert.equal(v.status, 200);
  assert.ok(v.body.verificationToken);

  // token is bound to p@example.com: registering a different email with it fails
  const mismatch = await request(app).post("/api/auth/register").send({ name: "P", email: "other@example.com", password: "buyerpass123", verificationToken: v.body.verificationToken });
  assert.equal(mismatch.status, 400);

  const ok = await request(app).post("/api/auth/register").send({ name: "P", email: "p@example.com", password: "buyerpass123", verificationToken: v.body.verificationToken });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.user.emailVerified, true);
  assert.equal(ok.body.user.phoneVerified, false);

  // the code is single-use
  assert.equal((await ver("register", "email", "p@example.com", code)).status, 401);
  // and the email is now taken
  assert.equal((await req("register", "email", "p@example.com")).status, 409);
});

test("registration by SMS: Indian 10-digit number normalised to +91, phone verified, email stored unverified", async () => {
  const r = await req("register", "sms", "98765 43210");
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(otpSender.last().to, "+919876543210");
  assert.equal(otpSender.last().channel, "sms");
  const v = await ver("register", "sms", "9876543210", otpSender.last().code);
  const reg = await request(app).post("/api/auth/register").send({ name: "S", email: "s@example.com", phone: "+91 98765 43210", password: "buyerpass123", verificationToken: v.body.verificationToken });
  assert.equal(reg.status, 201, JSON.stringify(reg.body));
  assert.equal(reg.body.user.phone, "+919876543210");
  assert.equal(reg.body.user.phoneVerified, true);
  assert.equal(reg.body.user.emailVerified, false);
  // same phone cannot be registered twice
  assert.equal((await req("register", "sms", "+919876543210")).status, 409);
  assert.equal((await req("register", "sms", "12")).status, 400, "garbage number rejected");
});

test("passwordless sign-in by email or phone; unknown destination gets the same 200 but no code is sent", async () => {
  await registerUser(app, otpSender, { email: "a@example.com", phone: "+919000000001" });
  otpSender.sent.length = 0;

  const ghost = await req("login", "email", "ghost@example.com");
  assert.equal(ghost.status, 200);
  assert.equal(ghost.body.sent, true);
  assert.equal(otpSender.sent.length, 0, "nothing sent for unknown accounts");

  await req("login", "email", "a@example.com");
  const byEmail = await ver("login", "email", "a@example.com", otpSender.last().code);
  assert.equal(byEmail.status, 200, JSON.stringify(byEmail.body));
  assert.ok(byEmail.body.accessToken);
  assert.equal(byEmail.body.canResetPassword, true);
  assert.equal((await request(app).get("/api/auth/me").set(auth(byEmail.body.accessToken))).status, 200);

  await req("login", "sms", "9000000001");
  const byPhone = await ver("login", "sms", "+919000000001", otpSender.last().code);
  assert.equal(byPhone.status, 200);
  assert.equal(byPhone.body.user.email, "a@example.com");
});

test("forgot password: OTP sign-in then reset without the old password; a password session cannot reset", async () => {
  await registerUser(app, otpSender, { email: "f@example.com", password: "oldpass12345" });
  await req("login", "email", "f@example.com");
  const otpSession = await ver("login", "email", "f@example.com", otpSender.last().code);

  const reset = await request(app).post("/api/auth/reset-password").set(auth(otpSession.body.accessToken)).send({ password: "brandnew12345" });
  assert.equal(reset.status, 200);
  assert.equal(reset.body.reauthenticate, true);
  assert.equal((await request(app).get("/api/auth/me").set(auth(otpSession.body.accessToken))).status, 401, "all sessions invalidated");
  assert.equal((await request(app).post("/api/auth/login").send({ email: "f@example.com", password: "oldpass12345" })).status, 401);
  const fresh = await request(app).post("/api/auth/login").send({ email: "f@example.com", password: "brandnew12345" });
  assert.equal(fresh.status, 200);

  // a normal password session is not allowed to reset without the current password
  const denied = await request(app).post("/api/auth/reset-password").set(auth(fresh.body.accessToken)).send({ password: "another12345" });
  assert.equal(denied.status, 401);
});

test("wrong codes lock the code after max attempts; expired codes are refused; per-hour cap holds", async () => {
  await req("register", "email", "w@example.com");
  const real = otpSender.last().code;
  const wrong = real === "000000" ? "111111" : "000000";
  assert.equal((await ver("register", "email", "w@example.com", wrong)).status, 401);
  assert.equal((await ver("register", "email", "w@example.com", wrong)).status, 401);
  const third = await ver("register", "email", "w@example.com", wrong);
  assert.equal(third.status, 401);
  assert.match(third.body.error, /0 attempts left/);
  assert.equal((await ver("register", "email", "w@example.com", real)).status, 401, "locked even with the right code");

  // a new code supersedes the locked one
  await req("register", "email", "w@example.com");
  assert.equal((await ver("register", "email", "w@example.com", otpSender.last().code)).status, 200);

  // expired
  await req("register", "email", "x@example.com");
  await Otp.updateMany({ destination: "x@example.com" }, { expiresAt: new Date(Date.now() - 1000) });
  assert.equal((await ver("register", "email", "x@example.com", otpSender.last().code)).status, 401);

  // hourly cap (8 in this test's config; x@ has 1 so far)
  for (let i = 0; i < 7; i++) assert.equal((await req("register", "email", "x@example.com")).status, 200);
  const capped = await req("register", "email", "x@example.com");
  assert.equal(capped.status, 400);
  assert.match(capped.body.error, /Too many codes/);
});

test("providers advertise OTP channels; sms is refused when the sender has no sms channel", async () => {
  const p = await request(app).get("/api/auth/providers");
  assert.deepEqual(p.body.otp, { email: true, sms: true });
  const emailOnly = { ...otpSender, channels: { email: true, sms: false } };
  const app2 = buildApp({ publicDir: path.join(__dirname, "fixtures", "public"), otpSender: emailOnly });
  assert.deepEqual((await request(app2).get("/api/auth/providers")).body.otp, { email: true, sms: false });
  const r = await request(app2).post("/api/auth/otp/request").send({ purpose: "register", channel: "sms", destination: "9876543210" });
  assert.equal(r.status, 400);
  assert.match(r.body.error, /SMS codes are not available/);
  void User;
});
