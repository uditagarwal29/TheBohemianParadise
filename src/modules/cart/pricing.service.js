const Product = require("../catalog/product.model");
const { config } = require("../../config");

// Normalise raw cart lines ({productId,size,qty}) against the catalogue.
// Returns priced lines plus a list of problems the customer must resolve
// before checkout (removed product, out of stock, price changed, qty capped).
async function priceItems(rawItems) {
  const ids = [...new Set(rawItems.map((i) => String(i.productId)))];
  const products = await Product.find({ _id: { $in: ids } });
  const byId = new Map(products.map((p) => [p._id.toString(), p]));

  // Merge duplicate lines (same product + size). Lines may be Mongoose subdocs,
  // so copy fields explicitly instead of spreading.
  const merged = new Map();
  for (const raw of rawItems) {
    const line = { productId: raw.productId, size: raw.size || null, qty: Number(raw.qty || 1), unitPrice: raw.unitPrice };
    const key = `${line.productId}|${line.size || ""}`;
    const prev = merged.get(key);
    merged.set(key, { ...line, qty: (prev?.qty || 0) + line.qty });
  }

  const items = [];
  const problems = [];
  for (const line of merged.values()) {
    const product = byId.get(String(line.productId));
    if (!product || !product.active) {
      problems.push({ productId: line.productId, size: line.size, code: "unavailable", message: "This item is no longer available" });
      continue;
    }
    const size = product.variants.length ? line.size : null;
    const unitPrice = product.priceFor(size);
    if (unitPrice === null) {
      problems.push({ productId: line.productId, size: line.size, code: "bad_size", message: "Please choose a size" });
      continue;
    }
    const available = product.stockFor(size);
    let qty = Math.max(1, Math.floor(Number(line.qty) || 1));
    if (available <= 0) {
      problems.push({ productId: product._id, size, code: "sold_out", message: `${product.title} is sold out` });
      continue;
    }
    if (qty > available) {
      problems.push({ productId: product._id, size, code: "qty_reduced", message: `Only ${available} left of ${product.title}`, available });
      qty = available;
    }
    if (line.unitPrice !== undefined && Number(line.unitPrice) !== unitPrice) {
      problems.push({ productId: product._id, size, code: "price_changed", message: `Price of ${product.title} is now ${unitPrice}`, unitPrice });
    }
    items.push({
      productId: product._id,
      title: product.title,
      slug: product.slug,
      image: product.images[0] || null,
      size,
      unitPrice,
      qty,
      available,
      lineTotal: unitPrice * qty,
    });
  }

  const subtotal = items.reduce((s, i) => s + i.lineTotal, 0);
  let shipping = config.store.shippingFlat;
  if (config.store.freeShippingAbove > 0 && subtotal >= config.store.freeShippingAbove) shipping = 0;
  if (items.length === 0) shipping = 0;

  return { items, problems, subtotal, shipping, total: subtotal + shipping, currency: config.store.currency };
}

module.exports = { priceItems };
