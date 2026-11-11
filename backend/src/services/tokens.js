const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

// Single place that issues session tokens, so swapping token management
// (refresh tokens, cookies, a provider's session) only touches this file and
// middleware/auth.js.
function issueSessionToken(user) {
  return jwt.sign({ userId: user.id }, env.JWT_SECRET, { expiresIn: env.JWT_EXPIRES_IN });
}

function verifySessionToken(token) {
  return jwt.verify(token, env.JWT_SECRET);
}

module.exports = { issueSessionToken, verifySessionToken };
