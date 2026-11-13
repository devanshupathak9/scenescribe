const express = require('express');
const { Scene, Vocabulary, Grammar, Submission, User, Debate, DebateTopic, sequelize } = require('../models');
const { defaultTopics, serializeTopic, parseTopicInput } = require('../services/debateTopics');
const { authenticate, requireAdmin } = require('../middleware/auth');
const { Op } = require('sequelize');
const { env } = require('../config/env');
const { todayStr, addDays, dateInAppTz } = require('../utils/date');
const { effectiveStreak } = require('../services/streak');
const { emailConfigured } = require('../services/email');
const { planOf, grantPro } = require('../services/entitlements');
const { ok, fail, asyncHandler, isDateString, requireUuidParam } = require('../utils/http');

const router = express.Router();

router.use(authenticate, requireAdmin);

const MAX_SCENES_PER_DAY = 4;
const DIFFICULTIES = ['beginner', 'intermediate', 'advanced'];
const YOUTUBE_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/;

const withAids = [
  { model: Vocabulary, as: 'vocabularies' },
  { model: Grammar, as: 'grammars' },
];

function serializeScene(s) {
  return {
    video_id:         s.id,
    date:             s.publish_date,
    scene_order:      s.scene_order,
    video_url:        s.youtube_url,
    title:            s.title,
    description:      s.description,
    additional_notes: s.additional_notes,
    is_premium:       s.is_premium || false,
    difficulty:       s.difficulty,
    vocabularies:     s.vocabularies || [],
    grammars:         s.grammars || [],
  };
}

const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : v);

// Validates create (partial=false) or update (partial=true) payloads.
// Returns [fields, error] where fields uses DB column names.
function validateScene(body, { partial = false } = {}) {
  const f = {};
  const has = (k) => body[k] !== undefined;

  if (!partial || has('date')) {
    if (!isDateString(body.date)) return [null, 'date must be a valid YYYY-MM-DD date'];
    f.publish_date = body.date;
  }
  if (!partial || has('title')) {
    const t = str(body.title, 200);
    if (!t) return [null, 'title is required'];
    f.title = t;
  }
  if (!partial || has('video_url')) {
    const u = str(body.video_url, 500);
    if (!u || !YOUTUBE_RE.test(u)) return [null, 'video_url must be a YouTube link (watch, youtu.be, shorts or embed)'];
    f.youtube_url = u;
  }
  if (!partial || has('description')) {
    const d = str(body.description, 2000);
    if (!d) return [null, 'description (the reference answer) is required'];
    f.description = d;
  }
  if (has('additional_notes')) f.additional_notes = str(body.additional_notes, 2000) || null;
  if (has('is_premium')) f.is_premium = Boolean(body.is_premium);
  if (has('difficulty')) {
    if (!DIFFICULTIES.includes(body.difficulty)) return [null, `difficulty must be one of ${DIFFICULTIES.join(', ')}`];
    f.difficulty = body.difficulty;
  }
  if (has('scene_order') && body.scene_order !== null) {
    const n = parseInt(body.scene_order, 10);
    if (!(n >= 1 && n <= MAX_SCENES_PER_DAY)) return [null, `scene_order must be 1–${MAX_SCENES_PER_DAY}`];
    f.scene_order = n;
  }
  return [f, null];
}

function cleanAids(vocabularies, grammars) {
  const v = Array.isArray(vocabularies)
    ? vocabularies
      .filter(x => x && str(x.word, 100) && str(x.definition, 500))
      .slice(0, 20)
      .map(x => ({
        word: str(x.word, 100), definition: str(x.definition, 500),
        example: str(x.example, 500) || null, part_of_speech: str(x.part_of_speech, 30) || null,
      }))
    : null;
  const g = Array.isArray(grammars)
    ? grammars
      .filter(x => x && str(x.pattern, 200) && str(x.explanation, 1000))
      .slice(0, 10)
      .map(x => ({ pattern: str(x.pattern, 200), explanation: str(x.explanation, 1000), example: str(x.example, 500) || null }))
    : null;
  return [v, g];
}

