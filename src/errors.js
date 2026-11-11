class HttpError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const badRequest = (msg, details) => new HttpError(400, msg, details);
const unauthorized = (msg = "Authentication required") => new HttpError(401, msg);
const forbidden = (msg = "Not allowed") => new HttpError(403, msg);
const notFound = (msg = "Not found") => new HttpError(404, msg);
const conflict = (msg, details) => new HttpError(409, msg, details);

// Wrap async route handlers so rejections reach the error middleware.
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

function notFoundHandler(req, res) {
  res.status(404).json({ error: "Route not found" });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err.name === "ValidationError") {
    const details = Object.fromEntries(
      Object.entries(err.errors || {}).map(([k, v]) => [k, v.message])
    );
    return res.status(400).json({ error: "Validation failed", details });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ error: `Invalid ${err.path}` });
  }
  if (err.code === 11000) {
    const field = Object.keys(err.keyPattern || {})[0] || "field";
    return res.status(409).json({ error: `${field} already exists` });
  }
  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ error: "Malformed JSON body" });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error" });
}

module.exports = {
  HttpError,
  badRequest,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  wrap,
  notFoundHandler,
  errorHandler,
};
