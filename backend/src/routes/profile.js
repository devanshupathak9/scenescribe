const express = require('express');
const { Submission, Scene, Debate, sequelize } = require('../models');
const { authenticate } = require('../middleware/auth');
const { effectiveStreak } = require('../services/streak');
const { ok, fail, asyncHandler, requireUuidParam } = require('../utils/http');
const { serializeSubmission } = require('./serializers');

const router = express.Router();

router.use(authenticate);

// GET /profile/me — user profile + stats
router.get('/me', asyncHandler(async (req, res) => {
  const user = req.user;
  const where = { user_id: user.id, status: 'completed' };

  const [agg, recent, debateAgg] = await Promise.all([
    Submission.findOne({
      attributes: [
        [sequelize.fn('AVG', sequelize.col('score')), 'avg_score'],
        [sequelize.fn('MAX', sequelize.col('score')), 'highest_score'],
        [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
      ],
      where,
      raw: true,
    }),
    Submission.findAll({ attributes: ['score', 'createdAt'], where, order: [['createdAt', 'DESC']], limit: 10, raw: true }),
    Debate.findOne({
      attributes: [
        [sequelize.fn('COUNT', sequelize.col('id')), 'total'],
        [sequelize.fn('AVG', sequelize.col('overall_score')), 'avg'],
        [sequelize.fn('MAX', sequelize.col('overall_score')), 'best'],
      ],
      where: { user_id: user.id, status: 'completed' },
      raw: true,
    }),
  ]);

  const total = Number(agg?.total || 0);
  const debates = Number(debateAgg?.total || 0);

  return ok(res, {
    user: user.toPublic(),
    stats: {
      avg_score:       total ? Number(agg.avg_score).toFixed(1) : '0.0',
      highest_score:   agg?.highest_score ?? 0,
      current_streak:  effectiveStreak(user),
      longest_streak:  user.longest_streak ?? 0,
      total_completed: total,
      // Oldest → newest, for the progress sparkline.
      recent_scores:   recent.reverse().map(r => r.score),
      debates_completed: debates,
      debate_avg_score:  debates ? Math.round(Number(debateAgg.avg)) : null,
      debate_best_score: debates ? Number(debateAgg.best) : null,
    },
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
