// Response envelope helpers. Every endpoint returns
//   { success: true, data }  or  { success: false, error: { code, message } }
// web/src/api.js depends on this shape.

class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function ok(res, data, status = 200, extra = {}) {
  return res.status(status).json({ success: true, data, ...extra });
}

function fail(res, status, code, message, details) {
  const error = { code, message };
  if (details) error.details = details;
  return res.status(status).json({ success: false, error });
}

// Wrap async route handlers so thrown errors reach the error middleware.
const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

// Route-param guard: malformed ids are a 404, not a database error.
const requireUuidParam = (name, code = 'NOT_FOUND', message = 'Not found') => (req, res, next) => {
  if (!isUuid(req.params[name])) return fail(res, 404, code, message);
  next();
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
function isDateString(v) {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v);
}

module.exports = { AppError, ok, fail, asyncHandler, isUuid, requireUuidParam, isDateString };
