const { api, resetDb, makeUser, makeScene, auth, sequelize } = require('./helpers');
const { User } = require('../src/models');
const { todayStr, addDays, nextDayStartISO } = require('../src/utils/date');

beforeAll(resetDb);
afterAll(() => sequelize.close());

describe('empty-day support', () => {
  test('NO_SCENE carries the next drop time and the current streak', async () => {
    const { token, user } = await makeUser();
    await user.update({ curr_streak: 4, longest_streak: 4, last_submission_date: addDays(todayStr(), -1) });
    const r = await api().get('/api/dashboard/today').set(auth(token));
    expect(r.status).toBe(404);
    expect(r.body.error.code).toBe('NO_SCENE');
    expect(r.body.error.details).toMatchObject({ date: todayStr(), current_streak: 4 });
    expect(r.body.error.details.next_scene_at).toBe(nextDayStartISO());
  });

  test('catch-up lists recent unanswered past scenes, newest first, never future ones', async () => {
    const { token } = await makeUser();
    const old = await makeScene({ title: 'Two days ago', publish_date: addDays(todayStr(), -2) });
    const yesterday = await makeScene({ title: 'Yesterday', publish_date: addDays(todayStr(), -1) });
    await makeScene({ title: 'Way back', publish_date: addDays(todayStr(), -45) });
    await makeScene({ title: 'Tomorrow', publish_date: addDays(todayStr(), 1) });

    let r = await api().get('/api/dashboard/catch-up').set(auth(token));
    expect(r.body.data.scenes.map(s => s.title)).toEqual(['Yesterday', 'Two days ago']);

    await api().post('/api/dashboard/submit').set(auth(token)).send({ video_id: yesterday.id, response_text: 'People are talking at a busy cafe.' });
    r = await api().get('/api/dashboard/catch-up').set(auth(token));
    expect(r.body.data.scenes.map(s => s.video_id)).toEqual([old.id]);
  });

  test('a single released scene can be opened; the answer key stays hidden until answered', async () => {
    const { token } = await makeUser();
    const past = await makeScene({ title: 'Past scene', publish_date: addDays(todayStr(), -3) });
    const future = await makeScene({ title: 'Future', publish_date: addDays(todayStr(), 2) });

    const r = await api().get(`/api/dashboard/scene/${past.id}`).set(auth(token));
    expect(r.status).toBe(200);
    expect(r.body.data.scenes[0]).toMatchObject({ status: 'pending' });
    expect(r.body.data.scenes[0].video.description).toBeNull();
    expect((await api().get(`/api/dashboard/scene/${future.id}`).set(auth(token))).status).toBe(404);
    expect((await api().get('/api/dashboard/scene/nope').set(auth(token))).status).toBe(404);
  });
});

describe('debates count as practice days', () => {
  test('finishing a debate continues the streak', async () => {
    const { token, user } = await makeUser();
    await user.update({ curr_streak: 2, longest_streak: 2, last_submission_date: addDays(todayStr(), -1) });
    const d = (await api().post('/api/debate').set(auth(token)).send({ topic: 'Cities are better than villages', side: 'for', rounds: 2 })).body.data;
    await api().post(`/api/debate/${d.id}/turns`).set(auth(token)).send({ turn_index: 0, text: 'Cities have more jobs and better hospitals for families.', duration_s: 25 });
    await api().post(`/api/debate/${d.id}/finish`).set(auth(token));
    const fresh = await User.findByPk(user.id);
    expect(fresh.curr_streak).toBe(3);
    expect(fresh.last_submission_date).toBe(todayStr());
  });
});

describe('profile insights', () => {
  test('new user: empty skills, no focus, 28 empty activity days', async () => {
    const { token } = await makeUser();
    const r = await api().get('/api/profile/me').set(auth(token));
    expect(r.body.data.skills).toHaveLength(6);
    expect(r.body.data.skills.every(s => s.score === null)).toBe(true);
    expect(r.body.data.focus).toBeNull();
    expect(r.body.data.level).toBeNull();
    expect(r.body.data.activity).toHaveLength(28);
    expect(r.body.data.activity.at(-1).date).toBe(todayStr());
  });

  test('after practice: skills combine scenes and debates, focus is the weakest, today is active', async () => {
    const { token } = await makeUser();
    for (const title of ['A', 'B']) {
      const s = await makeScene({ title });
      await api().post('/api/dashboard/submit').set(auth(token)).send({ video_id: s.id, response_text: 'A man is ordering a coffee at the counter.' });
    }
    const d = (await api().post('/api/debate').set(auth(token)).send({ topic: 'Homework should be banned', side: 'for', rounds: 2 })).body.data;
    await api().post(`/api/debate/${d.id}/turns`).set(auth(token)).send({ turn_index: 0, text: 'Homework takes time away from rest, sports and family life every day.', duration_s: 30, metrics: { avg_confidence: 0.8 } });
    await api().post(`/api/debate/${d.id}/finish`).set(auth(token));

    const r = (await api().get('/api/profile/me').set(auth(token))).body.data;
    expect(r.stats.practices).toBe(3);
    expect(r.stats.practised_today).toBe(true);
    expect(r.activity.at(-1).count).toBe(3);
    expect(r.level).toMatch(/^[ABC][12]$/);
    const byKey = Object.fromEntries(r.skills.map(s => [s.key, s]));
    expect(byKey.grammar.samples).toBe(3);   // 2 scenes + 1 debate
    expect(byKey.clarity.samples).toBe(2);   // scenes only
    expect(byKey.fluency.samples).toBe(1);   // debate only
    const lowest = r.skills.filter(s => s.score != null).reduce((a, b) => (b.score < a.score ? b : a));
    expect(r.focus).toBe(lowest.key);
  });
});
