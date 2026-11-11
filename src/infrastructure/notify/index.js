// Outbound messages (email + SMS) behind one interface so auth code never knows the provider.
//   sender().email({ to, subject, text, html }) / sender().sms({ to, text })
// Email: any SMTP server via SMTP_URL (Gmail app password, Brevo, Zoho, ...).
// SMS:   Twilio REST API (TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN / TWILIO_FROM). Indian numbers
//        need DLT-registered templates on any provider; swap the sms() body to MSG91 etc. if preferred.
// Without configuration the "console" driver logs messages, which is what local development uses.
const { config } = require("../../config");

function consoleDriver() {
  return {
    name: "console",
    channels: { email: true, sms: true },
    async email(msg) {
      console.log(`[notify:email] to=${msg.to} subject=${JSON.stringify(msg.subject)}\n${msg.text}`);
    },
    async sms(msg) {
      console.log(`[notify:sms] to=${msg.to} ${msg.text}`);
    },
  };
}

function realDriver() {
  const n = config.notify;
  let transporter = null;
  if (n.smtpUrl) {
    const nodemailer = require("nodemailer");
    transporter = nodemailer.createTransport(n.smtpUrl);
  }
  const smsReady = Boolean(n.twilioSid && n.twilioToken && n.twilioFrom);
  return {
    name: [transporter && "smtp", smsReady && "twilio"].filter(Boolean).join("+") || "none",
    channels: { email: Boolean(transporter), sms: smsReady },
    async email(msg) {
      if (!transporter) throw new Error("Email is not configured (SMTP_URL)");
      await transporter.sendMail({ from: n.emailFrom, to: msg.to, subject: msg.subject, text: msg.text, html: msg.html });
    },
    async sms(msg) {
      if (!smsReady) throw new Error("SMS is not configured (TWILIO_*)");
      const body = new URLSearchParams({ To: msg.to, From: n.twilioFrom, Body: msg.text });
      const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${n.twilioSid}/Messages.json`, {
        method: "POST",
        headers: { Authorization: `Basic ${Buffer.from(`${n.twilioSid}:${n.twilioToken}`).toString("base64")}`, "Content-Type": "application/x-www-form-urlencoded" },
        body,
      });
      if (!res.ok) throw new Error(`Twilio error ${res.status}: ${(await res.text()).slice(0, 200)}`);
    },
  };
}

let instance = null;
function sender() {
  if (!instance) {
    const n = config.notify;
    const configured = n.smtpUrl || (n.twilioSid && n.twilioToken && n.twilioFrom);
    instance = configured ? realDriver() : consoleDriver();
  }
  return instance;
}

module.exports = { sender };
