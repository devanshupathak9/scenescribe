const express = require('express');
const { Debate, sequelize } = require('../models');
const { authenticate } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimit');
const { AiUnavailableError } = require('../services/ai');
const D = require('../services/debate');
const TOPICS = require('../data/debateTopics');
const { ok, fail, asyncHandler, requireUuidParam } = require('../utils/http');

const router = express.Router();
router.use(authenticate);

const LEVELS = ['beginner', 'intermediate', 'advanced'];
const SIDES = ['for', 'against'];
const MIN_ROUNDS = 2;
const MAX_ROUNDS = 5;
const TURN_SECONDS = 40;
const TRANSITION_SECONDS = 10;
const MAX_TURN_CHARS = 2500;

const AI_DOWN = "The AI opponent couldn't respond just now. Your progress is saved — tap retry.";

function serialize(debate, { full = true } = {}) {
  const base = {
    id: debate.id,
    topic: debate.topic,
    user_side: debate.user_side,
    ai_side: D.otherSide(debate.user_side),
    rounds: debate.rounds,
    level: debate.level,
    status: debate.status,
    overall_score: debate.overall_score,
    cefr_level: debate.report?.cefr_level || null,
    created_at: debate.createdAt,
    completed_at: debate.completed_at,
  };
  if (!full) return base;
  return {
    ...base,
    turn_seconds: debate.turn_seconds,
    transition_seconds: TRANSITION_SECONDS,
    turns: debate.turns,
    next_turn: debate.status === 'in_progress' ? D.nextTurn(debate) : null,
    report: debate.report,
  };
}

function sanitizeMetrics(m) {
  if (!m || typeof m !== 'object') return {};
  const num = (v, lo, hi) => (Number.isFinite(Number(v)) ? Math.max(lo, Math.min(hi, Number(v))) : undefined);
  return {
    avg_confidence: num(m.avg_confidence, 0, 1),
    long_pauses: num(m.long_pauses, 0, 100),
    low_confidence_words: Array.isArray(m.low_confidence_words)
      ? m.low_confidence_words.filter(w => typeof w === 'string').map(w => w.slice(0, 30)).slice(0, 30)
      : [],
  };
}

async function loadOwned(req) {
  return Debate.findOne({ where: { id: req.params.id, user_id: req.user.id } });
}

// Appends the AI's turn if it is the AI's go. Returns the updated debate.
async function advanceAi(debate) {
  const next = D.nextTurn(debate);
  if (!next || next.speaker !== 'ai') return debate;
  const text = await D.generateOpponentTurn(debate, next.round);
  const expectedLength = debate.turns.length;
  return sequelize.transaction(async (t) => {
    const fresh = await Debate.findByPk(debate.id, { transaction: t, lock: t.LOCK.UPDATE });
    // Another request already advanced it (double click / retry race) — keep theirs.
    if (fresh.turns.length !== expectedLength) return fresh;
    fresh.turns = [...fresh.turns, { speaker: 'ai', round: next.round, text }];
    await fresh.save({ transaction: t });
    return fresh;
  });
}

// GET /debate/topics — curated motions
router.get('/topics', (req, res) => ok(res, {
  topics: TOPICS,
  config: { turn_seconds: TURN_SECONDS, transition_seconds: TRANSITION_SECONDS, min_rounds: MIN_ROUNDS, max_rounds: MAX_ROUNDS },
}));

