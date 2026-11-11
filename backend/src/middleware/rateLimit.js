const rateLimit = require('express-rate-limit');
const { env } = require('../config/env');

// In-memory store: correct for a single Railway instance. If you scale to
// several replicas, switch to a shared store (e.g. rate-limit-redis).
function limiter({ windowMs, limit, message, keyByUser = false }) {
  return rateLimit({
    windowMs,
    limit,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => !env.RATE_LIMIT_ENABLED,
    keyGenerator: keyByUser
      ? (req) => (req.user ? `u:${req.user.id}` : rateLimit.ipKeyGenerator ? rateLimit.ipKeyGenerator(req.ip) : req.ip)
      : undefined,
    handler: (req, res) => res.status(429).json({
      success: false,
      error: { code: 'RATE_LIMITED', message },
    }),
  });
}

const authLimiter = limiter({
  windowMs: 15 * 60 * 1000, limit: 30,
  message: 'Too many attempts. Please wait a few minutes and try again.',
});

// Sending OTP emails costs money and can be abused for spam.
const otpSendLimiter = limiter({
  windowMs: 60 * 60 * 1000, limit: 8,
  message: 'Too many codes requested. Please try again in an hour.',
});

// AI calls are the expensive part of the API.
const aiLimiter = limiter({
  windowMs: 60 * 60 * 1000, limit: 120, keyByUser: true,
  message: 'You are going a bit fast. Please take a short break and try again.',
});

const apiLimiter = limiter({
  windowMs: 60 * 1000, limit: 300,
  message: 'Too many requests. Please slow down.',
});

module.exports = { authLimiter, otpSendLimiter, aiLimiter, apiLimiter };
