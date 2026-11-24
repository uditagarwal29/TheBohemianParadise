// Adapter: verifies Google ID tokens and returns a provider-neutral profile
// { sub, email, name, picture }. Other identity providers would implement the same shape.
class IdentityProvider {
  get id() {
    return "none";
  }
  get enabled() {
    return false;
  }
  async verify(idToken) {
    void idToken;
    throw new Error("Identity provider not configured");
  }
}

class GoogleIdentityProvider extends IdentityProvider {
  constructor({ clientId }) {
    super();
    this.clientId = clientId;
    this.client = null;
  }
  get id() {
    return "google";
  }
  get label() {
    return "Google";
  }
  get enabled() {
    return Boolean(this.clientId);
  }
  async verify(idToken) {
    if (!this.enabled) throw new Error("Google sign-in is not configured");
    if (!this.client) {
      const { OAuth2Client } = require("google-auth-library");
      this.client = new OAuth2Client(this.clientId);
    }
    const ticket = await this.client.verifyIdToken({ idToken, audience: this.clientId });
    const p = ticket.getPayload();
    return {
      sub: p.sub,
      email: p.email_verified ? p.email.toLowerCase() : null, // only trust verified emails
      name: p.name || p.given_name || (p.email ? p.email.split("@")[0] : "Customer"),
      picture: p.picture || null,
    };
  }
}

module.exports = { IdentityProvider, GoogleIdentityProvider };
