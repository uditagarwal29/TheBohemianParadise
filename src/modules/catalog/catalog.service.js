const { ProductRepository } = require("./product.repository");
const { notFound, badRequest } = require("../../shared/errors");

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  popular: { sold: -1, views: -1, createdAt: -1 },
};

class CatalogService {
  constructor({ products, storage, events }) {
    this.products = products;
    this.storage = storage;
    this.events = events;
  }

  // ---- public ------------------------------------------------------------------

  static publicFilter({ category, q, inStock, featured, min, max }) {
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

  async list(query, { page, limit, skip }, paged) {
    const filter = CatalogService.publicFilter(query);
    const sort = SORTS[query.sort] || SORTS.newest;
    if (query.new) return this.products.find(filter, { sort: { createdAt: -1 }, limit: 1 }); // legacy
    if (!paged) return this.products.find(filter, { sort, limit: 500 });
    return this.products.findPage(filter, { sort, page, limit, skip });
  }

  categories() {
    return this.products.categoryCounts();
  }

  async getPublic(idOrSlug, { viewer } = {}) {
    const product = await this.products.findPublic(idOrSlug);
    if (!product) throw notFound("Product not found");
    if (!viewer?.isAdmin) await this.events.emit("product.viewed", { product, viewer });
    return product;
  }

  // ---- admin ------------------------------------------------------------------

  adminList({ q, status, category, page, limit, skip }) {
    const filter = {};
    if (status === "active") filter.active = true;
    if (status === "hidden") filter.active = false;
    if (status === "sold_out") Object.assign(filter, ProductRepository.soldOutFilter());
    if (status === "low") Object.assign(filter, ProductRepository.lowStockFilter());
    if (category) filter.categories = String(category).toLowerCase();
    if (q) filter.$text = { $search: String(q).slice(0, 100) };
    return this.products.findPage(filter, { sort: { updatedAt: -1 }, page, limit, skip });
  }

  async getAny(id) {
    const product = await this.products.findById(id);
    if (!product) throw notFound("Product not found");
    return product;
  }

  async create(data) {
    for (const k of ["title", "desc", "price"]) if (data[k] === undefined) throw badRequest(`${k} is required`);
    const product = await this.products.create(data);
    await this.events.emit("product.changed", { product, change: "created" });
    return product;
  }

  async update(id, data) {
    const product = await this.getAny(id);
    Object.assign(product, data);
    if (data.images) product.img = data.images;
    await this.products.save(product);
    await this.events.emit("product.changed", { product, change: "updated" });
    return product;
  }

  async adjustStock(id, { delta, size }) {
    const product = await this.getAny(id);
    if (product.variants.length) {
      const v = product.variants.find((x) => x.size === size);
      if (!v) throw badRequest("Unknown size");
      if (v.stock + delta < 0) throw badRequest("Stock cannot go negative");
      v.stock += delta;
    } else {
      if (product.stock + delta < 0) throw badRequest("Stock cannot go negative");
      product.stock += delta;
    }
    await this.products.save(product);
    await this.events.emit("product.changed", { product, change: "stock" });
    return product;
  }

  async setActive(id, active) {
    const product = await this.products.findByIdAndUpdate(id, { active });
    if (!product) throw notFound("Product not found");
    await this.events.emit("product.changed", { product, change: active ? "restored" : "hidden" });
    return product;
  }

  async uploadImages(files, productId) {
    const uploaded = [];
    for (const f of files) uploaded.push(await this.storage.put({ buffer: f.buffer, mimetype: f.mimetype, originalName: f.originalname }));
    if (!productId) return { uploaded };
    const product = await this.getAny(productId);
    product.images.push(...uploaded.map((u) => u.url));
    product.img = product.images;
    product.imageKeys = [...(product.imageKeys || []), ...uploaded.map((u) => u.key)];
    await this.products.save(product);
    await this.events.emit("product.changed", { product, change: "images" });
    return { uploaded, product };
  }

  async removeImage(productId, url) {
    const product = await this.getAny(productId);
    const idx = product.images.indexOf(url);
    if (idx < 0) throw notFound("Image not on this product");
    product.images.splice(idx, 1);
    const key = product.imageKeys?.[idx];
    if (key) {
      product.imageKeys.splice(idx, 1);
      await this.storage.remove(key).catch(() => {});
    }
    product.img = product.images;
    await this.products.save(product);
    await this.events.emit("product.changed", { product, change: "images" });
    return product;
  }
}

// Observer: view counting lives here, not in the read path of the service.
function registerCatalogListeners({ events, products }) {
  events.on("product.viewed", async ({ product }) => {
    await products.incrementViews(product._id);
    product.views += 1; // keep the document being returned in step with the database
  });
}

module.exports = { CatalogService, registerCatalogListeners, SORTS };