async function replaceAids(sceneId, vocabularies, grammars, t) {
  const [v, g] = cleanAids(vocabularies, grammars);
  if (v) {
    await Vocabulary.destroy({ where: { scene_id: sceneId }, transaction: t });
    if (v.length) await Vocabulary.bulkCreate(v.map(x => ({ ...x, scene_id: sceneId })), { transaction: t });
  }
  if (g) {
    await Grammar.destroy({ where: { scene_id: sceneId }, transaction: t });
    if (g.length) await Grammar.bulkCreate(g.map(x => ({ ...x, scene_id: sceneId })), { transaction: t });
  }
}

// POST /admin/schedule — create a scene (up to MAX_SCENES_PER_DAY per date)
router.post('/schedule', asyncHandler(async (req, res) => {
  const [fields, error] = validateScene(req.body);
  if (error) return fail(res, 400, 'INVALID_INPUT', error);

  const scene = await sequelize.transaction(async (t) => {
    const existingCount = await Scene.count({ where: { publish_date: fields.publish_date }, transaction: t });
    if (existingCount >= MAX_SCENES_PER_DAY) return null;
    const created = await Scene.create({
      difficulty: 'intermediate',
      is_premium: false,
      scene_order: existingCount + 1,
      ...fields,
    }, { transaction: t });
    await replaceAids(created.id, req.body.vocabularies, req.body.grammars, t);
    return created;
  });

  if (!scene) return fail(res, 409, 'DATE_LIMIT', `Maximum ${MAX_SCENES_PER_DAY} scenes per day allowed`);
  return ok(res, { video_id: scene.id }, 201, { message: 'Scene scheduled' });
}));

// GET /admin/schedule — all scenes
router.get('/schedule', asyncHandler(async (req, res) => {
  const scenes = await Scene.findAll({
    order: [['publish_date', 'ASC'], ['scene_order', 'ASC'], ['createdAt', 'ASC']],
    include: withAids,
  });
  return ok(res, scenes.map(serializeScene));
}));

// GET /admin/schedule/:date — all scenes for a date
router.get('/schedule/:date', asyncHandler(async (req, res) => {
  if (!isDateString(req.params.date)) return fail(res, 400, 'INVALID_INPUT', 'date must be YYYY-MM-DD');
  const scenes = await Scene.findAll({
    where: { publish_date: req.params.date },
    order: [['scene_order', 'ASC'], ['createdAt', 'ASC']],
    include: withAids,
  });
  if (!scenes.length) return fail(res, 404, 'NOT_FOUND', 'No scenes scheduled for this date');
  return ok(res, scenes.map(serializeScene));
}));

// PATCH /admin/schedule/:id — update a scene (and optionally its vocab/grammar lists)
router.patch('/schedule/:id', requireUuidParam('id', 'NOT_FOUND', 'Scene not found'), asyncHandler(async (req, res) => {
  const [fields, error] = validateScene(req.body, { partial: true });
  if (error) return fail(res, 400, 'INVALID_INPUT', error);

  const result = await sequelize.transaction(async (t) => {
    const scene = await Scene.findByPk(req.params.id, { transaction: t });
    if (!scene) return [404, 'NOT_FOUND', 'Scene not found'];
    if (fields.publish_date && fields.publish_date !== scene.publish_date) {
      const count = await Scene.count({ where: { publish_date: fields.publish_date }, transaction: t });
      if (count >= MAX_SCENES_PER_DAY) return [409, 'DATE_LIMIT', `Maximum ${MAX_SCENES_PER_DAY} scenes per day allowed`];
    }
    await scene.update(fields, { transaction: t });
    await replaceAids(scene.id, req.body.vocabularies, req.body.grammars, t);
    return null;
  });
  if (result) return fail(res, ...result);

  const scene = await Scene.findByPk(req.params.id, { include: withAids });
  return ok(res, serializeScene(scene), 200, { message: 'Scene updated' });
}));

