const express = require('express');
const { Op } = require('sequelize');
const { Scene, Vocabulary, Grammar, Submission, User, sequelize } = require('../models');
const { authenticate } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimit');
const { analyseSentence } = require('../services/sentenceAnalysis');
const { AiUnavailableError } = require('../services/ai');
const { nextStreak, effectiveStreak } = require('../services/streak');
const { todayStr, addDays, nextDayStartISO } = require('../utils/date');
const { ok, fail, asyncHandler, isUuid, requireUuidParam } = require('../utils/http');
const { serializeSubmission } = require('./serializers');

const router = express.Router();

const MIN_TEXT = 10;
const MAX_TEXT = 2000;
// A 'processing' claim older than this is assumed dead (crash mid-request).
const STALE_PROCESSING_MS = 2 * 60 * 1000;

const learningAids = [
  { model: Vocabulary, as: 'vocabularies', attributes: ['id', 'word', 'definition', 'example', 'part_of_speech'] },
  { model: Grammar, as: 'grammars', attributes: ['id', 'pattern', 'explanation', 'example'] },
];

// One scene in the learner-facing shape used by /today and /scene/:id.
// The reference description is the AI's ground truth, so it is only revealed
// after the learner has submitted for that scene.
function sceneItem(scene, sub) {
  const video = {
    video_id:         scene.id,
    video_url:        scene.youtube_url,
    title:            scene.title,
    difficulty:       scene.difficulty,
    date:             scene.publish_date,
    vocabularies:     scene.vocabularies,
    grammars:         scene.grammars,
    // Notes are learner-facing hints; the description is the answer key.
    additional_notes: scene.additional_notes,
    description:      sub ? scene.description : null,
  };
  if (!sub) return { status: 'pending', video };
  return { status: 'submitted', video, submission: serializeSubmission(sub) };
}

// GET /dashboard/today — all of today's scenes, each with the user's status.
router.get('/today', authenticate, asyncHandler(async (req, res) => {
  const today = todayStr();
  const meta = { date: today, next_scene_at: nextDayStartISO(), current_streak: effectiveStreak(req.user, today) };
  const scenes = await Scene.findAll({
    where: { publish_date: today },
    order: [['scene_order', 'ASC'], ['createdAt', 'ASC']],
    include: learningAids,
  });

  if (!scenes.length) {
    return fail(res, 404, 'NO_SCENE', 'No scene available for today', meta);
  }

  const submissions = await Submission.findAll({
    where: { user_id: req.user.id, scene_id: scenes.map(s => s.id), status: 'completed' },
  });
  const submissionMap = new Map(submissions.map(s => [s.scene_id, s]));

  return ok(res, { ...meta, scenes: scenes.map(scene => sceneItem(scene, submissionMap.get(scene.id))) });
}));

// GET /dashboard/catch-up — recent past scenes the learner hasn't answered yet
// (past scenes can still be answered and scored), newest first.
const CATCH_UP_DAYS = 30;
const CATCH_UP_LIMIT = 6;
router.get('/catch-up', authenticate, asyncHandler(async (req, res) => {
  const today = todayStr();
  const done = await Submission.findAll({
    attributes: ['scene_id'], where: { user_id: req.user.id, status: 'completed' }, raw: true,
  });
  const scenes = await Scene.findAll({
    where: {
      publish_date: { [Op.lt]: today, [Op.gte]: addDays(today, -CATCH_UP_DAYS) },
      ...(done.length ? { id: { [Op.notIn]: done.map(d => d.scene_id) } } : {}),
    },
    order: [['publish_date', 'DESC'], ['scene_order', 'ASC']],
    limit: CATCH_UP_LIMIT,
  });
  return ok(res, {
    scenes: scenes.map(s => ({
      video_id: s.id, title: s.title, difficulty: s.difficulty, date: s.publish_date, video_url: s.youtube_url,
    })),
  });
}));

// GET /dashboard/scene/:id — one released scene (today's or past) with the learner's status.
router.get('/scene/:id', authenticate, requireUuidParam('id', 'SCENE_NOT_FOUND', 'Scene not found'), asyncHandler(async (req, res) => {
  const scene = await Scene.findOne({
    where: { id: req.params.id, publish_date: { [Op.lte]: todayStr() } },
    include: learningAids,
  });
  if (!scene) return fail(res, 404, 'SCENE_NOT_FOUND', 'Scene not found');
  const sub = await Submission.findOne({ where: { user_id: req.user.id, scene_id: scene.id, status: 'completed' } });
  return ok(res, { scenes: [sceneItem(scene, sub)] });
}));

