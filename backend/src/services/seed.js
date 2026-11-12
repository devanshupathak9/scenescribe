const bcrypt = require('bcryptjs');
const { User } = require('../models');
const { env } = require('../config/env');

// Demo accounts for local development. Their passwords are public (they're in
// the README), so they are reset on every boot and NEVER created in production.
const DEMO_ACCOUNTS = [
  { email: 'xyz@gmail.com', username: 'xyz', password: 'xyz@12345', is_admin: true },
  { email: 'abc@gmail.com', username: 'abc', password: 'abc@12345', is_admin: false },
];

async function upsertAccount({ email, username, password, is_admin }, { resetPassword }) {
  const existing = await User.findOne({ where: { email } });
  if (existing) {
    const updates = { is_admin, is_registered: true };
    if (resetPassword) updates.password_hash = await bcrypt.hash(password, 10);
    await existing.update(updates, { hooks: false });
    return 'synced';
  }
  await User.create(
    { email, username, password_hash: await bcrypt.hash(password, 10), is_admin, is_registered: true },
    { hooks: false }, // already hashed — skip beforeCreate to avoid double-hashing
  );
  return 'created';
}

async function seedAccounts() {
  if (env.SEED_DEMO_ACCOUNTS) {
    for (const acc of DEMO_ACCOUNTS) {
      const r = await upsertAccount(acc, { resetPassword: true });
      console.log(`[seed] demo ${acc.is_admin ? 'admin' : 'user'} ${acc.email} ${r}`);
    }
  }

  // Real admin for deployed environments: promoted on every boot, but the
  // password is only set when the account is first created.
  if (env.ADMIN_EMAIL) {
    const existing = await User.findOne({ where: { email: env.ADMIN_EMAIL } });
    if (existing) {
      const updates = { is_admin: true, is_registered: true };
      if (env.ADMIN_RESET_PASSWORD && env.ADMIN_PASSWORD.length >= 12) {
        updates.password_hash = await bcrypt.hash(env.ADMIN_PASSWORD, 10);
      }
      await existing.update(updates, { hooks: false });
      console.log(`[seed] admin ${env.ADMIN_EMAIL} ensured${updates.password_hash ? ' (password reset — remove ADMIN_RESET_PASSWORD now)' : ''}`);
    } else if (env.ADMIN_PASSWORD.length >= 12) {
      await upsertAccount({
        email: env.ADMIN_EMAIL,
        username: env.ADMIN_EMAIL.split('@')[0].replace(/[^a-z0-9_.]/g, '').slice(0, 30).padEnd(3, '_'),
        password: env.ADMIN_PASSWORD,
        is_admin: true,
      }, { resetPassword: false });
      console.log(`[seed] admin ${env.ADMIN_EMAIL} created`);
    } else {
      console.warn('[seed] ADMIN_EMAIL set but no account exists and ADMIN_PASSWORD is missing or shorter than 12 chars — skipped');
    }
  }
}

module.exports = { seedAccounts, DEMO_ACCOUNTS };