// DELETE /admin/schedule/:id — delete a scene that nobody has answered yet.
// Deleting an answered scene would erase learners' history, so it is refused.
router.delete('/schedule/:id', requireUuidParam('id', 'NOT_FOUND', 'Scene not found'), asyncHandler(async (req, res) => {
  const scene = await Scene.findByPk(req.params.id);
  if (!scene) return fail(res, 404, 'NOT_FOUND', 'Scene not found');

  const answered = await Submission.count({ where: { scene_id: scene.id } });
  if (answered) {
    return fail(res, 409, 'SCENE_HAS_SUBMISSIONS',
      `${answered} learner${answered === 1 ? ' has' : 's have'} already answered this scene, so it can't be deleted. Edit it instead.`);
  }
  await sequelize.transaction(async (t) => {
    await Vocabulary.destroy({ where: { scene_id: scene.id }, transaction: t });
    await Grammar.destroy({ where: { scene_id: scene.id }, transaction: t });
    await scene.destroy({ transaction: t });
  });
  return ok(res, { video_id: scene.id }, 200, { message: 'Scene deleted' });
}));

const ACTIVITY_DAYS = 14;
const RUNWAY_DAYS = 14;

// GET /admin/analytics — overview for the admin dashboard
router.get('/analytics', asyncHandler(async (req, res) => {
  const today = todayStr();
  const since = new Date(`${addDays(today, -(ACTIVITY_DAYS - 1))}T00:00:00Z`);
  const weekAgo = new Date(Date.now() - 7 * 864e5);
  const runwayEnd = addDays(today, RUNWAY_DAYS - 1);

  const [
    totalUsers, newUsers7d, totalSubmissions, totalScenes, avgResult, totalDebates,
    recentSubs, recentDebates, upcoming, feedSubs, feedDebates,
  ] = await Promise.all([
    User.count({ where: { is_registered: true } }),
    User.count({ where: { is_registered: true, createdAt: { [Op.gte]: weekAgo } } }),
    Submission.count({ where: { status: 'completed' } }),
    Scene.count(),
    Submission.findOne({
      attributes: [[sequelize.fn('AVG', sequelize.col('score')), 'avg_score']],
      where: { status: 'completed' },
      raw: true,
    }),
    Debate.count({ where: { status: 'completed' } }),
    Submission.findAll({ attributes: ['user_id', 'createdAt'], where: { status: 'completed', createdAt: { [Op.gte]: since } }, raw: true }),
    Debate.findAll({ attributes: ['user_id', 'completed_at'], where: { status: 'completed', completed_at: { [Op.gte]: since } }, raw: true }),
    Scene.findAll({ attributes: ['publish_date'], where: { publish_date: { [Op.between]: [today, runwayEnd] } }, raw: true }),
    Submission.findAll({
      where: { status: 'completed' }, order: [['createdAt', 'DESC']], limit: 8,
      include: [{ model: User, attributes: ['username'] }, { model: Scene, attributes: ['title'] }],
    }),
    Debate.findAll({
      where: { status: 'completed' }, order: [['completed_at', 'DESC']], limit: 8,
      attributes: ['id', 'topic', 'overall_score', 'completed_at', 'user_id'],
      include: [{ model: User, attributes: ['username'] }],
    }),
  ]);

  // Daily activity (app timezone) and active learners.
  const days = new Map(Array.from({ length: ACTIVITY_DAYS }, (_, i) => [addDays(today, i - ACTIVITY_DAYS + 1), { scenes: 0, debates: 0, learners: new Set() }]));
  const weekStart = addDays(today, -6);
  const active7 = new Set();
  const activeToday = new Set();
  const track = (kind, userId, instant) => {
    const d = dateInAppTz(new Date(instant));
    const bucket = days.get(d);
    if (!bucket) return;
    bucket[kind] += 1;
    bucket.learners.add(userId);
    if (d >= weekStart) active7.add(userId);
    if (d === today) activeToday.add(userId);
  };
  recentSubs.forEach(s => track('scenes', s.user_id, s.createdAt));
  recentDebates.forEach(d => track('debates', d.user_id, d.completed_at));

  // Content runway: how many of the next days have at least one scene.
  const perDay = upcoming.reduce((m, s) => m.set(s.publish_date, (m.get(s.publish_date) || 0) + 1), new Map());
  const runway = Array.from({ length: RUNWAY_DAYS }, (_, i) => {
    const date = addDays(today, i);
    return { date, scenes: perDay.get(date) || 0 };
  });
  const firstGap = runway.find(d => !d.scenes)?.date || null;

  const feed = [
    ...feedSubs.map(s => ({
      type: 'scene', id: s.id, username: s.User?.username, title: s.Scene?.title, score: s.score, max: 10, at: s.createdAt,
    })),
    ...feedDebates.map(d => ({
      type: 'debate', id: d.id, username: d.User?.username, title: d.topic, score: d.overall_score, max: 100, at: d.completed_at,
    })),
  ].sort((a, b) => new Date(b.at) - new Date(a.at)).slice(0, 10);

  return ok(res, {
    today,
    total_users:        totalUsers,
    new_users_7d:       newUsers7d,
    active_today:       activeToday.size,
    active_7d:          active7.size,
    total_submissions:  totalSubmissions,
    total_scenes:       totalScenes,
    total_debates:      totalDebates,
    average_score:      Number(avgResult?.avg_score || 0).toFixed(1),
    activity: [...days].map(([date, b]) => ({ date, scenes: b.scenes, debates: b.debates, learners: b.learners.size })),
    runway,
    first_gap: firstGap,
    recent_activity: feed,
    system: {
      ai_enabled:    env.aiEnabled,
      email_enabled: emailConfigured,
      timezone:      env.APP_TIMEZONE,
    },
    // Kept for older clients.
    ai_enabled: env.aiEnabled,
  });
}));

