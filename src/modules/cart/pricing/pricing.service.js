// Prices raw cart lines ({productId,size,qty,unitPrice?}) against the catalogue.
// Orchestrates the line-rule chain and the shipping strategy; owns no rule itself.
const lineKey = (l) => `${l.productId}|${l.size || ""}`;

class PricingService {
  constructor({ products, rules, shipping, currency }) {
    this.products = products;
    this.rules = rules;
    this.shipping = shipping;
    this.currency = currency;
  }

  // Merge duplicate lines (same product + size). Lines may be Mongoose subdocs, so copy fields.
  static mergeLines(rawItems) {
    const merged = new Map();
    for (const raw of rawItems) {
      const line = { productId: raw.productId, size: raw.size || null, qty: Number(raw.qty || 1), unitPrice: raw.unitPrice };
      const prev = merged.get(lineKey(line));
      merged.set(lineKey(line), { ...line, qty: (prev?.qty || 0) + line.qty });
    }
    return [...merged.values()];
  }

  async price(rawItems) {
    const lines = PricingService.mergeLines(rawItems);
    const products = await this.products.findManyByIds([...new Set(lines.map((l) => String(l.productId)))]);
    const byId = new Map(products.map((p) => [p._id.toString(), p]));

    const items = [];
    const problems = [];
    for (const line of lines) {
      const ctx = { line, product: byId.get(String(line.productId)) };
      const { accepted, problems: lineProblems } = this.rules.evaluate(ctx);
      problems.push(...lineProblems);
      if (!accepted) continue;
      const { product, size, unitPrice, qty, available } = ctx;
      items.push({ productId: product._id, title: product.title, slug: product.slug, image: product.images[0] || null, size, unitPrice, qty, available, lineTotal: unitPrice * qty });
    }

    const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
    const shipping = this.shipping.charge({ subtotal, items });
    return { items, problems, subtotal, shipping, total: subtotal + shipping, currency: this.currency };
  }
}

module.exports = { PricingService, lineKey };
