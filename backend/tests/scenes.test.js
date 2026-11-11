const { api, resetDb, makeUser, makeScene, auth, sequelize } = require('./helpers');
const { User, Submission } = require('../src/models');
const { todayStr, addDays } = require('../src/utils/date');

beforeAll(resetDb);
afterAll(() => sequelize.close());

describe('daily scenes', () => {
  test('today hides the reference answer until the learner submits', async () => {
    const { token } = await makeUser();
    const scene = await makeScene();

    const before = await api().get('/api/dashboard/today').set(auth(token));
    expect(before.status).toBe(200);
    expect(before.body.data.date).toBe(todayStr());
    const item = before.body.data.scenes.find(s => s.video.video_id === scene.id);
    expect(item.status).toBe('pending');
    expect(item.video.description).toBeNull();

    const sub = await api().post('/api/dashboard/submit').set(auth(token))
      .send({ video_id: scene.id, response_text: 'A man is order coffee at cafe and pay with card.' });
    expect(sub.status).toBe(200);
    expect(sub.body.data.feedback.source).toBe('estimate');
    expect(sub.body.data.reference_description).toBe(scene.description);
    expect(sub.body.data.score).toBeGreaterThanOrEqual(1);
    expect(sub.body.data.feedback.issues.join(' ')).toMatch(/ordering|-ing/);

    const after = await api().get('/api/dashboard/today').set(auth(token));
    const done = after.body.data.scenes.find(s => s.video.video_id === scene.id);
    expect(done.status).toBe('submitted');
    expect(done.video.description).toBe(scene.description);
  });

  test('only one graded attempt per scene, even with concurrent submits', async () => {
    const { token, user } = await makeUser();
    const scene = await makeScene({ title: 'Race' });
    const body = { video_id: scene.id, response_text: 'Two people are talking at the counter.' };
    const results = await Promise.all([1, 2, 3].map(() => api().post('/api/dashboard/submit').set(auth(token)).send(body)));
    expect(results.filter(r => r.status === 200)).toHaveLength(1);
    expect(await Submission.count({ where: { user_id: user.id, scene_id: scene.id, status: 'completed' } })).toBe(1);
    const again = await api().post('/api/dashboard/submit').set(auth(token)).send(body);
    expect(again.body.error.code).toBe('ALREADY_SUBMITTED');
  });

  test('malformed and unknown ids are 404s, not 500s', async () => {
    const { token } = await makeUser();
    expect((await api().get('/api/profile/history/abc').set(auth(token))).status).toBe(404);
    expect((await api().get('/api/dashboard/result/abc').set(auth(token))).status).toBe(404);
    expect((await api().get('/api/profile/history/00000000-0000-4000-8000-000000000000').set(auth(token))).status).toBe(404);
    const sub = await api().post('/api/dashboard/submit').set(auth(token)).send({ video_id: 'abc', response_text: 'Long enough text here.' });
    expect(sub.status).toBe(404);
  });

  test('future scenes cannot be answered early', async () => {
    const { token } = await makeUser();
    const future = await makeScene({ publish_date: addDays(todayStr(), 3) });
    const r = await api().post('/api/dashboard/submit').set(auth(token)).send({ video_id: future.id, response_text: 'A long enough description.' });
    expect(r.status).toBe(404);
  });
});

describe('streaks', () => {
  test('stored streak is not shown after a missed day', async () => {
    const { token, user } = await makeUser();
    await user.update({ curr_streak: 5, longest_streak: 5, last_submission_date: addDays(todayStr(), -3) });
    const r = await api().get('/api/profile/me').set(auth(token));
    expect(r.body.data.stats.current_streak).toBe(0);
    expect(r.body.data.stats.longest_streak).toBe(5);
  });

  test('submitting the day after continues the streak', async () => {
    const { token, user } = await makeUser();
    await user.update({ curr_streak: 2, longest_streak: 2, last_submission_date: addDays(todayStr(), -1) });
    const scene = await makeScene({ title: 'Streak' });
    const r = await api().post('/api/dashboard/submit').set(auth(token)).send({ video_id: scene.id, response_text: 'A woman is reading a book in the park.' });
    expect(r.body.data.new_streak).toBe(3);
    expect((await User.findByPk(user.id)).longest_streak).toBe(3);
  });
});

describe('admin', () => {
  let admin;
  beforeAll(async () => { admin = await makeUser({ is_admin: true }); });

  test('non-admins are forbidden', async () => {
    const { token } = await makeUser();
    expect((await api().get('/api/admin/schedule').set(auth(token))).status).toBe(403);
  });

  test('validates payloads instead of 500ing', async () => {
    const base = { date: '2030-01-01', title: 'T', description: 'D', video_url: 'https://youtu.be/dQw4w9WgXcQ' };
    const bad = [
      { ...base, date: '2030-13-45' },
      { ...base, video_url: 'https://vimeo.com/123' },
      { ...base, difficulty: 'expert' },
      { ...base, description: '' },
    ];
    for (const body of bad) {
      const r = await api().post('/api/admin/schedule').set(auth(admin.token)).send(body);
      expect(r.status).toBe(400);
    }
    expect((await api().get('/api/admin/schedule/not-a-date').set(auth(admin.token))).status).toBe(400);
  });

  test('creates with vocabulary + grammar, enforces 4/day, edits and deletes', async () => {
    const date = '2031-05-05';
    const create = (i) => api().post('/api/admin/schedule').set(auth(admin.token)).send({
      date, title: `Scene ${i}`, description: 'Ref', video_url: 'https://www.youtube.com/shorts/dQw4w9WgXcQ',
      vocabularies: [{ word: 'counter', definition: 'a flat surface' }, { word: '' }],
      grammars: [{ pattern: 'present continuous', explanation: 'actions now' }],
    });
    const ids = [];
    for (let i = 1; i <= 4; i++) ids.push((await create(i)).body.data.video_id);
    expect((await create(5)).body.error.code).toBe('DATE_LIMIT');

    const list = await api().get(`/api/admin/schedule/${date}`).set(auth(admin.token));
    expect(list.body.data).toHaveLength(4);
    expect(list.body.data[0].vocabularies).toHaveLength(1);

    const patch = await api().patch(`/api/admin/schedule/${ids[0]}`).set(auth(admin.token))
      .send({ title: 'Renamed', vocabularies: [{ word: 'latte', definition: 'coffee with milk' }, { word: 'barista', definition: 'coffee maker' }] });
    expect(patch.status).toBe(200);
    expect(patch.body.data.title).toBe('Renamed');
    expect(patch.body.data.vocabularies).toHaveLength(2);

    expect((await api().delete(`/api/admin/schedule/${ids[1]}`).set(auth(admin.token))).status).toBe(200);
    expect((await api().delete('/api/admin/schedule/xyz').set(auth(admin.token))).status).toBe(404);
  });

  test('refuses to delete a scene learners have answered', async () => {
    const { token } = await makeUser();
    const scene = await makeScene({ title: 'Answered' });
    await api().post('/api/dashboard/submit').set(auth(token)).send({ video_id: scene.id, response_text: 'Someone is ordering a drink.' });
    const r = await api().delete(`/api/admin/schedule/${scene.id}`).set(auth(admin.token));
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('SCENE_HAS_SUBMISSIONS');
  });

  test('analytics', async () => {
    const r = await api().get('/api/admin/analytics').set(auth(admin.token));
    expect(r.status).toBe(200);
    expect(r.body.data).toHaveProperty('total_debates');
    expect(r.body.data.ai_enabled).toBe(false);
  });
});
