// Shared test helpers: an OTP sender that captures codes, and a register() that does the OTP dance.
const request = require("supertest");

function captureSender() {
  const sent = [];
  return {
    name: "capture",
    channels: { email: true, sms: true },
    sent,
    async email(m) { sent.push({ channel: "email", to: m.to, code: m.text.match(/\b(\d{6})\b/)[1] }); },
    async sms(m) { sent.push({ channel: "sms", to: m.to, code: m.text.match(/\b(\d{6})\b/)[1] }); },
    last(to) { return [...sent].reverse().find((s) => !to || s.to === to); },
  };
}

// Full registration through the API: request code -> verify -> register. Returns the access token.
async function registerUser(app, sender, { name = "Buyer", email, password = "buyerpass123", phone } = {}) {
  const channel = phone && !email ? "sms" : "email";
  const destination = channel === "email" ? email : phone;
  const r1 = await request(app).post("/api/auth/otp/request").send({ purpose: "register", channel, destination });
  if (r1.status !== 200) throw new Error(`otp request ${r1.status} ${JSON.stringify(r1.body)}`);
  const code = sender.last().code;
  const r2 = await request(app).post("/api/auth/otp/verify").send({ purpose: "register", channel, destination, code });
  if (r2.status !== 200) throw new Error(`otp verify ${r2.status} ${JSON.stringify(r2.body)}`);
  const r3 = await request(app).post("/api/auth/register").send({ name, email: email || `${phone.replace(/\D/g, "")}@example.com`, phone, password, verificationToken: r2.body.verificationToken });
  if (r3.status !== 201) throw new Error(`register ${r3.status} ${JSON.stringify(r3.body)}`);
  return r3.body;
}

module.exports = { captureSender, registerUser };
