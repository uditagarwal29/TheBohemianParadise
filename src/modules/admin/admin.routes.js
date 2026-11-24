const { Router } = require("express");
const { controller } = require("../../shared/http/respond");

module.exports = function adminRoutes({ analytics, storage, gateway, config, guards }) {
  const router = Router();
  router.use(guards.requireAdmin);

  router.get("/dashboard", controller(() => analytics.dashboard()));
  router.get("/analytics/summary", controller(() => analytics.summary()));
  router.get("/analytics/revenue-by-day", controller((req) => analytics.revenueByDay(Math.min(parseInt(req.query.days, 10) || 30, 365))));
  router.get("/analytics/top-products", controller(() => analytics.topProducts()));
  router.get("/analytics/most-viewed", controller(() => analytics.mostViewed()));
  router.get("/analytics/sales-by-category", controller(() => analytics.salesByCategory()));

  // What the admin UI needs to know about this deployment.
  router.get("/settings", controller(() => ({
    storage: storage.name,
    stripe: gateway.enabled,
    currency: config.store.currency,
    shippingFlat: config.store.shippingFlat,
    freeShippingAbove: config.store.freeShippingAbove,
    reservationMinutes: config.store.reservationMinutes,
    maxUploadMb: config.storage.maxUploadMb,
    env: config.env,
  })));
  return router;
};
