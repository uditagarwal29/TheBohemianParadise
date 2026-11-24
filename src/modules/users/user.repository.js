const { BaseRepository } = require("../../shared/kernel/repository");
const User = require("./user.model");

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

class UserRepository extends BaseRepository {
  constructor() {
    super(User);
  }
  findByEmail(email, { withPassword = false } = {}) {
    const q = this.findOne({ email });
    return withPassword ? q.select("+passwordHash") : q;
  }
  findByIdWithPassword(id) {
    return this.findById(id).select("+passwordHash");
  }
  findByGoogleOrEmail(googleId, email) {
    return this.findOne({ $or: [{ googleId }, { email }] }).select("+passwordHash");
  }
  searchFilter(q) {
    if (!q) return {};
    const rx = new RegExp(escapeRegex(q), "i");
    return { $or: [{ name: rx }, { email: rx }] };
  }
  signupsByMonth(since) {
    return this.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } }, total: { $sum: 1 } } },
      { $sort: { "_id.y": 1, "_id.m": 1 } },
    ]).then((rows) => rows.map((r) => ({ year: r._id.y, month: r._id.m, total: r.total })));
  }
}

module.exports = { UserRepository, escapeRegex };
