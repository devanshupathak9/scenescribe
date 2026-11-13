// Centralised environment handling. Everything that reads process.env for
// behaviour (not just connection strings) should go through here so the
// production checks in validateEnv() stay complete.
require('dotenv').config();

const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';
const isTest = NODE_ENV === 'test';

function bool(value, fallback) {
  if (value === undefined || value === '') return fallback;
  return /^(1|true|yes|on)$/i.test(String(value));
}

const env = {
  NODE_ENV,
  isProd,
  isTest,
  PORT: parseInt(process.env.PORT, 10) || 3001,
  DATABASE_URL: process.env.DATABASE_URL,
  JWT_SECRET: process.env.JWT_SECRET,
  JWT_EXPIRES_IN: process.env.JWT_EXPIRES_IN || '7d',

  // AI
  OPENAI_API_KEY: (process.env.OPENAI_API_KEY || '').trim(),
  OPENAI_MODEL: process.env.OPENAI_MODEL || 'gpt-4o',
  OPENAI_FAST_MODEL: process.env.OPENAI_FAST_MODEL || 'gpt-4o-mini',

  // Comma-separated list of allowed browser origins. Supports a single `*`
  // wildcard per entry, e.g. https://scenescribe-*.vercel.app for previews.
  // Empty = allow all (fine for local dev, refused in production).
  CORS_ORIGIN: (process.env.CORS_ORIGIN || '').trim(),

  // "Today" for daily scenes and streaks is computed in this IANA timezone.
  APP_TIMEZONE: process.env.APP_TIMEZONE || 'UTC',

  // Demo accounts (abc@ / xyz@gmail.com with known passwords). Never in prod.
  SEED_DEMO_ACCOUNTS: bool(process.env.SEED_DEMO_ACCOUNTS, !isProd),
  // Optional real admin, created/promoted on boot (password only set on create).
  ADMIN_EMAIL: (process.env.ADMIN_EMAIL || '').trim().toLowerCase(),
  ADMIN_PASSWORD: process.env.ADMIN_PASSWORD || '',
  // One-off recovery: set to true for one deploy to overwrite the admin password
  // with ADMIN_PASSWORD, then remove it.
  ADMIN_RESET_PASSWORD: bool(process.env.ADMIN_RESET_PASSWORD, false),

  // Google sign-in: a "Web application" OAuth client ID from Google Cloud.
  // Same value as the web app's VITE_GOOGLE_CLIENT_ID. Empty = Google sign-in off.
  GOOGLE_CLIENT_ID: (process.env.GOOGLE_CLIENT_ID || '').trim(),

  // Premium. While PREMIUM_ENABLED is off every learner is treated as Pro
  // ("founding beta"), so nothing is locked before billing is live.
  PREMIUM_ENABLED: bool(process.env.PREMIUM_ENABLED, false),
  FREE_DEBATES_PER_WEEK: parseInt(process.env.FREE_DEBATES_PER_WEEK, 10) || 1,
  PRICE_MONTHLY_INR: parseInt(process.env.PRICE_MONTHLY_INR, 10) || 149,
  PRICE_YEARLY_INR: parseInt(process.env.PRICE_YEARLY_INR, 10) || 999,
  RAZORPAY_KEY_ID: (process.env.RAZORPAY_KEY_ID || '').trim(),
  RAZORPAY_KEY_SECRET: (process.env.RAZORPAY_KEY_SECRET || '').trim(),
  RAZORPAY_WEBHOOK_SECRET: (process.env.RAZORPAY_WEBHOOK_SECRET || '').trim(),
  RAZORPAY_PLAN_MONTHLY: (process.env.RAZORPAY_PLAN_MONTHLY || '').trim(),
  RAZORPAY_PLAN_YEARLY: (process.env.RAZORPAY_PLAN_YEARLY || '').trim(),

  // Sequelize `sync({ alter: true })` on boot. On by default because the project
  // has no migrations yet; set DB_SYNC_ALTER=false once you add them.
  DB_SYNC_ALTER: bool(process.env.DB_SYNC_ALTER, true),

  RATE_LIMIT_ENABLED: bool(process.env.RATE_LIMIT_ENABLED, !isTest),
};

env.aiEnabled = Boolean(env.OPENAI_API_KEY);
env.billingEnabled = Boolean(env.PREMIUM_ENABLED && env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET
  && env.RAZORPAY_PLAN_MONTHLY && env.RAZORPAY_PLAN_YEARLY);

function validateEnv() {
  const problems = [];
  if (!env.DATABASE_URL) problems.push('DATABASE_URL is required');
  if (!env.JWT_SECRET) problems.push('JWT_SECRET is required');
  if (isProd) {
    if (env.JWT_SECRET && (env.JWT_SECRET.length < 32 || /dev-only|insecure|change-me/i.test(env.JWT_SECRET))) {
      problems.push('JWT_SECRET must be a random string of at least 32 characters in production');
    }
    if (!env.CORS_ORIGIN) problems.push('CORS_ORIGIN is required in production (your Vercel URL)');
    if (env.SEED_DEMO_ACCOUNTS) problems.push('SEED_DEMO_ACCOUNTS must be false in production');
  }
  try {
    new Intl.DateTimeFormat('en-CA', { timeZone: env.APP_TIMEZONE });
  } catch {
    problems.push(`APP_TIMEZONE "${env.APP_TIMEZONE}" is not a valid IANA timezone`);
  }
  return problems;
}

module.exports = { env, validateEnv };
