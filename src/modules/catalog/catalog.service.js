const Product = require("./product.model");
const { storage } = require("../../infrastructure/storage");
const { notFound, badRequest } = require("../../shared/errors");
const { OBJECT_ID } = require("../../shared/http/validate");

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  popular: { sold: -1, views: -1, createdAt: -1 },
};

function publicFilter({ category, q, inStock, featured, min, max }) {
  const filter = { active: true };
  if (category) filter.categories = String(category).toLowerCase();
  if (featured === "1" || featured === "true") filter.featured = true;
  if (min || max) {
    filter.price = {};
    if (min) filter.price.$gte = Number(min);
    if (max) filter.price.$lte = Number(max);
  }
  if (inStock === "1" || inStock === "true") filter.$or = [{ stock: { $gt: 0 } }, { "variants.stock": { $gt: 0 } }];
  if (q) filter.$text = { $search: String(q).slice(0, 100) };
  return filter;
}

async function list(query, { page, limit, skip }, paged) {
  const filter = publicFilter(query);
  const sort = SORTS[query.sort] || SORTS.newest;
  if (query.new) return Product.find(filter).sort({ createdAt: -1 }).limit(1); // legacy
  if (!paged) return Product.find(filter).sort(sort).limit(500);
  const [items, total] = await Promise.all([Product.find(filter).sort(sort).skip(skip).limit(limit), Product.countDocuments(filter)]);
  return { items, page, limit, total, pages: Math.ceil(total / limit) };
}

async function categories() {
  const rows = await Product.aggregate([
    { $match: { active: true } },
    { $unwind: "$categories" },
    { $group: { _id: "$categories", count: { $sum: 1 } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ name: r._id, count: r.count }));
}

async function getPublic(idOrSlug, { countView = false } = {}) {
  const match = OBJECT_ID.test(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug };
  const product = countView
    ? await Product.findOneAndUpdate({ ...match, active: true }, { $inc: { views: 1 } }, { new: true })
    : await Product.findOne({ ...match, active: true });
  if (!product) throw notFound("Product not found");
  return product;
}

// ---- admin ----------------------------------------------------------------

async function adminList({ q, status, category, page, limit, skip }) {
  const filter = {};
  if (status === "active") filter.active = true;
  if (status === "hidden") filter.active = false;
  if (status === "sold_out") filter.$and = [{ stock: { $lte: 0 } }, { $nor: [{ "variants.stock": { $gt: 0 } }] }];
  if (status === "low") filter.$or = [{ variants: { $size: 0 }, stock: { $gt: 0, $lte: 2 } }, { "variants.stock": { $gt: 0, $lte: 2 } }];
  if (category) filter.categories = String(category).toLowerCase();
  if (q) filter.$text = { $search: String(q).slice(0, 100) };
  const [items, total] = await Promise.all([Product.find(filter).sort({ updatedAt: -1 }).skip(skip).limit(limit), Product.countDocuments(filter)]);
  return { items, page, limit, total, pages: Math.ceil(total / limit) };
}

async function getAny(id) {
  const product = await Product.findById(id);
  if (!product) throw notFound("Product not found");
  return product;
}

async function create(data) {
  for (const k of ["title", "desc", "price"]) if (data[k] === undefined) throw badRequest(`${k} is required`);
  return Product.create(data);
}

async function update(id, data) {
  const product = await getAny(id);
  Object.assign(product, data);
  if (data.images) product.img = data.images;
  await product.save();
  return product;
}

async function adjustStock(id, { delta, size }) {
  const product = await getAny(id);
  if (product.variants.length) {
    const v = product.variants.find((x) => x.size === size);
    if (!v) throw badRequest("Unknown size");
    if (v.stock + delta < 0) throw badRequest("Stock cannot go negative");
    v.stock += delta;
  } else {
    if (product.stock + delta < 0) throw badRequest("Stock cannot go negative");
    product.stock += delta;
  }
  await product.save();
  return product;
}

async function setActive(id, active) {
  const product = await Product.findByIdAndUpdate(id, { active }, { new: true });
  if (!product) throw notFound("Product not found");
  return product;
}

// Upload files -> URLs; optionally append to a product's gallery.
async function uploadImages(files, productId) {
  const uploaded = [];
  for (const f of files) uploaded.push(await storage().put({ buffer: f.buffer, mimetype: f.mimetype, originalName: f.originalname }));
  if (productId) {
    const product = await getAny(productId);
    product.images.push(...uploaded.map((u) => u.url));
    product.img = product.images;
    product.imageKeys = [...(product.imageKeys || []), ...uploaded.map((u) => u.key)];
    await product.save();
    return { uploaded, product };
  }
  return { uploaded };
}

async function removeImage(productId, url) {
  const product = await getAny(productId);
  const idx = product.images.indexOf(url);
  if (idx < 0) throw notFound("Image not on this product");
  product.images.splice(idx, 1);
  const key = product.imageKeys?.[idx];
  if (key) {
    product.imageKeys.splice(idx, 1);
    await storage().remove(key).catch(() => {});
  }
  product.img = product.images;
  await product.save();
  return product;
}

module.exports = { list, categories, getPublic, adminList, getAny, create, update, adjustStock, setActive, uploadImages, removeImage, SORTS };
