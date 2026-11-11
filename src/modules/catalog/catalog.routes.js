const router = require("express").Router();
const { requireAdmin, optionalAuth } = require("../../shared/middleware/auth");
const { validate } = require("../../shared/http/validate");
const { controller, pageParams } = require("../../shared/http/respond");
const { upload, uploadErrors } = require("../../shared/http/upload");
const { badRequest } = require("../../shared/errors");
const service = require("./catalog.service");

// ---- public catalogue -----------------------------------------------------

// GET /api/products?category=&q=&sort=&page=&limit=&inStock=1&featured=1&min=&max=
// Plain array unless ?page or ?limit is given (keeps the legacy client working).
router.get("/", controller((req) => {
  const paged = req.query.page !== undefined || req.query.limit !== undefined;
  return service.list(req.query, pageParams(req.query), paged);
}));

router.get("/categories", controller(() => service.categories()));

// Public product by id or slug. Counts a view unless the viewer is an admin.
const getOne = controller(async (req) => service.getPublic(req.params.idOrSlug, { countView: !req.user?.isAdmin }));
router.get("/find/:idOrSlug", optionalAuth, getOne); // legacy path

// ---- admin ------------------------------------------------------------------

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
    items: { type: "object", shape: { size: { type: "string", required: true, max: 20 }, price: { type: "number", required: true, min: 0 }, stock: { type: "integer", required: true, min: 0 } } },
  },
  isOriginal: { type: "boolean" },
  dimensions: { type: "string", max: 60 },
  medium: { type: "string", max: 60 },
  featured: { type: "boolean" },
  active: { type: "boolean" },
};

router.get("/admin/list", requireAdmin, controller((req) =>
  service.adminList({ q: req.query.q, status: req.query.status, category: req.query.category, ...pageParams(req.query, { defaultLimit: 50, maxLimit: 200 }) })));
router.get("/admin/:id", requireAdmin, controller((req) => service.getAny(req.params.id)));

router.post("/", requireAdmin, validate(productShape), controller(async (req) => ({ status: 201, body: await service.create(req.data) })));

const update = controller((req) => service.update(req.params.id, req.data));
router.patch("/:id", requireAdmin, validate(productShape), update);
router.put("/:id", requireAdmin, validate(productShape), update); // legacy verb

router.post("/:id/stock", requireAdmin, validate({ delta: { type: "integer", required: true, min: -1000, max: 1000 }, size: { type: "string", max: 20 } }),
  controller((req) => service.adjustStock(req.params.id, req.data)));

// Images: multipart field "images" (up to 10). Standalone upload returns URLs for a new product form;
// with :id the files are appended to that product's gallery.
router.post("/images", requireAdmin, upload.array("images", 10), uploadErrors, controller(async (req) => {
  if (!req.files?.length) throw badRequest("No images received");
  return { status: 201, body: await service.uploadImages(req.files) };
}));
router.post("/:id/images", requireAdmin, upload.array("images", 10), uploadErrors, controller(async (req) => {
  if (!req.files?.length) throw badRequest("No images received");
  return { status: 201, body: await service.uploadImages(req.files, req.params.id) };
}));
router.delete("/:id/images", requireAdmin, validate({ url: { type: "string", required: true, max: 500 } }),
  controller((req) => service.removeImage(req.params.id, req.data.url)));

// Soft delete / restore
router.delete("/:id", requireAdmin, controller(async (req) => ({ ok: true, id: (await service.setActive(req.params.id, false))._id })));
router.post("/:id/restore", requireAdmin, controller((req) => service.setActive(req.params.id, true)));

// Keep last so /categories, /admin/*, /find/* match first.
router.get("/:idOrSlug", optionalAuth, getOne);

module.exports = router;
