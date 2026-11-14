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

// Long-lived, single-purpose token for one-click email unsubscribe links.
// It can only turn reminders off, so it never expires.
function issueUnsubscribeToken(user) {
  return jwt.sign({ sub: user.id, purpose: 'unsubscribe' }, env.JWT_SECRET);
}

function verifyUnsubscribeToken(token) {
  const payload = jwt.verify(token, env.JWT_SECRET);
  if (payload.purpose !== 'unsubscribe' || !payload.sub) throw new Error('wrong token purpose');
  return payload.sub;
}

module.exports = { issueSessionToken, verifySessionToken, issueUnsubscribeToken, verifyUnsubscribeToken };
