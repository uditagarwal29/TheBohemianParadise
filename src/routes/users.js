const router = require("express").Router();
const User = require("../models/User");
const Order = require("../models/Order");
const { requireAuth, requireAdmin } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { wrap, notFound, unauthorized, badRequest } = require("../errors");

const addressShape = {
  label: { type: "string", max: 40 },
  fullName: { type: "string", required: true, max: 80 },
  phone: { type: "string", required: true, max: 20 },
  line1: { type: "string", required: true, max: 120 },
  line2: { type: "string", max: 120 },
  city: { type: "string", required: true, max: 60 },
  state: { type: "string", required: true, max: 60 },
  postalCode: { type: "string", required: true, max: 12 },
  country: { type: "string", max: 2 },
};

// ---- self-service -------------------------------------------------------

// PATCH /api/users/me  { name?, email? }
router.patch(
  "/me",
  requireAuth,
  validate({ name: { type: "string", min: 1, max: 80 }, email: { type: "email" } }),
  wrap(async (req, res) => {
    Object.assign(req.user, req.data); // only validated keys; isAdmin can never arrive here
    await req.user.save();
    res.json({ user: req.user.toPublic() });
  })
);

// POST /api/users/me/password  { currentPassword, newPassword }
router.post(
  "/me/password",
  requireAuth,
  validate({
    currentPassword: { type: "string", required: true },
    newPassword: { type: "string", required: true, min: 8, max: 128 },
  }),
  wrap(async (req, res) => {
    const user = await User.findById(req.user._id).select("+passwordHash");
    if (!(await user.verifyPassword(req.data.currentPassword))) throw unauthorized("Current password is incorrect");
    await user.setPassword(req.data.newPassword);
    await user.save();
    // Caller must sign in again (tokenVersion bumped).
    res.json({ ok: true, reauthenticate: true });
  })
);

// Addresses
router.post(
  "/me/addresses",
  requireAuth,
  validate(addressShape),
  wrap(async (req, res) => {
    if (req.user.addresses.length >= 5) throw badRequest("Address book is full (max 5)");
    req.user.addresses.push(req.data);
    await req.user.save();
    res.status(201).json({ addresses: req.user.addresses });
  })
);

router.delete(
  "/me/addresses/:addressId",
  requireAuth,
  wrap(async (req, res) => {
    const before = req.user.addresses.length;
    req.user.addresses = req.user.addresses.filter((a) => a._id.toString() !== req.params.addressId);
    if (req.user.addresses.length === before) throw notFound("Address not found");
    await req.user.save();
    res.json({ addresses: req.user.addresses });
  })
);

// DELETE /api/users/me  -> close account (orders are kept for records)
router.delete(
  "/me",
  requireAuth,
  wrap(async (req, res) => {
    req.user.disabled = true;
    req.user.tokenVersion += 1;
    await req.user.save();
    res.json({ ok: true });
  })
);

// ---- admin -------------------------------------------------------------

router.get(
  "/",
  requireAdmin,
  wrap(async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit, 10) || 50, 200);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const [users, total] = await Promise.all([
      User.find().sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
      User.countDocuments(),
    ]);
    res.json({ users, page, limit, total });
  })
);

router.get(
  "/stats",
  requireAdmin,
  wrap(async (req, res) => {
    const since = new Date();
    since.setFullYear(since.getFullYear() - 1);
    const data = await User.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { y: { $year: "$createdAt" }, m: { $month: "$createdAt" } }, total: { $sum: 1 } } },
      { $sort: { "_id.y": 1, "_id.m": 1 } },
    ]);
    res.json(data.map((d) => ({ year: d._id.y, month: d._id.m, total: d.total })));
  })
);

router.get(
  "/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw notFound("User not found");
    const orders = await Order.find({ userId: user._id }).sort({ createdAt: -1 }).limit(20);
    res.json({ user, orders });
  })
);

// PATCH /api/users/:id  admin: { isAdmin?, disabled? }
router.patch(
  "/:id",
  requireAdmin,
  validate({ isAdmin: { type: "boolean" }, disabled: { type: "boolean" } }),
  wrap(async (req, res) => {
    const user = await User.findById(req.params.id);
    if (!user) throw notFound("User not found");
    if (user._id.equals(req.user._id) && req.data.isAdmin === false) throw badRequest("You cannot remove your own admin role");
    Object.assign(user, req.data);
    if (req.data.disabled) user.tokenVersion += 1;
    await user.save();
    res.json({ user });
  })
);

module.exports = router;
