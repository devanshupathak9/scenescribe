const { api, resetDb, makeUser, makeScene, auth } = require('./helpers');
const { todayStr, addDays } = require('../src/utils/date');

beforeAll(resetDb);

describe('admin dashboard', () => {
  let admin;
  beforeAll(async () => {
    admin = await makeUser({ is_admin: true, full_name: 'Site Admin' });
    await makeScene({ publish_date: todayStr() });
    await makeScene({ publish_date: addDays(todayStr(), 2) });
  });

  test('analytics reports runway gaps, activity and system status', async () => {
    const r = await api().get('/api/admin/analytics').set(auth(admin.token));
    expect(r.status).toBe(200);
    const d = r.body.data;
    expect(d.today).toBe(todayStr());
    expect(d.runway).toHaveLength(14);
    expect(d.runway[0]).toEqual({ date: todayStr(), scenes: 1 });
    expect(d.first_gap).toBe(addDays(todayStr(), 1));
    expect(d.activity).toHaveLength(14);
    expect(d.activity[13].date).toBe(todayStr());
    expect(d.system).toMatchObject({ ai_enabled: expect.any(Boolean), email_enabled: expect.any(Boolean), timezone: expect.any(String) });
    expect(Array.isArray(d.recent_activity)).toBe(true);
  });

  test('learners list is searchable and paginated', async () => {
    await makeUser({ full_name: 'Meera Nair' });
    const all = await api().get('/api/admin/learners').set(auth(admin.token));
    expect(all.status).toBe(200);
    expect(all.body.meta).toMatchObject({ page: 1 });
    expect(all.body.data.length).toBeGreaterThanOrEqual(2);
    expect(all.body.data[0]).toHaveProperty('current_streak');

    const hit = await api().get('/api/admin/learners?q=meera').set(auth(admin.token));
    expect(hit.body.data.map(u => u.full_name)).toEqual(['Meera Nair']);

    const wild = await api().get('/api/admin/learners?q=%25').set(auth(admin.token));
    expect(wild.body.data).toHaveLength(0);
  });

  test('learners list is admin-only', async () => {
    const { token } = await makeUser();
    expect((await api().get('/api/admin/learners').set(auth(token))).status).toBe(403);
  });
});