// GET /admin/learners?q=&page= — registered learners, most recent first
router.get('/learners', asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 20;
  const q = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
  const where = { is_registered: true };
  if (q) {
    const like = { [Op.iLike]: `%${q.replace(/[%_\\]/g, '\\$&')}%` };
    where[Op.or] = [{ email: like }, { username: like }, { full_name: like }];
  }
  const { count, rows } = await User.findAndCountAll({
    where, order: [['createdAt', 'DESC']], limit, offset: (page - 1) * limit,
  });
  const ids = rows.map(u => u.id);
  const debateCounts = ids.length
    ? await Debate.findAll({
      attributes: ['user_id', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
      where: { user_id: ids, status: 'completed' }, group: ['user_id'], raw: true,
    })
    : [];
  const debatesBy = new Map(debateCounts.map(d => [d.user_id, Number(d.n)]));
  const today = todayStr();

  return ok(res, rows.map(u => ({
    id:             u.id,
    user_name:      u.username,
    full_name:      u.full_name,
    email:          u.email,
    is_admin:       u.is_admin,
    google:         Boolean(u.google_id),
    joined_at:      u.createdAt,
    last_practice:  u.last_submission_date,
    current_streak: effectiveStreak(u, today),
    scenes:         u.total_completed || 0,
    debates:        debatesBy.get(u.id) || 0,
    plan:           planOf(u),
    is_owner:       Boolean(env.ADMIN_EMAIL) && u.email === env.ADMIN_EMAIL,
  })), 200, { meta: { total: count, page, pages: Math.ceil(count / limit) } });
}));

const learnerId = requireUuidParam('id', 'NOT_FOUND', 'Learner not found');

// POST /admin/learners/:id/pro { days } — grant Pro for N days (1–3650); days 0 revokes.
// For college pilots, creators and support fixes. Paid subscriptions are not cancelled here.
router.post('/learners/:id/pro', learnerId, asyncHandler(async (req, res) => {
  const days = parseInt(req.body.days, 10);
  if (!Number.isInteger(days) || days < 0 || days > 3650) return fail(res, 400, 'INVALID_INPUT', 'days must be 0–3650');
  const user = await User.findByPk(req.params.id);
  if (!user || !user.is_registered) return fail(res, 404, 'NOT_FOUND', 'Learner not found');
  if (days === 0) {
    if (user.pro_source === 'razorpay' && user.rzp_status === 'active') {
      return fail(res, 409, 'HAS_SUBSCRIPTION', 'This learner pays by subscription. Cancel it in Razorpay instead.');
    }
    await user.update({ pro_until: null, pro_source: null }, { hooks: false });
  } else {
    await grantPro(user, new Date(Date.now() + days * 864e5), user.pro_source === 'razorpay' ? 'razorpay' : 'admin');
  }
  return ok(res, { id: user.id, plan: planOf(user) });
}));

