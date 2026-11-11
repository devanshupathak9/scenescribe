const express = require('express');
const { authenticate } = require('../middleware/auth');
const { aiLimiter } = require('../middleware/rateLimit');
const { analyseSentence } = require('../services/sentenceAnalysis');
const { AiUnavailableError } = require('../services/ai');
const { Scene, Vocabulary, Grammar } = require('../models');
const { ok, fail, asyncHandler, isUuid } = require('../utils/http');

const router = express.Router();

// POST /analyse/sentence
// Body: { sentence, video_id }
// Practice-only scoring of any sentence against a scene. Nothing is persisted:
// this used to overwrite a completed submission's score, which let learners
// re-roll their graded attempt as many times as they liked.
router.post('/sentence', authenticate, aiLimiter, asyncHandler(async (req, res) => {
  const { sentence, video_id } = req.body;

  if (typeof sentence !== 'string' || sentence.trim().length < 3) {
    return fail(res, 400, 'INVALID_INPUT', 'sentence is required');
  }
  if (sentence.trim().length > 2000) {
    return fail(res, 400, 'INVALID_INPUT', 'sentence must be 2000 characters or fewer');
  }
  if (!isUuid(video_id)) return fail(res, 404, 'SCENE_NOT_FOUND', 'Scene not found');

  const scene = await Scene.findByPk(video_id, {
    include: [{ model: Vocabulary, as: 'vocabularies' }, { model: Grammar, as: 'grammars' }],
  });
  if (!scene) return fail(res, 404, 'SCENE_NOT_FOUND', 'Scene not found');

  try {
    const result = await analyseSentence({
      title:                 scene.title,
      student_response:      sentence.trim(),
      reference_description: scene.description      || null,
      additional_notes:      scene.additional_notes || null,
      difficulty:            scene.difficulty       || 'intermediate',
      vocabularies:          scene.vocabularies     || [],
      grammars:              scene.grammars         || [],
    });
    return ok(res, result);
  } catch (err) {
    if (err instanceof AiUnavailableError) {
      return fail(res, 503, 'AI_UNAVAILABLE', 'AI analysis is temporarily unavailable. Please try again.');
    }
    throw err;
  }
}));

module.exports = router;
