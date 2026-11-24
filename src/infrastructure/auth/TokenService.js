const jwt = require("jsonwebtoken");

// Single responsibility: mint and verify our own session tokens. Nothing else knows the
// secret or the algorithm.
class TokenService {
  constructor({ secret, expiresIn }) {
    this.secret = secret;
    this.expiresIn = expiresIn;
  }
  sign(user, extra = {}) {
    return jwt.sign({ sub: user._id.toString(), v: user.tokenVersion || 0, ...extra }, this.secret, { expiresIn: this.expiresIn });
  }
  /** @returns {{sub: string, v: number}|null} null when invalid or expired */
  verify(token) {
    try {
      return jwt.verify(token, this.secret, { algorithms: ["HS256"] });
    } catch {
      return null;
    }
  }
}

module.exports = { TokenService };
