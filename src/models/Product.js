const mongoose = require("mongoose");

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

// Each product is a single sellable item with its own stock.
// An original painting is a product with stock 1. A print offered in several
// sizes is best modelled as one product per size (title "Cherry Blossom - A3"),
// or use `variants` below when sizes share one listing.
const variantSchema = new mongoose.Schema(
  {
    size: { type: String, required: true, trim: true, maxlength: 20 },
    price: { type: Number, required: true, min: 0 },
    stock: { type: Number, required: true, min: 0, default: 0 },
  },
  { _id: false }
);

const productSchema = new mongoose.Schema(
  {
    title: { type: String, required: true, unique: true, trim: true, maxlength: 120 },
    slug: { type: String, unique: true, index: true },
    desc: { type: String, required: true, trim: true, maxlength: 4000 },
    images: { type: [String], default: [] },
    // Legacy field kept so the current frontend keeps rendering; mirrors `images`.
    img: { type: [String], default: [] },
    categories: { type: [String], default: [], index: true, set: (v) => (Array.isArray(v) ? v : v ? [v] : []).map((c) => String(c).trim().toLowerCase()) },
    tags: { type: [String], default: [] },
    // Base price used when the product has no variants.
    price: { type: Number, required: true, min: 0 },
    // Stock for the base product (ignored when variants exist).
    stock: { type: Number, required: true, min: 0, default: 1 },
    variants: { type: [variantSchema], default: [] },
    // Legacy: list of size labels. Derived from variants when present.
    size: { type: [String], default: [] },
    isOriginal: { type: Boolean, default: false },
    dimensions: { type: String, trim: true, maxlength: 60 },
    medium: { type: String, trim: true, maxlength: 60 },
    featured: { type: Boolean, default: false },
    // Soft-hide instead of delete so past orders keep their reference.
    active: { type: Boolean, default: true, index: true },
    sold: { type: Number, default: 0 },
  },
  { timestamps: true }
);

productSchema.index({ title: "text", desc: "text", tags: "text" });

productSchema.pre("validate", function (next) {
  if (!this.slug || this.isModified("title")) this.slug = slugify(this.title);
  if (this.variants?.length) this.size = this.variants.map((v) => v.size);
  if (this.images?.length && !this.img?.length) this.img = this.images;
  if (this.img?.length && !this.images?.length) this.images = this.img;
  next();
});

productSchema.methods.totalStock = function () {
  return this.variants?.length ? this.variants.reduce((s, v) => s + v.stock, 0) : this.stock;
};

productSchema.methods.priceFor = function (size) {
  if (!this.variants?.length) return this.price;
  const v = this.variants.find((x) => x.size === size);
  return v ? v.price : null;
};

productSchema.methods.stockFor = function (size) {
  if (!this.variants?.length) return this.stock;
  const v = this.variants.find((x) => x.size === size);
  return v ? v.stock : 0;
};

productSchema.set("toJSON", {
  virtuals: true,
  transform(doc, ret) {
    ret.id = ret._id;
    ret.inStock = doc.totalStock() > 0;
    ret.totalStock = doc.totalStock();
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model("Product", productSchema);
module.exports.slugify = slugify;
