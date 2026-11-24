const { badRequest, conflict } = require("../../shared/errors");

// Facade: one entry point for "place an order" that coordinates pricing, inventory, the
// payment strategy, the state machine and the cart. Callers see a single `checkout()`.
class CheckoutService {
  constructor({ orders, carts, pricing, inventory, paymentMethods, orderState, storeConfig }) {
    this.orders = orders;
    this.carts = carts;
    this.pricing = pricing;
    this.inventory = inventory;
    this.paymentMethods = paymentMethods;
    this.orderState = orderState;
    this.store = storeConfig;
  }

  paymentOptions() {
    const { currency, shippingFlat, freeShippingAbove } = this.store;
    return { methods: this.paymentMethods.describe(), currency, shippingFlat, freeShippingAbove };
  }

  static resolveAddress(user, { shippingAddress, addressId }) {
    if (shippingAddress) return shippingAddress;
    if (addressId) {
      const saved = user.addresses.find((a) => a._id.toString() === addressId);
      if (!saved) throw badRequest("Saved address not found");
      const a = saved.toObject();
      delete a._id;
      return a;
    }
    throw badRequest("A shipping address is required");
  }

  async checkout(user, data) {
    const strategy = this.paymentMethods.get(data.paymentMethod);
    const address = CheckoutService.resolveAddress(user, data);

    // 1. Items default to the saved cart; prices are always recomputed server-side.
    let rawItems = data.items;
    const fromCart = !rawItems;
    if (fromCart) rawItems = (await this.carts.findOne({ userId: user._id }))?.items || [];
    if (!rawItems.length) throw badRequest("Your cart is empty");

    const priced = await this.pricing.price(rawItems);
    const blocking = priced.problems.filter((p) => p.code !== "price_changed");
    if (blocking.length) throw conflict("Some items in your cart need attention", { problems: priced.problems, cart: priced });

    // 2. Hold stock atomically (fails if someone else bought the last piece).
    const lines = priced.items.map(({ productId, size, qty }) => ({ productId, size, qty }));
    await this.inventory.reserveAll(lines);

    // 3. Build the order (Builder-style factory keeps the shape in one place).
    const order = this.orders.build({
      userId: user._id,
      items: priced.items.map(({ productId, title, image, size, unitPrice, qty }) => ({ productId, title, image, size, unitPrice, qty })),
      subtotal: priced.subtotal,
      shipping: priced.shipping,
      total: priced.total,
      currency: priced.currency,
      shippingAddress: address,
      customerNote: data.customerNote,
      payment: { method: strategy.id, provider: strategy.id },
      reservedUntil: new Date(Date.now() + strategy.holdMinutes(this.store) * 60_000),
    });
    order.history.push({ status: "pending_payment", by: "customer" });

    // 4. Let the payment strategy prepare itself; give stock back if anything fails.
    let paymentInfo;
    try {
      paymentInfo = await strategy.begin(order);
      await this.orders.save(order);
    } catch (e) {
      await this.inventory.releaseOrder(order, "Order creation failed");
      throw e;
    }

    if (fromCart) await this.carts.clearForUser(user._id);

    return {
      order,
      payment: { method: strategy.id, clientSecret: paymentInfo.clientSecret || null, instructions: paymentInfo.instructions },
      priceChanges: priced.problems.filter((p) => p.code === "price_changed"),
    };
  }
}

module.exports = { CheckoutService };
