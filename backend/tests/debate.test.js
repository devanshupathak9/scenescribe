const { api, resetDb, makeUser, auth, sequelize } = require('./helpers');
const D = require('../src/services/debate');

beforeAll(resetDb);
afterAll(() => sequelize.close());

const speak = (text) => ({
  text, duration_s: 38, input_type: 'microphone',
  metrics: { avg_confidence: 0.86, long_pauses: 1, low_confidence_words: ['economy'] },
});

describe('turn plan', () => {
  test('FOR opens every round', () => {
    const forPlan = D.turnPlan({ user_side: 'for', rounds: 2 }).map(t => t.speaker);
    expect(forPlan).toEqual(['user', 'ai', 'user', 'ai']);
    const againstPlan = D.turnPlan({ user_side: 'against', rounds: 2 }).map(t => t.speaker);
    expect(againstPlan).toEqual(['ai', 'user', 'ai', 'user']);
  });

  test('AI replies are trimmed to fit the turn', () => {
    const long = Array.from({ length: 200 }, (_, i) => `word${i}`).join(' ');
    expect(D.trimToWords(long, 85).split(' ').length).toBeLessThanOrEqual(85);
  });
});

describe('debate API', () => {
  test('topics endpoint', async () => {
    const { token } = await makeUser();
    const r = await api().get('/api/debate/topics').set(auth(token));
    expect(r.body.data.topics.length).toBeGreaterThan(10);
    expect(r.body.data.config).toMatchObject({ turn_seconds: 40, transition_seconds: 10 });
  });

  test('full debate as FOR: user opens, AI replies each turn, report at the end', async () => {
    const { token } = await makeUser();
    const start = await api().post('/api/debate').set(auth(token))
      .send({ topic: 'Working from home is better than working in an office', side: 'for', rounds: 2, level: 'beginner' });
    expect(start.status).toBe(201);
    const id = start.body.data.id;
    expect(start.body.data.turns).toHaveLength(0);
    expect(start.body.data.next_turn).toEqual({ round: 1, speaker: 'user' });

    const t1 = await api().post(`/api/debate/${id}/turns`).set(auth(token))
      .send({ turn_index: 0, ...speak('I think working from home is better because um people save time and money on travel every day.') });
    expect(t1.status).toBe(200);
    expect(t1.body.data.turns).toHaveLength(2);
    expect(t1.body.data.turns[1].speaker).toBe('ai');
    expect(t1.body.data.next_turn).toEqual({ round: 2, speaker: 'user' });

    // Double submit of the same turn is rejected
    const dup = await api().post(`/api/debate/${id}/turns`).set(auth(token)).send({ turn_index: 0, ...speak('again') });
    expect(dup.body.error.code).toBe('TURN_MISMATCH');

    const t2 = await api().post(`/api/debate/${id}/turns`).set(auth(token))
      .send({ turn_index: 2, ...speak('Also families are happier when parents is at home and they can have lunch together.') });
    expect(t2.body.data.turns).toHaveLength(4);
    expect(t2.body.data.next_turn).toBeNull();

    const fin = await api().post(`/api/debate/${id}/finish`).set(auth(token));
    expect(fin.status).toBe(200);
    const { report } = fin.body.data;
    expect(fin.body.data.status).toBe('completed');
    expect(report.source).toBe('estimate');
    expect(Object.keys(report.scores)).toEqual(expect.arrayContaining(['grammar', 'vocabulary', 'fluency', 'pronunciation', 'confidence']));
    expect(report.overall_score).toBeGreaterThan(0);
    expect(report.metrics.total_words).toBeGreaterThan(20);
    expect(report.metrics.filler_count).toBeGreaterThanOrEqual(1);
    expect(report.ended_early).toBe(false);
    expect(Object.keys(report.scores)).toContain('sentence_structure');
    expect(['learner', 'ai', 'draw']).toContain(report.verdict.winner);
    expect(report.verdict.source).toBe('estimate');
    expect(report.metrics.hesitation).toMatchObject({ repetitions: expect.any(Number), restarts: expect.any(Number) });
    expect(report.metrics.sentences.linkers_used).toEqual(expect.any(Array));

    const list = await api().get('/api/debate').set(auth(token));
    expect(list.body.data[0]).toMatchObject({ id, status: 'completed' });

    const me = await api().get('/api/profile/me').set(auth(token));
    expect(me.body.data.stats.debates_completed).toBe(1);
  });

  test('as AGAINST the AI opens', async () => {
    const { token } = await makeUser();
    const r = await api().post('/api/debate').set(auth(token)).send({ topic: 'Homework should be banned in schools', side: 'against', rounds: 3 });
    expect(r.body.data.turns).toHaveLength(1);
    expect(r.body.data.turns[0].speaker).toBe('ai');
    expect(r.body.data.next_turn).toEqual({ round: 1, speaker: 'user' });
  });

  test('ending early still evaluates; ending with no speech does not', async () => {
    const { token } = await makeUser();
    const a = (await api().post('/api/debate').set(auth(token)).send({ topic: 'Cooking at home is better than eating out', side: 'for' })).body.data;
    const empty = await api().post(`/api/debate/${a.id}/finish`).set(auth(token));
    expect(empty.body.error.code).toBe('NOTHING_TO_EVALUATE');

    const b = (await api().post('/api/debate').set(auth(token)).send({ topic: 'Cooking at home is better than eating out', side: 'for' })).body.data;
    await api().post(`/api/debate/${b.id}/turns`).set(auth(token)).send({ turn_index: 0, ...speak('Home food is healthier and cheaper for most families.') });
    const fin = await api().post(`/api/debate/${b.id}/finish`).set(auth(token));
    expect(fin.status).toBe(200);
    expect(fin.body.data.report.ended_early).toBe(true);
  });

  test('validation and ownership', async () => {
    const { token } = await makeUser();
    const other = await makeUser();
    expect((await api().post('/api/debate').set(auth(token)).send({ topic: 'short', side: 'for' })).status).toBe(400);
    expect((await api().post('/api/debate').set(auth(token)).send({ topic: 'A perfectly fine topic here', side: 'maybe' })).status).toBe(400);
    expect((await api().post('/api/debate').set(auth(token)).send({ topic: 'A perfectly fine topic here', side: 'for', rounds: 9 })).status).toBe(400);

    const d = (await api().post('/api/debate').set(auth(token)).send({ topic: 'A perfectly fine topic here', side: 'for' })).body.data;
    expect((await api().get(`/api/debate/${d.id}`).set(auth(other.token))).status).toBe(404);
    expect((await api().get('/api/debate/nope').set(auth(token))).status).toBe(404);
  });
});
