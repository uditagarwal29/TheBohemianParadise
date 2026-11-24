const { BaseRepository } = require("../../shared/kernel/repository");
const Product = require("./product.model");
const { OBJECT_ID } = require("../../shared/http/validate");

class ProductRepository extends BaseRepository {
  constructor() {
    super(Product);
  }

  byIdOrSlug(idOrSlug, extra = {}) {
    return { ...(OBJECT_ID.test(idOrSlug) ? { _id: idOrSlug } : { slug: idOrSlug }), ...extra };
  }
  findPublic(idOrSlug) {
    return this.findOne(this.byIdOrSlug(idOrSlug, { active: true }));
  }
  findManyByIds(ids) {
    return this.find({ _id: { $in: ids } });
  }
  categoryCounts() {
    return this.aggregate([
      { $match: { active: true } },
      { $unwind: "$categories" },
      { $group: { _id: "$categories", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]).then((rows) => rows.map((r) => ({ name: r._id, count: r.count })));
  }
  incrementViews(id) {
    return this.updateOne({ _id: id }, { $inc: { views: 1 } });
  }
  incrementSold(id, qty) {
    return this.updateOne({ _id: id }, { $inc: { sold: qty } });
  }

  // ---- inventory: single atomic filters, never read-then-write -----------------
  async reserve({ productId, size, qty }) {
    const filter = { _id: productId, active: true };
    const inc = {};
    if (size) {
      filter.variants = { $elemMatch: { size, stock: { $gte: qty } } };
      inc["variants.$.stock"] = -qty;
    } else {
      filter.stock = { $gte: qty };
      inc.stock = -qty;
    }
    const res = await this.updateOne(filter, { $inc: inc });
    return res.modifiedCount === 1;
  }
  release({ productId, size, qty }) {
    return size
      ? this.updateOne({ _id: productId, "variants.size": size }, { $inc: { "variants.$.stock": qty } })
      : this.updateOne({ _id: productId }, { $inc: { stock: qty } });
  }

  // Reusable filter fragments (no `active` clause; callers add it when they want live items only).
  static lowStockFilter(threshold = 2) {
    return { $or: [{ variants: { $size: 0 }, stock: { $gt: 0, $lte: threshold } }, { "variants.stock": { $gt: 0, $lte: threshold } }] };
  }
  static soldOutFilter() {
    return { stock: { $lte: 0 }, $nor: [{ "variants.stock": { $gt: 0 } }] };
  }
}

module.exports = { ProductRepository };
