const { lineKey } = require("./pricing/pricing.service");

// Server-side cart for signed-in customers. Guests price their browser cart via `validate`.
class CartService {
  constructor({ carts, pricing }) {
    this.carts = carts;
    this.pricing = pricing;
  }

  static mergeLines(existing, incoming, max = 20) {
    const map = new Map(existing.map((i) => [lineKey(i), { productId: i.productId, size: i.size || null, qty: i.qty }]));
    for (const line of incoming) {
      const prev = map.get(lineKey(line));
      map.set(lineKey(line), { productId: line.productId, size: line.size || null, qty: Math.min(max, (prev?.qty || 0) + line.qty) });
    }
    return [...map.values()];
  }

  // Price the cart and drop lines that no longer exist so the stored cart heals itself.
  async view(cart) {
    const priced = await this.pricing.price(cart.items);
    const keep = new Set(priced.items.map(lineKey));
    const cleaned = cart.items.filter((i) => keep.has(lineKey(i)));
    if (cleaned.length !== cart.items.length) {
      cart.items = cleaned;
      await this.carts.save(cart);
    }
    return { id: cart._id, ...priced, updatedAt: cart.updatedAt };
  }

  validateGuest(items) {
    return this.pricing.price(items);
  }
  async get(userId) {
    return this.view(await this.carts.forUser(userId));
  }
  async replace(userId, items) {
    return this.mutate(userId, () => CartService.mergeLines([], items));
  }
  async merge(userId, items) {
    return this.mutate(userId, (cart) => CartService.mergeLines(cart.items, items));
  }
  addLine(userId, line) {
    return this.merge(userId, [line]);
  }
  async setQty(userId, productId, size, qty) {
    return this.mutate(userId, (cart) => {
      const idx = cart.items.findIndex((i) => i.productId.toString() === productId && (i.size || null) === (size || null));
      if (idx < 0) return cart.items;
      const next = [...cart.items];
      if (qty === 0) next.splice(idx, 1);
      else next[idx].qty = qty;
      return next;
    });
  }
  removeLine(userId, productId, size) {
    return this.setQty(userId, productId, size, 0);
  }
  clear(userId) {
    return this.mutate(userId, () => []);
  }

  async mutate(userId, fn) {
    const cart = await this.carts.forUser(userId);
    cart.items = fn(cart);
    await this.carts.save(cart);
    return this.view(cart);
  }
}

module.exports = { CartService };
