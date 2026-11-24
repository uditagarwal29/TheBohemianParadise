const { unauthorized, conflict, badRequest } = require("../../shared/errors");

// Sign-up and sign-in. Identity providers (Google today) are injected as adapters, so adding
// Apple or Facebook is another adapter in the container, not a change here.
class AuthService {
  constructor({ users, tokens, identityProviders = [] }) {
    this.users = users;
    this.tokens = tokens;
    this.identityProviders = new Map(identityProviders.map((p) => [p.id, p]));
  }

  session(user, extra) {
    return { user: user.toPublic(), accessToken: this.tokens.sign(user, extra) };
  }

  async register({ name, email, password }) {
    if (await this.users.exists({ email })) throw conflict("An account with this email already exists");
    const user = this.users.build({ name, email, emailVerified: false });
    await user.setPassword(password);
    await this.users.save(user);
    return this.session(user);
  }

  async login({ email, password }) {
    const user = await this.users.findByEmail(email, { withPassword: true });
    // Same message for unknown email and wrong password: don't leak which accounts exist.
    if (!user || user.disabled) throw unauthorized("Invalid email or password");
    if (!user.passwordHash) throw unauthorized("This account uses Google sign-in. Continue with Google, or set a password from your account page after signing in.");
    if (!(await user.verifyPassword(password))) throw unauthorized("Invalid email or password");
    return this.session(user);
  }

  // Sign in or sign up with an external identity. Links to an existing account with the same
  // verified email so a password customer can also use the provider.
  async loginWithProvider(providerId, idToken) {
    const provider = this.identityProviders.get(providerId);
    if (!provider?.enabled) throw badRequest(`${providerId} sign-in is not available`);
    let profile;
    try {
      profile = await provider.verify(idToken);
    } catch {
      throw unauthorized(`${provider.label || "Provider"} sign-in failed, please try again`);
    }
    if (!profile.email) throw unauthorized("Your account has no verified email");

    let user = await this.users.findByGoogleOrEmail(profile.sub, profile.email);
    let created = false;
    if (!user) {
      user = this.users.build({ name: profile.name, email: profile.email, googleId: profile.sub, avatar: profile.picture, emailVerified: true });
      created = true;
    } else {
      if (user.disabled) throw unauthorized("Account not available");
      if (!user.googleId) user.googleId = profile.sub;
      if (!user.avatar && profile.picture) user.avatar = profile.picture;
      user.emailVerified = true;
    }
    await this.users.save(user);
    return { ...this.session(user), created };
  }

  async setInitialPassword(userId, password) {
    const user = await this.users.findByIdWithPassword(userId);
    if (user.passwordHash) throw badRequest("You already have a password; use change password instead");
    await user.setPassword(password);
    await this.users.save(user);
  }

  async logoutAll(user) {
    user.tokenVersion = (user.tokenVersion || 0) + 1;
    await this.users.save(user);
  }

  providers() {
    const google = this.identityProviders.get("google");
    return { password: true, google: google?.enabled ? { clientId: google.clientId } : false };
  }
}

module.exports = { AuthService };
