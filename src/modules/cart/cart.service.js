const Cart = require("./cart.model");
const { priceItems } = require("./pricing.service");

const key = (l) => `${l.productId}|${l.size || ""}`;

async function getOrCreate(userId) {
  return (await Cart.findOne({ userId })) || (await Cart.create({ userId, items: [] }));
}

function mergeLines(existing, incoming) {
  const map = new Map(existing.map((i) => [key(i), { productId: i.productId, size: i.size || null, qty: i.qty }]));
  for (const line of incoming) {
    const prev = map.get(key(line));
    map.set(key(line), { productId: line.productId, size: line.size || null, qty: Math.min(20, (prev?.qty || 0) + line.qty) });
  }
  return [...map.values()];
}

// Price the cart and drop lines that no longer exist so the stored cart heals itself.
async function view(cart) {
  const priced = await priceItems(cart.items);
  const keep = new Set(priced.items.map(key));
  const cleaned = cart.items.filter((i) => keep.has(key(i)));
  if (cleaned.length !== cart.items.length) {
    cart.items = cleaned;
    await cart.save();
  }
  return { id: cart._id, ...priced, updatedAt: cart.updatedAt };
}

const validateGuest = (items) => priceItems(items);

async function get(userId) {
  return view(await getOrCreate(userId));
}

async function replace(userId, items) {
  const cart = await getOrCreate(userId);
  cart.items = mergeLines([], items);
  await cart.save();
  return view(cart);
}

async function merge(userId, items) {
  const cart = await getOrCreate(userId);
  cart.items = mergeLines(cart.items, items);
  await cart.save();
  return view(cart);
}

async function addLine(userId, line) {
  return merge(userId, [line]);
}

async function setQty(userId, productId, size, qty) {
  const cart = await getOrCreate(userId);
  const idx = cart.items.findIndex((i) => i.productId.toString() === productId && (i.size || null) === (size || null));
  if (idx >= 0) {
    if (qty === 0) cart.items.splice(idx, 1);
    else cart.items[idx].qty = qty;
    await cart.save();
  }
  return view(cart);
}

async function removeLine(userId, productId, size) {
  return setQty(userId, productId, size, 0);
}

async function clear(userId) {
  const cart = await getOrCreate(userId);
  cart.items = [];
  await cart.save();
  return view(cart);
}

module.exports = { validateGuest, get, replace, merge, addLine, setQty, removeLine, clear };
