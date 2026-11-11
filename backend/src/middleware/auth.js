const { User } = require('../models');
const { verifySessionToken } = require('../services/tokens');
const { fail } = require('../utils/http');

const authenticate = async (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return fail(res, 401, 'NO_TOKEN', 'Please sign in to continue');
  }

  let decoded;
  try {
    decoded = verifySessionToken(authHeader.slice(7));
  } catch {
    return fail(res, 401, 'INVALID_TOKEN', 'Your session has expired. Please sign in again.');
  }

  try {
    const user = await User.findByPk(decoded.userId);
    if (!user || !user.is_registered) {
      return fail(res, 401, 'USER_NOT_FOUND', 'Your session has expired. Please sign in again.');
    }
    req.user = user;
    next();
  } catch (err) {
    // A database failure is not an auth failure — don't log the user out for it.
    next(err);
  }
};

const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.is_admin) {
    return fail(res, 403, 'FORBIDDEN', 'Admin access required');
  }
  next();
};

module.exports = { authenticate, requireAdmin };
