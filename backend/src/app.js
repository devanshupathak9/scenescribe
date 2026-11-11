const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { env } = require('./config/env');
const { sequelize } = require('./models');
const { apiLimiter } = require('./middleware/rateLimit');
const { notFound, errorHandler } = require('./middleware/errors');
const { ok, fail } = require('./utils/http');

// "https://a.com, https://scenescribe-*.vercel.app" → matcher
function originMatcher(spec) {
  const patterns = spec.split(',').map(s => s.trim().replace(/\/$/, '')).filter(Boolean).map(p =>
    new RegExp(`^${p.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[a-z0-9-]+')}$`, 'i'));
  return (origin) => patterns.some(re => re.test(origin));
}

function createApp() {
  const app = express();

  // Railway / Vercel sit behind a proxy: needed for correct client IPs in rate limiting.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));

  const allowed = env.CORS_ORIGIN ? originMatcher(env.CORS_ORIGIN) : null;
  app.use(cors({
    origin: (origin, cb) => {
      // Non-browser requests (curl, health checks) have no Origin header.
      if (!origin || !allowed || allowed(origin)) return cb(null, true);
      return cb(new Error(`CORS: ${origin} not allowed`));
    },
    maxAge: 86400,
  }));

  app.use(express.json({ limit: '100kb' }));

  // Liveness + DB readiness for Railway's healthcheck.
  app.get('/api/health', async (req, res) => {
    try {
      await sequelize.authenticate();
      return ok(res, { status: 'ok', ai: env.aiEnabled, time: new Date().toISOString() });
    } catch {
      return fail(res, 503, 'DB_UNAVAILABLE', 'Database unreachable');
    }
  });

  app.use('/api', apiLimiter);
  app.use('/api/auth', require('./routes/auth'));
  app.use('/api/dashboard', require('./routes/dashboard'));
  app.use('/api/profile', require('./routes/profile'));
  app.use('/api/admin', require('./routes/admin'));
  app.use('/api/analyse', require('./routes/analyse'));
  app.use('/api/debate', require('./routes/debate'));

  app.use('/api', notFound);
  app.use(notFound);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp, originMatcher };
