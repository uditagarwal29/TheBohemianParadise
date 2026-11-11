const router = require("express").Router();
const Product = require("../models/Product");
const { requireAdmin } = require("../middleware/auth");
const { validate, OBJECT_ID } = require("../middleware/validate");
const { wrap, notFound, badRequest } = require("../errors");

const SORTS = {
  newest: { createdAt: -1 },
  oldest: { createdAt: 1 },
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  popular: { sold: -1, createdAt: -1 },
};

// ---- public catalogue ---------------------------------------------------

// GET /api/products?category=&q=&sort=&page=&limit=&inStock=1&featured=1&min=&max=
// Backward compatible: ?new=true returns the latest product (legacy), and the
// response is a plain array unless ?page or ?limit is given.
router.get(
  "/",
  wrap(async (req, res) => {
    const { category, q, sort = "newest", inStock, featured, min, max } = req.query;
    const filter = { active: true };
    if (category) filter.categories = String(category).toLowerCase();
    if (featured === "1" || featured === "true") filter.featured = true;
    if (min || max) {
      filter.price = {};
      if (min) filter.price.$gte = Number(min);
      if (max) filter.price.$lte = Number(max);
    }
    if (inStock === "1" || inStock === "true") {
      filter.$or = [{ stock: { $gt: 0 } }, { "variants.stock": { $gt: 0 } }];
    }
    if (q) filter.$text = { $search: String(q).slice(0, 100) };

    if (req.query.new) {
      const latest = await Product.find(filter).sort({ createdAt: -1 }).limit(1);
      return res.json(latest);
    }

    const paged = req.query.page !== undefined || req.query.limit !== undefined;
    const limit = Math.min(parseInt(req.query.limit, 10) || 24, 100);
    const page = Math.max(parseInt(req.query.page, 10) || 1, 1);
    const query = Product.find(filter).sort(SORTS[sort] || SORTS.newest);
    if (!paged) return res.json(await query.limit(500));

    const [items, total] = await Promise.all([
      query.skip((page - 1) * limit).limit(limit),
      Product.countDocuments(filter),
    ]);
    res.json({ items, page, limit, total, pages: Math.ceil(total / limit) });
  })
);

// GET /api/products/categories -> [{ name, count }]
router.get(
  "/categories",
  wrap(async (req, res) => {
    const rows = await Product.aggregate([
      { $match: { active: true } },
      { $unwind: "$categories" },
      { $group: { _id: "$categories", count: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]);
    res.json(rows.map((r) => ({ name: r._id, count: r.count })));
  })
);

// GET /api/products/find/:idOrSlug (legacy path) and /api/products/:idOrSlug
async function getOne(req, res) {
  const key = req.params.idOrSlug;
  const product = OBJECT_ID.test(key)
    ? await Product.findOne({ _id: key, active: true })
    : await Product.findOne({ slug: key, active: true });
  if (!product) throw notFound("Product not found");
  res.json(product);
}
router.get("/find/:idOrSlug", wrap(getOne));

// ---- admin --------------------------------------------------------------

const productShape = {
  title: { type: "string", min: 1, max: 120 },
  desc: { type: "string", min: 1, max: 4000 },
  images: { type: "array", max: 10, items: { type: "string", max: 500 } },
  categories: { type: "array", max: 10, items: { type: "string", max: 40 } },
  tags: { type: "array", max: 20, items: { type: "string", max: 40 } },
  price: { type: "number", min: 0 },
  stock: { type: "integer", min: 0 },
  variants: {
    type: "array",
    max: 20,
    items: {
      type: "object",
      shape: {
        size: { type: "string", required: true, max: 20 },
        price: { type: "number", required: true, min: 0 },
        stock: { type: "integer", required: true, min: 0 },
      },
    },
  },
  isOriginal: { type: "boolean" },
  dimensions: { type: "string", max: 60 },
  medium: { type: "string", max: 60 },
  featured: { type: "boolean" },
  active: { type: "boolean" },
};

router.post(
  "/",
  requireAdmin,
  validate(productShape),
  wrap(async (req, res) => {
    for (const k of ["title", "desc", "price"]) if (req.data[k] === undefined) throw badRequest(`${k} is required`);
    const product = await Product.create(req.data);
    res.status(201).json(product);
  })
);

const updateProduct = wrap(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) throw notFound("Product not found");
  Object.assign(product, req.data);
  if (req.data.images) product.img = req.data.images;
  await product.save();
  res.json(product);
});
router.patch("/:id", requireAdmin, validate(productShape), updateProduct);
// Legacy verb used by the old admin UI.
router.put("/:id", requireAdmin, validate(productShape), updateProduct);

// POST /api/products/:id/stock  { delta, size? }  -> adjust stock by +/- delta
router.post(
  "/:id/stock",
  requireAdmin,
  validate({ delta: { type: "integer", required: true, min: -1000, max: 1000 }, size: { type: "string", max: 20 } }),
  wrap(async (req, res) => {
    const product = await Product.findById(req.params.id);
    if (!product) throw notFound("Product not found");
    const { delta, size } = req.data;
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
    res.json(product);
  })
);

// DELETE -> soft delete (hidden from the shop, kept for order history)
router.delete(
  "/:id",
  requireAdmin,
  wrap(async (req, res) => {
    const product = await Product.findByIdAndUpdate(req.params.id, { active: false }, { new: true });
    if (!product) throw notFound("Product not found");
    res.json({ ok: true, id: product._id });
  })
);

// Keep this last so /categories and /find/:x are matched first.
router.get("/:idOrSlug", wrap(getOne));

module.exports = router;
