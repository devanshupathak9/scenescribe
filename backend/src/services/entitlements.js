// Who gets Pro, and what free learners can do. One place, so routes and the
// UI never disagree about a learner's plan.
const { Op } = require('sequelize');
const { env } = require('../config/env');

const WEEK_MS = 7 * 864e5;

function isPro(user, now = new Date()) {
  if (!env.PREMIUM_ENABLED) return true; // founding beta: everything unlocked
  if (user.is_admin) return true;          // staff test every feature
  return Boolean(user.pro_until && new Date(user.pro_until) > now);
}

// Public plan summary, included in every user payload.
function planOf(user) {
  if (!env.PREMIUM_ENABLED) {
    return { pro: true, source: 'beta', pro_until: null, premium_enabled: false };
  }
  const pro = isPro(user);
  return {
    pro,
    source: pro ? (user.is_admin ? 'staff' : user.pro_source || null) : null,
    pro_until: user.pro_until ? new Date(user.pro_until).toISOString() : null,
    plan: user.rzp_plan || null,
    renews: user.rzp_status === 'active',
    premium_enabled: true,
  };
}

// Free learners get FREE_DEBATES_PER_WEEK debates in any rolling 7 days.
// Returns null when allowed, or { used, limit, resets_at } when blocked.
async function debateAllowance(user) {
  if (isPro(user)) return null;
  const { Debate } = require('../models');
  const since = new Date(Date.now() - WEEK_MS);
  const recent = await Debate.findAll({
    attributes: ['createdAt'],
    where: { user_id: user.id, createdAt: { [Op.gte]: since } },
    order: [['createdAt', 'ASC']],
    raw: true,
  });
  if (recent.length < env.FREE_DEBATES_PER_WEEK) return null;
  const oldest = new Date(recent[0].createdAt);
  return {
    used: recent.length,
    limit: env.FREE_DEBATES_PER_WEEK,
    resets_at: new Date(oldest.getTime() + WEEK_MS).toISOString(),
  };
}

// Extend Pro to `until` (never shortens an existing longer grant).
async function grantPro(user, until, source, extra = {}) {
  const current = user.pro_until ? new Date(user.pro_until) : null;
  const next = current && current > until ? current : until;
  await user.update({ pro_until: next, pro_source: source, ...extra }, { hooks: false });
  return user;
}

module.exports = { isPro, planOf, debateAllowance, grantPro, WEEK_MS };