// Claim the (user, scene) slot inside a short row-locked transaction so two
// concurrent submits can't both be scored. Returns [submission] or [null, errorTuple].
async function claimSubmission(userId, scene, text, inputType) {
  return sequelize.transaction(async (t) => {
    // Serialises submissions per user without holding a lock during the AI call.
    await User.findByPk(userId, { transaction: t, lock: t.LOCK.UPDATE });

    const existing = await Submission.findAll({
      where: { user_id: userId, scene_id: scene.id },
      transaction: t,
    });
    if (existing.some(s => s.status === 'completed')) {
      return [null, [409, 'ALREADY_SUBMITTED', 'You have already submitted for this scene.']];
    }
    const live = existing.find(s => s.status === 'processing'
      && Date.now() - new Date(s.updatedAt).getTime() < STALE_PROCESSING_MS);
    if (live) return [null, [409, 'IN_PROGRESS', 'Your answer is already being scored. One moment…']];

    // Reuse a failed/stale attempt so retries don't pile up rows.
    const reusable = existing.find(s => s.status !== 'completed');
    const fields = { response_text: text, input_type: inputType, status: 'processing' };
    if (reusable) {
      reusable.changed('updatedAt', true);
      return [await reusable.update(fields, { transaction: t })];
    }
    return [await Submission.create({ user_id: userId, scene_id: scene.id, ...fields }, { transaction: t })];
  });
}

// POST /dashboard/submit — submit a description and get feedback
router.post('/submit', authenticate, aiLimiter, asyncHandler(async (req, res) => {
  const { video_id, input_type } = req.body;
  const text = typeof req.body.response_text === 'string' ? req.body.response_text.trim() : '';

  if (!isUuid(video_id)) return fail(res, 404, 'SCENE_NOT_FOUND', 'Scene not found');
  if (text.length < MIN_TEXT) {
    return fail(res, 400, 'INVALID_INPUT', `Please write at least ${MIN_TEXT} characters.`);
  }
  if (text.length > MAX_TEXT) {
    return fail(res, 400, 'INVALID_INPUT', `Please keep it under ${MAX_TEXT} characters.`);
  }

  const today = todayStr();
  const scene = await Scene.findOne({
    where: { id: video_id, publish_date: { [Op.lte]: today } },
    include: learningAids,
  });
  if (!scene) return fail(res, 404, 'SCENE_NOT_FOUND', 'Scene not found');

  const [submission, claimError] = await claimSubmission(
    req.user.id, scene, text, input_type === 'microphone' ? 'microphone' : 'keyboard',
  );
  if (claimError) return fail(res, ...claimError);

  let feedback;
  try {
    feedback = await analyseSentence({
      title:                 scene.title,
      student_response:      text,
      reference_description: scene.description      || null,
      additional_notes:      scene.additional_notes || null,
      difficulty:            scene.difficulty       || 'intermediate',
      vocabularies:          scene.vocabularies     || [],
      grammars:              scene.grammars         || [],
    });
  } catch (err) {
    await submission.update({ status: 'failed' });
    if (err instanceof AiUnavailableError) {
      return fail(res, 503, 'AI_UNAVAILABLE',
        "We couldn't score your answer right now. Your attempt wasn't used — please try again in a moment.");
    }
    throw err;
  }

  const result = await sequelize.transaction(async (t) => {
    const user = await User.findByPk(req.user.id, { transaction: t, lock: t.LOCK.UPDATE });
    await submission.update({
      score:             feedback.overall_score,
      grammar_score:     feedback.grammar_score,
      vocabulary_score:  feedback.vocabulary_score,
      clarity_score:     feedback.clarity_score,
      feedback: {
        issues:      feedback.issues      || [],
        suggestions: feedback.suggestions || [],
        source:      feedback.source,
      },
      ai_response:          feedback.improved_sentence || null,
      improved_ai_response: feedback.improved_sentence || null,
      ideal_sentence:       feedback.ideal_sentence    || null,
      status: 'completed',
    }, { transaction: t });

    const streak = nextStreak(user, today);
    await user.update({ ...streak, total_completed: (user.total_completed || 0) + 1 }, { transaction: t });
    return { streak };
  });

  return ok(res, {
    ...serializeSubmission(submission),
    // Revealed now that the learner has answered.
    reference_description: scene.description,
    new_streak: result.streak.curr_streak,
  });
}));

// GET /dashboard/result/:submissionId — a specific submission result
router.get('/result/:submissionId', authenticate, requireUuidParam('submissionId', 'NOT_FOUND', 'Submission not found'),
  asyncHandler(async (req, res) => {
    const submission = await Submission.findOne({
      where: { id: req.params.submissionId, user_id: req.user.id, status: 'completed' },
      include: [{ model: Scene, attributes: ['id', 'title', 'youtube_url', 'description', 'additional_notes', 'difficulty'] }],
    });
    if (!submission) return fail(res, 404, 'NOT_FOUND', 'Submission not found');
    return ok(res, serializeSubmission(submission, { withScene: true }));
  }));

module.exports = router;
