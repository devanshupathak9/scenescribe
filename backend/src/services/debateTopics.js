const { DebateTopic } = require('../models');
const DEFAULTS = require('../data/debateTopics');

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const MAX_POINTS = 6;
const MAX_POINT_CHARS = 160;

function serializeTopic(t) {
  return {
    id: t.id,
    motion: t.motion,
    category: t.category,
    level: t.level,
    points_for: t.points_for || [],
    points_against: t.points_against || [],
    ...(t.is_active === undefined ? {} : { is_active: t.is_active }),
  };
}

const defaultTopics = () => DEFAULTS.map(t => serializeTopic({ points_for: [], points_against: [], ...t }));

// What learners see: the admin's active topics, or the built-in set if there are none.
async function learnerTopics() {
  const rows = await DebateTopic.findAll({
    where: { is_active: true },
    order: [['category', 'ASC'], ['createdAt', 'ASC']],
  });
  if (!rows.length) return { topics: defaultTopics(), source: 'default' };
  return { topics: rows.map(r => { const { is_active, ...t } = serializeTopic(r); return t; }), source: 'custom' };
}

function cleanPoints(v) {
  if (v === undefined) return undefined;
  if (!Array.isArray(v)) return null;
  return v.filter(p => typeof p === 'string')
    .map(p => p.trim().replace(/\s+/g, ' ').slice(0, MAX_POINT_CHARS))
    .filter(Boolean)
    .slice(0, MAX_POINTS);
}

// Validates an admin create/update body. Returns { values } or { error }.
function parseTopicInput(body = {}, { partial = false } = {}) {
  const values = {};
  if (body.motion !== undefined || !partial) {
    const motion = typeof body.motion === 'string' ? body.motion.trim().replace(/\s+/g, ' ') : '';
    if (motion.length < 8 || motion.length > 200) return { error: 'Motion must be 8–200 characters.' };
    values.motion = motion;
  }
  if (body.category !== undefined || !partial) {
    const category = typeof body.category === 'string' ? body.category.trim().replace(/\s+/g, ' ') : '';
    if (category.length > 40) return { error: 'Category must be 40 characters or fewer.' };
    values.category = category || 'General';
  }
  if (body.level !== undefined || !partial) {
    const level = body.level ?? 'intermediate';
    if (!LEVELS.includes(level)) return { error: 'level must be beginner, intermediate or advanced.' };
    values.level = level;
  }
  for (const key of ['points_for', 'points_against']) {
    const pts = cleanPoints(body[key]);
    if (pts === null) return { error: `${key} must be a list of strings.` };
    if (pts !== undefined) values[key] = pts;
    else if (!partial) values[key] = [];
  }
  if (body.is_active !== undefined) {
    if (typeof body.is_active !== 'boolean') return { error: 'is_active must be true or false.' };
    values.is_active = body.is_active;
  }
  return { values };
}

module.exports = { learnerTopics, defaultTopics, serializeTopic, parseTopicInput, MAX_POINTS };
