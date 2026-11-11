// Shared response shapes, so dashboard/profile/result endpoints can't drift.
// The web client is written against these `video_*` / submission field names.

function serializeSubmission(sub, { withScene = false } = {}) {
  const out = {
    submission_id:        sub.id,
    response_text:        sub.response_text,
    input_type:           sub.input_type,
    score:                sub.score,
    breakdown: {
      grammar:    sub.grammar_score,
      vocabulary: sub.vocabulary_score,
      clarity:    sub.clarity_score,
    },
    feedback:             normaliseFeedback(sub.feedback),
    ai_response:          sub.ai_response          || null,
    improved_ai_response: sub.improved_ai_response || null,
    ideal_sentence:       sub.ideal_sentence       || null,
    date:                 sub.createdAt,
  };
  if (withScene) {
    const scene = sub.Scene;
    // The scene may have been deleted by an admin; history must still render.
    out.video = scene
      ? {
          video_url:        scene.youtube_url,
          description:      scene.description,
          additional_notes: scene.additional_notes,
          title:            scene.title,
          difficulty:       scene.difficulty,
        }
      : { video_url: null, description: null, additional_notes: null, title: 'Removed scene', difficulty: null };
  }
  return out;
}

function normaliseFeedback(fb) {
  // Older rows stored a flat string[]; current rows store { issues, suggestions, source }.
  if (Array.isArray(fb)) return { issues: fb, suggestions: [], source: 'ai' };
  return {
    issues: fb?.issues || [],
    suggestions: fb?.suggestions || [],
    source: fb?.source || 'ai',
  };
}

module.exports = { serializeSubmission, normaliseFeedback };
