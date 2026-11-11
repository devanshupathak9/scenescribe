const express = require('express');
const { Submission, Scene, Debate, sequelize } = require('../models');
const { authenticate } = require('../middleware/auth');
const { effectiveStreak } = require('../services/streak');
const { Op } = require('sequelize');
const { todayStr, addDays, dateInAppTz } = require('../utils/date');
const { ok, fail, asyncHandler, requireUuidParam } = require('../utils/http');
const { serializeSubmission } = require('./serializers');

const router = express.Router();

router.use(authenticate);

const ACTIVITY_DAYS = 28;
const SKILLS = [
  { key: 'grammar', label: 'Grammar' },
  { key: 'vocabulary', label: 'Vocabulary' },
  { key: 'clarity', label: 'Clarity' },
  { key: 'fluency', label: 'Fluency' },
  { key: 'pronunciation', label: 'Pronunciation' },
  { key: 'confidence', label: 'Confidence & argument' },
];
const MIN_PRACTICES_FOR_FOCUS = 3;

const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

// GET /profile/me — user profile + stats, skill profile and recent activity
router.get('/me', asyncHandler(async (req, res) => {
  const user = req.user;
  const where = { user_id: user.id, status: 'completed' };
  const today = todayStr();
  const since = new Date(Date.now() - (ACTIVITY_DAYS + 1) * 864e5);

  const [agg, recent, debates, recentSubs, debatesCompleted] = await Promise.all([
    Submission.findOne({
      attributes: [
        [sequelize.fn('AVG', sequelize.col('score')), 'avg_score'],
        [sequelize.fn('MAX', sequelize.col('score')), 'highest_score'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
        [sequelize.fn('AVG', sequelize.col('grammar_score')), 'grammar'],
        [sequelize.fn('AVG', sequelize.col('vocabulary_score')), 'vocabulary'],
        [sequelize.fn('AVG', sequelize.col('clarity_score')), 'clarity'],
      ],
      where,
      raw: true,
    }),
    Submission.findAll({ attributes: ['score', 'createdAt'], where, order: [['createdAt', 'DESC']], limit: 10, raw: true }),
    Debate.findAll({
      attributes: ['id', 'topic', 'overall_score', 'report', 'completed_at'],
      where: { user_id: user.id, status: 'completed' },
      order: [['completed_at', 'DESC']],
      limit: 20,
    }),
    Submission.findAll({ attributes: ['createdAt'], where: { ...where, createdAt: { [Op.gte]: since } }, raw: true }),
    Debate.count({ where: { user_id: user.id, status: 'completed' } }),
  ]);

  const total = Number(agg?.total || 0);
  const debateScores = debates.map(d => d.overall_score).filter(n => n != null);

  // Skill profile (0–100): scene sub-scores are 1–10, debate categories 0–100.
  const sceneSkill = (k) => (total && agg[k] != null ? [Number(agg[k]) * 10] : []);
  const debateSkill = (k) => debates.map(d => d.report?.scores?.[k]?.score).filter(Number.isFinite);
  const skills = SKILLS.map(({ key, label }) => {
    const fromScenes = ['grammar', 'vocabulary', 'clarity'].includes(key) ? sceneSkill(key) : [];
    const fromDebates = debateSkill(key);
    // Weight the scene average by how many scenes it summarises.
    const parts = [...fromScenes.map(v => ({ v, w: total })), ...fromDebates.map(v => ({ v, w: 1 }))];
    const weight = parts.reduce((a, p) => a + p.w, 0);
    const score = weight ? Math.round(parts.reduce((a, p) => a + p.v * p.w, 0) / weight) : null;
    return { key, label, score, samples: (fromScenes.length ? total : 0) + fromDebates.length };
  });
  const practices = total + debatesCompleted;
  const measured = skills.filter(s => s.score != null);
  const focus = practices >= MIN_PRACTICES_FOR_FOCUS && measured.length
    ? measured.reduce((lo, s) => (s.score < lo.score ? s : lo)).key
    : null;

  // Practice days in the app timezone, oldest → newest.
  const counts = new Map();
  const bump = (instant) => {
    const d = dateInAppTz(new Date(instant));
    counts.set(d, (counts.get(d) || 0) + 1);
  };
  recentSubs.forEach(s => bump(s.createdAt));
  debates.filter(d => d.completed_at && new Date(d.completed_at) >= since).forEach(d => bump(d.completed_at));
  const activity = Array.from({ length: ACTIVITY_DAYS }, (_, i) => {
    const date = addDays(today, i - ACTIVITY_DAYS + 1);
    return { date, count: counts.get(date) || 0 };
  });

  const corrections = debates
    .flatMap(d => (d.report?.mistakes || []).map(m => ({ ...m, debate_id: d.id })))
    .filter(m => m.original && m.correction)
    .slice(0, 4);

  return ok(res, {
    user: user.toPublic(),
    level: debates.find(d => d.report?.cefr_level)?.report.cefr_level || null,
    stats: {
      avg_score:       total ? Number(agg.avg_score).toFixed(1) : '0.0',
      highest_score:   agg?.highest_score ?? 0,
      current_streak:  effectiveStreak(user, today),
      longest_streak:  user.longest_streak ?? 0,
      total_completed: total,
      practices,
      // Oldest → newest, for the progress sparkline.
      recent_scores:   recent.reverse().map(r => r.score),
      debates_completed: debatesCompleted,
      debate_avg_score:  debateScores.length ? Math.round(mean(debateScores)) : null,
      debate_best_score: debateScores.length ? Math.max(...debateScores) : null,
      practised_today:   (counts.get(today) || 0) > 0,
    },
    skills,
    focus,
    activity,
    recent_corrections: corrections,
  });
}));

// GET /profile/history?page=1 — paginated submission history
router.get('/history', asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 10;

  const { count, rows } = await Submission.findAndCountAll({
    where: { user_id: req.user.id, status: 'completed' },
    include: [{ model: Scene, attributes: ['id', 'title', 'publish_date', 'youtube_url', 'difficulty'] }],
    order: [['createdAt', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });

  return ok(res, rows.map(sub => ({
    submission_id: sub.id,
    date:          sub.createdAt,
    score:         sub.score,
    scene_title:   sub.Scene?.title || 'Removed scene',
    video_url:     sub.Scene?.youtube_url || null,
    publish_date:  sub.Scene?.publish_date || null,
    difficulty:    sub.Scene?.difficulty || null,
  })), 200, { meta: { total: count, page, pages: Math.ceil(count / limit) } });
}));

// GET /profile/history/:id — detailed result of a past submission
router.get('/history/:id', requireUuidParam('id', 'NOT_FOUND', 'Submission not found'), asyncHandler(async (req, res) => {
  const submission = await Submission.findOne({
    where: { id: req.params.id, user_id: req.user.id, status: 'completed' },
    include: [{ model: Scene, attributes: ['id', 'title', 'youtube_url', 'description', 'additional_notes', 'difficulty'] }],
  });
  if (!submission) return fail(res, 404, 'NOT_FOUND', 'Submission not found');
  return ok(res, serializeSubmission(submission, { withScene: true }));
}));

module.exports = router;
