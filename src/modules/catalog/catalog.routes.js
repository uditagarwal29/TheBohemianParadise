const { Router } = require("express");
const { validate } = require("../../shared/http/validate");
const { controller, pageParams } = require("../../shared/http/respond");
const { badRequest } = require("../../shared/errors");

const productShape = {
  title: { type: "string", min: 1, max: 120 },
  desc: { type: "string", min: 1, max: 4000 },
  images: { type: "array", max: 10, items: { type: "string", max: 500 } },
  categories: { type: "array", max: 10, items: { type: "string", max: 40 } },
  tags: { type: "array", max: 20, items: { type: "string", max: 40 } },
  price: { type: "number", min: 0 },
  stock: { type: "integer", min: 0 },
  variants: { type: "array", max: 20, items: { type: "object", shape: { size: { type: "string", required: true, max: 20 }, price: { type: "number", required: true, min: 0 }, stock: { type: "integer", required: true, min: 0 } } } },
  isOriginal: { type: "boolean" },
  dimensions: { type: "string", max: 60 },
  medium: { type: "string", max: 60 },
  featured: { type: "boolean" },
  active: { type: "boolean" },
};

module.exports = function catalogRoutes({ catalog, guards, upload }) {
  const router = Router();
  const { requireAdmin, optionalAuth } = guards;

  // ---- public ---------------------------------------------------------------------
  router.get("/", controller((req) => catalog.list(req.query, pageParams(req.query), req.query.page !== undefined || req.query.limit !== undefined)));
  router.get("/categories", controller(() => catalog.categories()));
  const getOne = controller((req) => catalog.getPublic(req.params.idOrSlug, { viewer: req.user }));
  router.get("/find/:idOrSlug", optionalAuth, getOne); // legacy path

  // ---- admin ----------------------------------------------------------------------
  router.get("/admin/list", requireAdmin, controller((req) => catalog.adminList({ q: req.query.q, status: req.query.status, category: req.query.category, ...pageParams(req.query, { defaultLimit: 50, maxLimit: 200 }) })));
  router.get("/admin/:id", requireAdmin, controller((req) => catalog.getAny(req.params.id)));
  router.post("/", requireAdmin, validate(productShape), controller(async (req) => ({ status: 201, body: await catalog.create(req.data) })));
  const update = controller((req) => catalog.update(req.params.id, req.data));
  router.patch("/:id", requireAdmin, validate(productShape), update);
  router.put("/:id", requireAdmin, validate(productShape), update); // legacy verb
  router.post("/:id/stock", requireAdmin, validate({ delta: { type: "integer", required: true, min: -1000, max: 1000 }, size: { type: "string", max: 20 } }),
    controller((req) => catalog.adjustStock(req.params.id, req.data)));

  const requireFiles = (req) => { if (!req.files?.length) throw badRequest("No images received"); };
  router.post("/images", requireAdmin, ...upload.images(), controller(async (req) => { requireFiles(req); return { status: 201, body: await catalog.uploadImages(req.files) }; }));
  router.post("/:id/images", requireAdmin, ...upload.images(), controller(async (req) => { requireFiles(req); return { status: 201, body: await catalog.uploadImages(req.files, req.params.id) }; }));
  router.delete("/:id/images", requireAdmin, validate({ url: { type: "string", required: true, max: 500 } }), controller((req) => catalog.removeImage(req.params.id, req.data.url)));

  router.delete("/:id", requireAdmin, controller(async (req) => ({ ok: true, id: (await catalog.setActive(req.params.id, false))._id })));
  router.post("/:id/restore", requireAdmin, controller((req) => catalog.setActive(req.params.id, true)));

  router.get("/:idOrSlug", optionalAuth, getOne); // last: /categories, /admin/*, /find/* match first
  return router;
};
