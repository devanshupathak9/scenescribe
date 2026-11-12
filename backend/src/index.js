process.env.TZ = 'UTC'; // Force UTC for all Date operations in this process

// Prefer IPv4 when a hostname has both A and AAAA records. Several hosts
// (Railway by default, Render) have no outbound IPv6, and SMTP servers such as
// smtp.gmail.com resolve to IPv6 first, which fails with ENETUNREACH.
require('dns').setDefaultResultOrder('ipv4first');
const { env, validateEnv } = require('./config/env');

const problems = validateEnv();
if (problems.length) {
  console.error('[config] Refusing to start:\n  - ' + problems.join('\n  - '));
  process.exit(1);
}

const { sequelize } = require('./models');
const { createApp } = require('./app');
const { seedAccounts } = require('./services/seed');

async function start() {
  await sequelize.authenticate();
  await sequelize.sync({ alter: env.DB_SYNC_ALTER });
  console.log(`[db] synced${env.DB_SYNC_ALTER ? ' (alter)' : ''}`);
  await seedAccounts();

  const server = createApp().listen(env.PORT, () => {
    console.log(`[api] listening on :${env.PORT} (${env.NODE_ENV}, AI ${env.aiEnabled ? 'on' : 'off — using estimates'}, tz ${env.APP_TIMEZONE})`);
  });

  // Railway sends SIGTERM on redeploy: finish in-flight requests, then close the pool.
  const shutdown = (signal) => {
    console.log(`[api] ${signal} received, shutting down`);
    server.close(async () => {
      await sequelize.close().catch(() => {});
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error('[api] failed to start:', err);
  process.exit(1);
});
