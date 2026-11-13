const { api, resetDb, makeUser, auth } = require('./helpers');
const DEFAULTS = require('../src/data/debateTopics');

beforeAll(resetDb);

describe('admin-managed debate topics', () => {
  let admin; let learner; let created;
  beforeAll(async () => {
    admin = await makeUser({ is_admin: true });
    learner = await makeUser();
  });

  test('learners get the built-in topics while none are set', async () => {
    const r = await api().get('/api/debate/topics').set(auth(learner.token));
    expect(r.status).toBe(200);
    expect(r.body.data.source).toBe('default');
    expect(r.body.data.topics).toHaveLength(DEFAULTS.length);
    expect(r.body.data.topics[0]).toMatchObject({ points_for: [], points_against: [] });
  });

  test('admins can create a topic with talking points', async () => {
    const r = await api().post('/api/admin/topics').set(auth(admin.token)).send({
      motion: '  Exams should be replaced by projects ', category: 'Education', level: 'beginner',
      points_for: ['Projects test real skills', '  ', 'Less stress'], points_against: ['Exams are fairer'],
    });
    expect(r.status).toBe(201);
    created = r.body.data;
    expect(created).toMatchObject({ motion: 'Exams should be replaced by projects', points_for: ['Projects test real skills', 'Less stress'], is_active: true });
  });

  test('once one is active, learners see only the admin topics', async () => {
    const r = await api().get('/api/debate/topics').set(auth(learner.token));
    expect(r.body.data.source).toBe('custom');
    expect(r.body.data.topics).toEqual([expect.objectContaining({ id: created.id, points_against: ['Exams are fairer'] })]);
    expect(r.body.data.topics[0].is_active).toBeUndefined();
  });

  test('deactivating every topic falls back to the defaults', async () => {
    const r = await api().patch(`/api/admin/topics/${created.id}`).set(auth(admin.token)).send({ is_active: false });
    expect(r.body.data.is_active).toBe(false);
    expect((await api().get('/api/debate/topics').set(auth(learner.token))).body.data.source).toBe('default');
    const list = await api().get('/api/admin/topics').set(auth(admin.token));
    expect(list.body.data).toMatchObject({ using_defaults: true, topics: [expect.objectContaining({ id: created.id })] });
    expect(list.body.data.defaults).toHaveLength(DEFAULTS.length);
  });

  test('import-defaults copies the built-in list once', async () => {
    const first = await api().post('/api/admin/topics/import-defaults').set(auth(admin.token));
    expect(first.body.data.imported).toBe(DEFAULTS.length);
    const again = await api().post('/api/admin/topics/import-defaults').set(auth(admin.token));
    expect(again.body.data.imported).toBe(0);
  });

  test('validates input, 404s and deletes', async () => {
    const dupe = await api().post('/api/admin/topics').set(auth(admin.token)).send({ motion: 'exams should be replaced by projects' });
    expect(dupe.body.error.code).toBe('DUPLICATE_TOPIC');
    const bad = await api().post('/api/admin/topics').set(auth(admin.token)).send({ motion: 'short' });
    expect(bad.status).toBe(400);
    const badPts = await api().patch(`/api/admin/topics/${created.id}`).set(auth(admin.token)).send({ points_for: 'nope' });
    expect(badPts.status).toBe(400);
    const del = await api().delete(`/api/admin/topics/${created.id}`).set(auth(admin.token));
    expect(del.body.data.deleted).toBe(true);
    expect((await api().delete(`/api/admin/topics/${created.id}`).set(auth(admin.token))).status).toBe(404);
  });

  test('learners cannot manage topics', async () => {
    expect((await api().get('/api/admin/topics').set(auth(learner.token))).status).toBe(403);
  });
});
