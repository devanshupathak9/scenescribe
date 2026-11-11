const { AppError, fail } = require('../utils/http');

function notFound(req, res) {
  return fail(res, 404, 'NOT_FOUND', `No route for ${req.method} ${req.originalUrl}`);
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  if (err instanceof AppError) {
    return fail(res, err.status, err.code, err.message, err.details);
  }
  // Malformed JSON body from express.json()
  if (err.type === 'entity.parse.failed') {
    return fail(res, 400, 'INVALID_JSON', 'Request body is not valid JSON');
  }
  if (err.type === 'entity.too.large') {
    return fail(res, 413, 'PAYLOAD_TOO_LARGE', 'Request body is too large');
  }
  if (err.message && err.message.startsWith('CORS')) {
    return fail(res, 403, 'CORS_FORBIDDEN', 'Origin not allowed');
  }
  if (err.name === 'SequelizeValidationError' || err.name === 'SequelizeUniqueConstraintError') {
    return fail(res, 400, 'INVALID_INPUT', err.errors?.[0]?.message || 'Invalid input');
  }
  console.error('[error]', req.method, req.originalUrl, err);
  return fail(res, 500, 'SERVER_ERROR', 'Something went wrong. Please try again.');
}

module.exports = { notFound, errorHandler };
