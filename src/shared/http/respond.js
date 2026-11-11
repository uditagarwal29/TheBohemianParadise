// Small helpers so controllers stay one-liners and response shapes stay uniform.
const { wrap } = require("../errors");

const ok = (res, body, status = 200) => res.status(status).json(body);
const created = (res, body) => res.status(201).json(body);

function pageParams(query, { defaultLimit = 24, maxLimit = 100 } = {}) {
  const limit = Math.min(parseInt(query.limit, 10) || defaultLimit, maxLimit);
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  return { page, limit, skip: (page - 1) * limit };
}

// controller(fn) -> express handler; fn(req) returns { status?, body } or a plain body.
const controller = (fn) =>
  wrap(async (req, res) => {
    const out = await fn(req, res);
    if (res.headersSent || out === undefined) return;
    if (out && typeof out === "object" && "body" in out && ("status" in out || Object.keys(out).length <= 2)) {
      return res.status(out.status || 200).json(out.body);
    }
    res.json(out);
  });

module.exports = { ok, created, pageParams, controller };
