const router = require("express").Router();
const Cart = require("../models/Cart");
const { requireAuth } = require("../middleware/auth");
const { validate } = require("../middleware/validate");
const { priceItems } = require("../services/cart");
const { wrap } = require("../errors");

const lineShape = {
  productId: { type: "objectId", required: true },
  size: { type: "string", max: 20 },
  qty: { type: "integer", required: true, min: 1, max: 20 },
  unitPrice: { type: "number" }, // optional: what the client last saw, to flag price changes
};
const itemsShape = { items: { type: "array", required: true, max: 50, items: { type: "object", shape: lineShape } } };

async function respondWithCart(cart, res, status = 200) {
  const priced = await priceItems(cart.items);
  // Drop lines that no longer exist so the stored cart heals itself.
  const keep = new Set(priced.items.map((i) => `${i.productId}|${i.size || ""}`));
  const cleaned = cart.items.filter((i) => keep.has(`${i.productId}|${i.size || ""}`));
  if (cleaned.length !== cart.items.length) {
    cart.items = cleaned;
    await cart.save();
  }
  res.status(status).json({ id: cart._id, ...priced, updatedAt: cart.updatedAt });
}

async function getOrCreateCart(userId) {
  return (await Cart.findOne({ userId })) || (await Cart.create({ userId, items: [] }));
}

function mergeLines(existing, incoming) {
  const map = new Map(
    existing.map((i) => [`${i.productId}|${i.size || ""}`, { productId: i.productId, size: i.size || null, qty: i.qty }])
  );
  for (const line of incoming) {
    const key = `${line.productId}|${line.size || ""}`;
    const prev = map.get(key);
    map.set(key, { productId: line.productId, size: line.size || null, qty: Math.min(20, (prev?.qty || 0) + line.qty) });
  }
  return [...map.values()];
}

// ---- guest --------------------------------------------------------------

// POST /api/carts/validate  { items } -> priced cart + problems. No auth; used by guests
// before they are asked to sign in, and by any client to refresh prices/stock.
router.post(
  "/validate",
  validate(itemsShape),
  wrap(async (req, res) => res.json(await priceItems(req.data.items)))
);

// ---- signed-in ----------------------------------------------------------

// GET /api/carts/me
router.get(
  "/me",
  requireAuth,
  wrap(async (req, res) => respondWithCart(await getOrCreateCart(req.user._id), res))
);

// PUT /api/carts/me  { items } -> replace the whole cart
router.put(
  "/me",
  requireAuth,
  validate(itemsShape),
  wrap(async (req, res) => {
    const cart = await getOrCreateCart(req.user._id);
    cart.items = mergeLines([], req.data.items);
    await cart.save();
    await respondWithCart(cart, res);
  })
);

// POST /api/carts/me/merge  { items } -> add a guest cart into the account cart (call after login)
router.post(
  "/me/merge",
  requireAuth,
  validate(itemsShape),
  wrap(async (req, res) => {
    const cart = await getOrCreateCart(req.user._id);
    cart.items = mergeLines(cart.items, req.data.items);
    await cart.save();
    await respondWithCart(cart, res);
  })
);

// POST /api/carts/me/items  { productId, size?, qty } -> add (increments if present)
router.post(
  "/me/items",
  requireAuth,
  validate(lineShape),
  wrap(async (req, res) => {
    const cart = await getOrCreateCart(req.user._id);
    cart.items = mergeLines(cart.items, [req.data]);
    await cart.save();
    await respondWithCart(cart, res, 201);
  })
);

// PATCH /api/carts/me/items/:productId?size=  { qty } -> set quantity (0 removes)
router.patch(
  "/me/items/:productId",
  requireAuth,
  validate({ qty: { type: "integer", required: true, min: 0, max: 20 } }),
  wrap(async (req, res) => {
    const cart = await getOrCreateCart(req.user._id);
    const size = req.query.size || null;
    const idx = cart.items.findIndex((i) => i.productId.toString() === req.params.productId && (i.size || null) === size);
    if (idx >= 0) {
      if (req.data.qty === 0) cart.items.splice(idx, 1);
      else cart.items[idx].qty = req.data.qty;
      await cart.save();
    }
    await respondWithCart(cart, res);
  })
);

// DELETE /api/carts/me/items/:productId?size=
router.delete(
  "/me/items/:productId",
  requireAuth,
  wrap(async (req, res) => {
    const cart = await getOrCreateCart(req.user._id);
    const size = req.query.size || null;
    cart.items = cart.items.filter((i) => !(i.productId.toString() === req.params.productId && (i.size || null) === size));
    await cart.save();
    await respondWithCart(cart, res);
  })
);

// DELETE /api/carts/me -> empty
router.delete(
  "/me",
  requireAuth,
  wrap(async (req, res) => {
    const cart = await getOrCreateCart(req.user._id);
    cart.items = [];
    await cart.save();
    await respondWithCart(cart, res);
  })
);

module.exports = router;
