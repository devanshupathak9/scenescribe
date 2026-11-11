const { Sequelize } = require('sequelize');
require('dotenv').config();

// Hosted Postgres (Railway, Neon, Supabase…) requires SSL; a local or
// containerised Postgres does not support it at all and rejects the handshake
// with "The server does not support SSL connections". Default from the host in
// DATABASE_URL, and allow an explicit override for anything in between.
function shouldUseSsl(url) {
  const override = process.env.DATABASE_SSL;
  if (override !== undefined && override !== '') {
    return /^(1|true|yes|require)$/i.test(override);
  }
  let hostname = '';
  try {
    hostname = new URL(url).hostname;
  } catch {
    return true; // unparseable — assume a hosted URL and keep SSL on
  }
  return !['localhost', '127.0.0.1', '::1', 'db', 'postgres'].includes(hostname);
}

const useSsl = shouldUseSsl(process.env.DATABASE_URL || '');

const sequelize = new Sequelize(process.env.DATABASE_URL, {
  dialect: 'postgres',
  timezone: '+00:00',
  logging: process.env.NODE_ENV === 'development' ? console.log : false,
  dialectOptions: useSsl ? { ssl: { require: true, rejectUnauthorized: false } } : {},
  pool: {
    max: parseInt(process.env.DB_POOL_MAX, 10) || 10,
    min: 0,
    acquire: 30000,
    idle: 10000,
  },
});

module.exports = sequelize;