// PATCH /admin/learners/:id { is_admin } — add or remove a content admin.
router.patch('/learners/:id', learnerId, asyncHandler(async (req, res) => {
  if (typeof req.body.is_admin !== 'boolean') return fail(res, 400, 'INVALID_INPUT', 'is_admin must be true or false');
  const user = await User.findByPk(req.params.id);
  if (!user || !user.is_registered) return fail(res, 404, 'NOT_FOUND', 'Learner not found');
  if (!req.body.is_admin) {
    if (user.id === req.user.id) return fail(res, 409, 'CANNOT_DEMOTE_SELF', "You can't remove your own admin access.");
    if (env.ADMIN_EMAIL && user.email === env.ADMIN_EMAIL) {
      return fail(res, 409, 'OWNER_ADMIN', 'This is the owner account set by ADMIN_EMAIL; it stays an admin.');
    }
  }
  await user.update({ is_admin: req.body.is_admin }, { hooks: false });
  return ok(res, { id: user.id, is_admin: user.is_admin });
}));

// ── Debate topics ─────────────────────────────────────────────────────────────
// While no topic is active, learners get the built-in list (data/debateTopics.js).

const topicId = requireUuidParam('id', 'NOT_FOUND', 'Topic not found');
const MAX_TOPICS = 300;

// GET /admin/topics — the admin's topics plus the built-in defaults for reference
router.get('/topics', asyncHandler(async (req, res) => {
  const rows = await DebateTopic.findAll({ order: [['category', 'ASC'], ['createdAt', 'ASC']] });
  const active = rows.filter(r => r.is_active).length;
  return ok(res, {
    topics: rows.map(serializeTopic),
    defaults: defaultTopics(),
    using_defaults: active === 0,
  });
}));

// POST /admin/topics { motion, category?, level?, points_for?, points_against? }
router.post('/topics', asyncHandler(async (req, res) => {
  const { values, error } = parseTopicInput(req.body);
  if (error) return fail(res, 400, 'INVALID_INPUT', error);
  const dupe = await DebateTopic.findOne({ where: sequelize.where(sequelize.fn('lower', sequelize.col('motion')), values.motion.toLowerCase()) });
  if (dupe) return fail(res, 409, 'DUPLICATE_TOPIC', 'That motion is already in your list.');
  if (await DebateTopic.count() >= MAX_TOPICS) return fail(res, 409, 'TOO_MANY_TOPICS', `You can keep up to ${MAX_TOPICS} topics.`);
  const topic = await DebateTopic.create(values);
  return ok(res, serializeTopic(topic), 201);
}));

// POST /admin/topics/import-defaults — copy the built-in list in so it can be edited.
// Skips motions that already exist, so it is safe to run twice.
router.post('/topics/import-defaults', asyncHandler(async (req, res) => {
  const existing = new Set((await DebateTopic.findAll({ attributes: ['motion'] })).map(t => t.motion.toLowerCase()));
  const fresh = defaultTopics()
    .filter(t => !existing.has(t.motion.toLowerCase()))
    .map(({ id, ...t }) => t);
  if (fresh.length) await DebateTopic.bulkCreate(fresh);
  return ok(res, { imported: fresh.length }, 201);
}));

// PATCH /admin/topics/:id — any subset of the create fields, plus is_active
router.patch('/topics/:id', topicId, asyncHandler(async (req, res) => {
  const topic = await DebateTopic.findByPk(req.params.id);
  if (!topic) return fail(res, 404, 'NOT_FOUND', 'Topic not found');
  const { values, error } = parseTopicInput(req.body, { partial: true });
  if (error) return fail(res, 400, 'INVALID_INPUT', error);
  await topic.update(values);
  return ok(res, serializeTopic(topic));
}));

// DELETE /admin/topics/:id
router.delete('/topics/:id', topicId, asyncHandler(async (req, res) => {
  const deleted = await DebateTopic.destroy({ where: { id: req.params.id } });
  if (!deleted) return fail(res, 404, 'NOT_FOUND', 'Topic not found');
  return ok(res, { id: req.params.id, deleted: true });
}));

module.exports = router;
