const User = require("./user.model");
const Order = require("../orders/order.model");
const { notFound, unauthorized, badRequest } = require("../../shared/errors");

const MAX_ADDRESSES = 5;

async function updateProfile(user, data) {
  Object.assign(user, data); // validated keys only; isAdmin can never arrive here
  await user.save();
  return user.toPublic();
}

async function changePassword(userId, currentPassword, newPassword) {
  const user = await User.findById(userId).select("+passwordHash");
  if (!(await user.verifyPassword(currentPassword))) throw unauthorized("Current password is incorrect");
  await user.setPassword(newPassword); // bumps tokenVersion -> old tokens die
  await user.save();
}

async function addAddress(user, address) {
  if (user.addresses.length >= MAX_ADDRESSES) throw badRequest(`Address book is full (max ${MAX_ADDRESSES})`);
  user.addresses.push(address);
  await user.save();
  return user.addresses;
}

async function removeAddress(user, addressId) {
  const before = user.addresses.length;
  user.addresses = user.addresses.filter((a) => a._id.toString() !== addressId);
  if (user.addresses.length === before) throw notFound("Address not found");
  await user.save();
  return user.addresses;
}

async function closeAccount(user) {
  user.disabled = true;
  user.tokenVersion += 1;
  await user.save();
}

// ---- admin ----------------------------------------------------------------

async function list({ q, page, limit, skip }) {
  const filter = q ? { $or: [{ name: new RegExp(escape(q), "i") }, { email: new RegExp(escape(q), "i") }] } : {};
  const [users, total] = await Promise.all([
    User.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    User.countDocuments(filter),
  ]);
  return { users, page, limit, total };
}
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

async function getWithOrders(id) {
  const user = await User.findById(id);
  if (!user) throw notFound("User not found");
  const orders = await Order.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20);
  return { user, orders };
}

async function adminUpdate(actor, id, data) {
  const user = await User.findById(id);
  if (!user) throw notFound("User not found");
  if (user._id.equals(actor._id) && data.isAdmin === false) throw badRequest("You cannot remove your own admin role");
  Object.assign(user, data);
  if (data.disabled) user.tokenVersion += 1;
  await user.save();
  return user;
}

async function signupsByMonth(months = 12) {
  const since = new Date();
  since.setMonth(since.getMonth() - months);
  const rows = await User.aggregate([
    { $match: { createdAt: { $gte: since } } },
    { $group: { _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } }, total: { $sum: 1 } } },
    { $sort: { "_id.y": 1, "_id.m": 1 } },
  ]);
  return rows.map((r) => ({ year: r._id.y, month: r._id.m, total: r.total }));
}

module.exports = { updateProfile, changePassword, addAddress, removeAddress, closeAccount, list, getWithOrders, adminUpdate, signupsByMonth };
