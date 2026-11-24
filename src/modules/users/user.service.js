const { notFound, unauthorized, badRequest } = require("../../shared/errors");

const MAX_ADDRESSES = 5;

class UserService {
  constructor({ users, orders }) {
    this.users = users;
    this.orders = orders;
  }

  // ---- self-service ---------------------------------------------------------
  async updateProfile(user, data) {
    Object.assign(user, data); // validated keys only; isAdmin can never arrive here
    await this.users.save(user);
    return user.toPublic();
  }

  async changePassword(userId, currentPassword, newPassword) {
    const user = await this.users.findByIdWithPassword(userId);
    if (!(await user.verifyPassword(currentPassword))) throw unauthorized("Current password is incorrect");
    await user.setPassword(newPassword); // bumps tokenVersion -> old tokens die
    await this.users.save(user);
  }

  async addAddress(user, address) {
    if (user.addresses.length >= MAX_ADDRESSES) throw badRequest(`Address book is full (max ${MAX_ADDRESSES})`);
    user.addresses.push(address);
    await this.users.save(user);
    return user.addresses;
  }

  async removeAddress(user, addressId) {
    const before = user.addresses.length;
    user.addresses = user.addresses.filter((a) => a._id.toString() !== addressId);
    if (user.addresses.length === before) throw notFound("Address not found");
    await this.users.save(user);
    return user.addresses;
  }

  async closeAccount(user) {
    user.disabled = true;
    user.tokenVersion += 1;
    await this.users.save(user);
  }

  // ---- admin -------------------------------------------------------------------
  async list({ q, page, limit, skip }) {
    const { items, total } = await this.users.findPage(this.users.searchFilter(q), { sort: { createdAt: -1 }, page, limit, skip });
    return { users: items, page, limit, total };
  }

  async getWithOrders(id) {
    const user = await this.users.findById(id);
    if (!user) throw notFound("User not found");
    const orders = await this.orders.forUser(user._id, 20);
    return { user, orders };
  }

  async adminUpdate(actor, id, data) {
    const user = await this.users.findById(id);
    if (!user) throw notFound("User not found");
    if (user._id.equals(actor._id) && data.isAdmin === false) throw badRequest("You cannot remove your own admin role");
    Object.assign(user, data);
    if (data.disabled) user.tokenVersion += 1;
    await this.users.save(user);
    return user;
  }

  signupsByMonth(months = 12) {
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    return this.users.signupsByMonth(since);
  }
}

module.exports = { UserService };
