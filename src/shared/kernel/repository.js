// Template Method: the generic persistence operations every module repository shares.
// Subclasses add intent-revealing queries (findPublicBySlug, reserveLine, ...) so services
// speak the domain's language and never build Mongoose filters themselves (SRP, DIP).
class BaseRepository {
  constructor(model) {
    this.model = model;
  }

  findById(id) {
    return this.model.findById(id);
  }
  findOne(filter, projection) {
    return this.model.findOne(filter, projection);
  }
  find(filter = {}, { sort, skip, limit, select, populate } = {}) {
    let q = this.model.find(filter);
    if (sort) q = q.sort(sort);
    if (skip) q = q.skip(skip);
    if (limit) q = q.limit(limit);
    if (select) q = q.select(select);
    if (populate) q = q.populate(populate);
    return q;
  }
  async findPage(filter, { sort, page, limit, skip, populate, select }) {
    const [items, total] = await Promise.all([this.find(filter, { sort, skip, limit, populate, select }), this.count(filter)]);
    return { items, total, page, limit, pages: Math.ceil(total / limit) };
  }
  count(filter = {}) {
    return this.model.countDocuments(filter);
  }
  exists(filter) {
    return this.model.exists(filter);
  }
  create(data) {
    return this.model.create(data);
  }
  build(data) {
    return new this.model(data); // eslint-disable-line new-cap
  }
  save(doc) {
    return doc.save();
  }
  updateOne(filter, update, options) {
    return this.model.updateOne(filter, update, options);
  }
  updateMany(filter, update) {
    return this.model.updateMany(filter, update);
  }
  findByIdAndUpdate(id, update, options = { new: true }) {
    return this.model.findByIdAndUpdate(id, update, options);
  }
  findOneAndUpdate(filter, update, options = { new: true }) {
    return this.model.findOneAndUpdate(filter, update, options);
  }
  aggregate(pipeline) {
    return this.model.aggregate(pipeline);
  }
}

module.exports = { BaseRepository };
