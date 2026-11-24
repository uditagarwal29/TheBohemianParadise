// Strategy: how shipping is charged. Swap the strategy in the container to change the policy
// (per-item, by region, weight tiers...) without touching the pricing service.

class ShippingStrategy {
  /** @param {{subtotal:number, items:Array}} cart  @returns {number} */
  charge(cart) {
    void cart;
    return 0;
  }
}

class FreeShipping extends ShippingStrategy {}

// Flat fee, waived above a threshold (0 = never waived). Empty carts ship for nothing.
class FlatRateWithThreshold extends ShippingStrategy {
  constructor({ flat, freeAbove }) {
    super();
    this.flat = flat;
    this.freeAbove = freeAbove;
  }
  charge({ subtotal, items }) {
    if (!items.length) return 0;
    if (this.freeAbove > 0 && subtotal >= this.freeAbove) return 0;
    return this.flat;
  }
}

function createShippingStrategy(storeConfig) {
  return storeConfig.shippingFlat > 0 ? new FlatRateWithThreshold({ flat: storeConfig.shippingFlat, freeAbove: storeConfig.freeShippingAbove }) : new FreeShipping();
}

module.exports = { ShippingStrategy, FreeShipping, FlatRateWithThreshold, createShippingStrategy };
