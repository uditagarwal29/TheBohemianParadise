// Chain of Responsibility: each rule inspects one cart line and either rejects it (returns a
// problem and stops the chain), adjusts it (returns a problem but lets the chain continue) or
// passes. Adding a rule (e.g. "max 2 per customer") is a new class, not an edit (Open/Closed).

class LineRule {
  /** @returns {{ problem?: object, stop?: boolean } | null} */
  apply(ctx) {
    void ctx;
    return null;
  }
}

class ProductAvailableRule extends LineRule {
  apply({ line, product }) {
    if (!product || !product.active) return { stop: true, problem: { productId: line.productId, size: line.size, code: "unavailable", message: "This item is no longer available" } };
    return null;
  }
}

class SizeKnownRule extends LineRule {
  apply(ctx) {
    const { product, line } = ctx;
    ctx.size = product.variants.length ? line.size : null;
    ctx.unitPrice = product.priceFor(ctx.size);
    if (ctx.unitPrice === null) return { stop: true, problem: { productId: line.productId, size: line.size, code: "bad_size", message: "Please choose a size" } };
    return null;
  }
}

class InStockRule extends LineRule {
  apply(ctx) {
    const { product, size } = ctx;
    ctx.available = product.stockFor(size);
    if (ctx.available <= 0) return { stop: true, problem: { productId: product._id, size, code: "sold_out", message: `${product.title} is sold out` } };
    return null;
  }
}

class QuantityCapRule extends LineRule {
  constructor({ maxPerLine = 20 } = {}) {
    super();
    this.maxPerLine = maxPerLine;
  }
  apply(ctx) {
    const { product, size, available } = ctx;
    ctx.qty = Math.min(this.maxPerLine, Math.max(1, Math.floor(Number(ctx.line.qty) || 1)));
    if (ctx.qty > available) {
      ctx.qty = available;
      return { problem: { productId: product._id, size, code: "qty_reduced", message: `Only ${available} left of ${product.title}`, available } };
    }
    return null;
  }
}

class PriceChangedRule extends LineRule {
  apply({ line, product, size, unitPrice }) {
    if (line.unitPrice !== undefined && line.unitPrice !== null && Number(line.unitPrice) !== unitPrice) {
      return { problem: { productId: product._id, size, code: "price_changed", message: `Price of ${product.title} is now ${unitPrice}`, unitPrice } };
    }
    return null;
  }
}

// Runs the rules in order; returns { accepted, problems }.
class LineRuleChain {
  constructor(rules) {
    this.rules = rules;
  }
  evaluate(ctx) {
    const problems = [];
    for (const rule of this.rules) {
      const out = rule.apply(ctx);
      if (!out) continue;
      if (out.problem) problems.push(out.problem);
      if (out.stop) return { accepted: false, problems };
    }
    return { accepted: true, problems };
  }
  static standard() {
    return new LineRuleChain([new ProductAvailableRule(), new SizeKnownRule(), new InStockRule(), new QuantityCapRule(), new PriceChangedRule()]);
  }
}

module.exports = { LineRule, LineRuleChain, ProductAvailableRule, SizeKnownRule, InStockRule, QuantityCapRule, PriceChangedRule };
