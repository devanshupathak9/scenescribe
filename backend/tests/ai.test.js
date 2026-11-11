// Exercises the AI-enabled code paths with a mocked OpenAI layer.
process.env.OPENAI_API_KEY = 'sk-test';

jest.mock('../src/services/ai', () => {
  const actual = jest.requireActual('../src/services/ai');
  return { ...actual, structuredCompletion: jest.fn(), textCompletion: jest.fn() };
});

const ai = require('../src/services/ai');
const { api, resetDb, makeUser, makeScene, auth, sequelize } = require('./helpers');
const { Submission, User } = require('../src/models');

beforeAll(resetDb);
afterAll(() => sequelize.close());
beforeEach(() => jest.clearAllMocks());

const sceneFeedback = {
  grammar_score: 6, vocabulary_score: 8, clarity_score: 9, overall_score: 2, // wrong overall on purpose
  issues: ['"is order" → "is ordering"'], suggestions: ['Use the present continuous.'],
  improved_sentence: 'A man is ordering coffee.', ideal_sentence: 'A man orders a latte.',
};

describe('scene scoring with AI', () => {
  test('stores AI feedback and recomputes the overall score from the weights', async () => {
    ai.structuredCompletion.mockResolvedValueOnce(sceneFeedback);
    const { token } = await makeUser();
    const scene = await makeScene();
    const r = await api().post('/api/dashboard/submit').set(auth(token)).send({ video_id: scene.id, response_text: 'A man is order coffee.' });
    expect(r.status).toBe(200);
    expect(r.body.data.feedback.source).toBe('ai');
    expect(r.body.data.score).toBe(Math.round(6 * 0.4 + 8 * 0.3 + 9 * 0.3)); // 8, not the model's 2
    expect(r.body.data.improved_ai_response).toBe('A man is ordering coffee.');
  });

  test('AI failure → 503, no score, no streak, and the learner can retry', async () => {
    const { token, user } = await makeUser();
    const scene = await makeScene({ title: 'Retry me' });
    const body = { video_id: scene.id, response_text: 'Someone is buying a ticket.' };

    ai.structuredCompletion.mockRejectedValueOnce(new ai.AiUnavailableError(new Error('timeout')));
    const fail = await api().post('/api/dashboard/submit').set(auth(token)).send(body);
    expect(fail.status).toBe(503);
    expect(fail.body.error.code).toBe('AI_UNAVAILABLE');
    expect(await Submission.count({ where: { user_id: user.id, status: 'completed' } })).toBe(0);
    expect((await User.findByPk(user.id)).curr_streak).toBe(0);

    ai.structuredCompletion.mockResolvedValueOnce(sceneFeedback);
    const ok = await api().post('/api/dashboard/submit').set(auth(token)).send(body);
    expect(ok.status).toBe(200);
    expect(await Submission.count({ where: { user_id: user.id } })).toBe(1); // reused the failed row
  });
});

describe('debate with AI', () => {
  const report = {
    cefr_level: 'B2', summary: 'Solid.',
    scores: {
      grammar: { score: 70, comment: 'g' }, vocabulary: { score: 80, comment: 'v' }, fluency: { score: 60, comment: 'f' },
      pronunciation: { score: 75, comment: 'p' }, confidence: { score: 90, comment: 'c' },
    },
    strengths: ['a'], improvements: ['b'],
    mistakes: [{ original: 'parents is', correction: 'parents are', explanation: 'plural', category: 'grammar' }],
    vocabulary_upgrades: [{ instead_of: 'good', try: 'beneficial', example: 'It is beneficial.' }],
    useful_phrases: ['However…'], best_moment: 'x', next_steps: ['y'],
  };

  test('opponent turns are trimmed and the report uses server-side weighting', async () => {
    const long = Array.from({ length: 150 }, () => 'word').join(' ') + '.';
    ai.textCompletion.mockResolvedValue(`**Bold** ${long}`);
    ai.structuredCompletion.mockResolvedValueOnce(report);

    const { token } = await makeUser();
    const d = (await api().post('/api/debate').set(auth(token)).send({ topic: 'Homework should be banned', side: 'against', rounds: 2, level: 'beginner' })).body.data;
    const opening = d.turns[0].text;
    expect(opening).not.toMatch(/\*/);
    expect(opening.split(' ').length).toBeLessThanOrEqual(70);

    let state = d;
    for (const idx of [1, 3]) {
      state = (await api().post(`/api/debate/${d.id}/turns`).set(auth(token)).send({
        turn_index: idx, text: 'I think parents is happier when kids have free time in the evening.', duration_s: 30, input_type: 'microphone',
      })).body.data;
    }
    expect(state.next_turn).toBeNull();

    const fin = await api().post(`/api/debate/${d.id}/finish`).set(auth(token));
    expect(fin.status).toBe(200);
    const r = fin.body.data.report;
    expect(r.source).toBe('ai');
    expect(r.overall_score).toBe(Math.round(70 * 0.22 + 80 * 0.2 + 60 * 0.2 + 75 * 0.13 + 90 * 0.25));
    expect(r.mistakes[0].correction).toBe('parents are');
  });

  test('opponent failure keeps the learner turn and can be retried', async () => {
    ai.textCompletion.mockRejectedValueOnce(new ai.AiUnavailableError(new Error('down')));
    const { token } = await makeUser();
    const d = (await api().post('/api/debate').set(auth(token)).send({ topic: 'Cities are better than villages', side: 'for', rounds: 2 })).body.data;
    const t = await api().post(`/api/debate/${d.id}/turns`).set(auth(token)).send({ turn_index: 0, text: 'Cities have more jobs.', duration_s: 20 });
    expect(t.status).toBe(200);
    expect(t.body.data.ai_error).toBeTruthy();
    expect(t.body.data.turns).toHaveLength(1);
    expect(t.body.data.next_turn.speaker).toBe('ai');

    ai.textCompletion.mockResolvedValueOnce('Villages are calmer and cheaper.');
    const retry = await api().post(`/api/debate/${d.id}/ai-turn`).set(auth(token));
    expect(retry.body.data.turns).toHaveLength(2);
    expect(retry.body.data.next_turn).toEqual({ round: 2, speaker: 'user' });
  });

  test('evaluation failure → 503 and the debate stays open', async () => {
    ai.textCompletion.mockResolvedValue('A reply.');
    ai.structuredCompletion.mockRejectedValueOnce(new ai.AiUnavailableError(new Error('down')));
    const { token } = await makeUser();
    const d = (await api().post('/api/debate').set(auth(token)).send({ topic: 'Cities are better than villages', side: 'for', rounds: 2 })).body.data;
    await api().post(`/api/debate/${d.id}/turns`).set(auth(token)).send({ turn_index: 0, text: 'Cities have more jobs and better hospitals.', duration_s: 20 });
    const fin = await api().post(`/api/debate/${d.id}/finish`).set(auth(token));
    expect(fin.status).toBe(503);
    const after = await api().get(`/api/debate/${d.id}`).set(auth(token));
    expect(after.body.data.status).toBe('in_progress');
  });
});
