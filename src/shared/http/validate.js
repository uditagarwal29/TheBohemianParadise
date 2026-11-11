// Minimal body/query validation without a schema library.
// Each rule: { type: 'string'|'number'|'integer'|'boolean'|'array'|'object'|'email'|'objectId', required, min, max, enum, items }
const { badRequest } = require("../errors");

const OBJECT_ID = /^[a-f\d]{24}$/i;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function check(value, rule, path, errors) {
  if (value === undefined || value === null || value === "") {
    if (rule.required) errors[path] = "is required";
    return undefined;
  }
  switch (rule.type) {
    case "string":
      if (typeof value !== "string") return void (errors[path] = "must be a string");
      value = value.trim();
      if (rule.min !== undefined && value.length < rule.min) errors[path] = `must be at least ${rule.min} characters`;
      if (rule.max !== undefined && value.length > rule.max) errors[path] = `must be at most ${rule.max} characters`;
      if (rule.enum && !rule.enum.includes(value)) errors[path] = `must be one of ${rule.enum.join(", ")}`;
      return value;
    case "email":
      if (typeof value !== "string" || !EMAIL.test(value.trim())) return void (errors[path] = "must be a valid email");
      return value.trim().toLowerCase();
    case "objectId":
      if (typeof value !== "string" || !OBJECT_ID.test(value)) return void (errors[path] = "must be a valid id");
      return value;
    case "number":
    case "integer": {
      const n = typeof value === "string" ? Number(value) : value;
      if (typeof n !== "number" || Number.isNaN(n)) return void (errors[path] = "must be a number");
      if (rule.type === "integer" && !Number.isInteger(n)) return void (errors[path] = "must be an integer");
      if (rule.min !== undefined && n < rule.min) errors[path] = `must be >= ${rule.min}`;
      if (rule.max !== undefined && n > rule.max) errors[path] = `must be <= ${rule.max}`;
      return n;
    }
    case "boolean":
      if (value === "true") return true;
      if (value === "false") return false;
      if (typeof value !== "boolean") return void (errors[path] = "must be a boolean");
      return value;
    case "array": {
      if (!Array.isArray(value)) return void (errors[path] = "must be an array");
      if (rule.min !== undefined && value.length < rule.min) errors[path] = `must have at least ${rule.min} items`;
      if (rule.max !== undefined && value.length > rule.max) errors[path] = `must have at most ${rule.max} items`;
      if (!rule.items) return value;
      return value.map((v, i) => check(v, rule.items, `${path}[${i}]`, errors));
    }
    case "object": {
      if (typeof value !== "object" || Array.isArray(value)) return void (errors[path] = "must be an object");
      if (!rule.shape) return value;
      return pick(value, rule.shape, errors, `${path}.`);
    }
    default:
      return value;
  }
}

// Returns a NEW object containing only the declared keys (prevents mass assignment).
function pick(source, shape, errors, prefix = "") {
  const out = {};
  for (const [key, rule] of Object.entries(shape)) {
    const v = check(source?.[key], rule, prefix + key, errors);
    if (v !== undefined) out[key] = v;
  }
  return out;
}

function validate(shape, where = "body") {
  return (req, res, next) => {
    const errors = {};
    const clean = pick(req[where] || {}, shape, errors);
    if (Object.keys(errors).length) return next(badRequest("Validation failed", errors));
    req[where === "body" ? "data" : "q"] = clean;
    next();
  };
}

module.exports = { validate, pick, OBJECT_ID };