// GET /debate — the user's completed debates, newest first
router.get('/', asyncHandler(async (req, res) => {
  const page = Math.max(1, parseInt(req.query.page, 10) || 1);
  const limit = 10;
  const { count, rows } = await Debate.findAndCountAll({
    where: { user_id: req.user.id, status: 'completed' },
    order: [['createdAt', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });
  return ok(res, rows.map(d => serialize(d, { full: false })), 200,
    { meta: { total: count, page, pages: Math.ceil(count / limit) } });
}));

// POST /debate — start a debate. If the AI argues FOR, it opens.
router.post('/', aiLimiter, asyncHandler(async (req, res) => {
  const topic = typeof req.body.topic === 'string' ? req.body.topic.trim().replace(/\s+/g, ' ') : '';
  const { side } = req.body;
  const level = LEVELS.includes(req.body.level) ? req.body.level : 'intermediate';
  const rounds = parseInt(req.body.rounds, 10) || 3;

  if (topic.length < 8 || topic.length > 200) {
    return fail(res, 400, 'INVALID_INPUT', 'Please enter a debate topic between 8 and 200 characters.');
  }
  if (!SIDES.includes(side)) return fail(res, 400, 'INVALID_INPUT', 'side must be "for" or "against"');
  if (rounds < MIN_ROUNDS || rounds > MAX_ROUNDS) {
    return fail(res, 400, 'INVALID_INPUT', `rounds must be ${MIN_ROUNDS}–${MAX_ROUNDS}`);
  }

  let debate = await Debate.create({
    user_id: req.user.id, topic, user_side: side, rounds, level, turn_seconds: TURN_SECONDS, turns: [],
  });

  try {
    debate = await advanceAi(debate);
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) throw err;
    // Created, but the opening is missing; the client retries via /ai-turn.
    return ok(res, { ...serialize(debate), ai_error: AI_DOWN }, 201);
  }
  return ok(res, serialize(debate), 201);
}));

// GET /debate/:id
router.get('/:id', requireUuidParam('id', 'NOT_FOUND', 'Debate not found'), asyncHandler(async (req, res) => {
  const debate = await loadOwned(req);
  if (!debate) return fail(res, 404, 'NOT_FOUND', 'Debate not found');
  return ok(res, serialize(debate));
}));

// POST /debate/:id/turns — the learner's turn; returns the AI's reply when it's their go.
// Body: { turn_index, text, duration_s, input_type, metrics }
router.post('/:id/turns', requireUuidParam('id', 'NOT_FOUND', 'Debate not found'), aiLimiter, asyncHandler(async (req, res) => {
  const text = typeof req.body.text === 'string' ? req.body.text.trim().slice(0, MAX_TURN_CHARS) : '';
  const turnIndex = parseInt(req.body.turn_index, 10);

  const result = await sequelize.transaction(async (t) => {
    const debate = await Debate.findOne({
      where: { id: req.params.id, user_id: req.user.id }, transaction: t, lock: t.LOCK.UPDATE,
    });
    if (!debate) return [null, [404, 'NOT_FOUND', 'Debate not found']];
    if (debate.status !== 'in_progress') return [null, [409, 'DEBATE_FINISHED', 'This debate has already finished.']];

    const next = D.nextTurn(debate);
    if (!next || next.speaker !== 'user') return [null, [409, 'NOT_YOUR_TURN', "It isn't your turn yet."]];
    // Guards against double-submits and stale tabs.
    if (Number.isInteger(turnIndex) && turnIndex !== debate.turns.length) {
      return [null, [409, 'TURN_MISMATCH', 'This turn was already submitted.']];
    }

    debate.turns = [...debate.turns, {
      speaker: 'user',
      round: next.round,
      text,
      duration_s: Math.max(0, Math.min(debate.turn_seconds + 5, Number(req.body.duration_s) || 0)),
      input_type: req.body.input_type === 'keyboard' ? 'keyboard' : 'microphone',
      metrics: sanitizeMetrics(req.body.metrics),
    }];
    await debate.save({ transaction: t });
    return [debate];
  });
  const [saved, error] = result;
  if (error) return fail(res, ...error);

  try {
    return ok(res, serialize(await advanceAi(saved)));
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) throw err;
    return ok(res, { ...serialize(saved), ai_error: AI_DOWN });
  }
}));

// POST /debate/:id/ai-turn — retry the AI's turn after a failure
router.post('/:id/ai-turn', requireUuidParam('id', 'NOT_FOUND', 'Debate not found'), aiLimiter, asyncHandler(async (req, res) => {
  const debate = await loadOwned(req);
  if (!debate) return fail(res, 404, 'NOT_FOUND', 'Debate not found');
  if (debate.status !== 'in_progress') return fail(res, 409, 'DEBATE_FINISHED', 'This debate has already finished.');
  try {
    return ok(res, serialize(await advanceAi(debate)));
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) throw err;
    return fail(res, 503, 'AI_UNAVAILABLE', AI_DOWN);
  }
}));

// POST /debate/:id/finish — evaluate and store the report.
// Allowed early (learner ends the debate) as long as they have spoken once.
router.post('/:id/finish', requireUuidParam('id', 'NOT_FOUND', 'Debate not found'), aiLimiter, asyncHandler(async (req, res) => {
  const debate = await loadOwned(req);
  if (!debate) return fail(res, 404, 'NOT_FOUND', 'Debate not found');
  if (debate.status === 'completed') return ok(res, serialize(debate));

  const userTurns = debate.turns.filter(t => t.speaker === 'user');
  if (!userTurns.length) {
    await debate.update({ status: 'abandoned' });
    return fail(res, 400, 'NOTHING_TO_EVALUATE', 'You need to speak at least once before we can evaluate you.');
  }

  let report;
  try {
    report = await D.evaluateDebate(debate);
  } catch (err) {
    if (!(err instanceof AiUnavailableError)) throw err;
    return fail(res, 503, 'AI_UNAVAILABLE', "We couldn't generate your report right now. Your debate is saved — please try again.");
  }

  report.ended_early = Boolean(D.nextTurn(debate));
  await debate.update({ status: 'completed', report, overall_score: report.overall_score, completed_at: new Date() });
  return ok(res, serialize(debate));
}));

module.exports = router;
