// Verifies Google ID tokens issued to our OAuth client. The browser obtains the
// token with Google Identity Services and posts it to /api/auth/google; we never
// handle Google passwords or OAuth secrets here (ID-token flow needs none).
const { OAuth2Client } = require("google-auth-library");
const { config } = require("../../config");

let client = null;

function enabled() {
  return Boolean(config.auth.googleClientId);
}

async function verifyIdToken(idToken) {
  if (!enabled()) throw new Error("Google sign-in is not configured");
  client = client || new OAuth2Client(config.auth.googleClientId);
  const ticket = await client.verifyIdToken({ idToken, audience: config.auth.googleClientId });
  const p = ticket.getPayload();
  // Only trust the email if Google says it is verified for this account.
  return {
    sub: p.sub,
    email: p.email_verified ? p.email.toLowerCase() : null,
    name: p.name || p.given_name || (p.email ? p.email.split("@")[0] : "Customer"),
    picture: p.picture || null,
  };
}

module.exports = { enabled, verifyIdToken };
