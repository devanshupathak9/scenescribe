const { api, resetDb, makeUser, makeScene, auth } = require('./helpers');
const { User, Submission, Debate } = require('../src/models');
const { issueUnsubscribeToken, issueSessionToken } = require('../src/services/tokens');
const { runStreakReminders } = require('../src/services/reminders');
const { todayStr, addDays } = require('../src/utils/date');

beforeEach(resetDb);

describe('settings + unsubscribe', () => {
  test('toggles email reminders and exposes them on the user', async () => {
    const { token } = await makeUser();
    const me = await api().get('/api/auth/me').set(auth(token));
    expect(me.body.data.user).toMatchObject({ email_reminders: true, has_password: true });
    const r = await api().patch('/api/profile/settings').set(auth(token)).send({ email_reminders: false });
    expect(r.body.data.user.email_reminders).toBe(false);
    expect((await api().patch('/api/profile/settings').set(auth(token)).send({ email_reminders: 'no' })).status).toBe(400);
  });

  test('one-click unsubscribe works without a session; bad tokens are rejected', async () => {
    const { user, token } = await makeUser();
    const r = await api().post('/api/auth/unsubscribe').send({ token: issueUnsubscribeToken(user) });
    expect(r.body.data.unsubscribed).toBe(true);
    expect((await User.findByPk(user.id)).email_reminders).toBe(false);
    expect((await api().post('/api/auth/unsubscribe').send({ token: 'nope' })).body.error.code).toBe('INVALID_TOKEN');
    // A session token is not an unsubscribe token
    expect((await api().post('/api/auth/unsubscribe').send({ token })).body.error.code).toBe('INVALID_TOKEN');
  });
});

describe('POST /profile/delete-account', () => {
  test('requires typing DELETE and the right password', async () => {
    const { token } = await makeUser();
    expect((await api().post('/api/profile/delete-account').set(auth(token)).send({})).body.error.code).toBe('CONFIRM_REQUIRED');
    const wrong = await api().post('/api/profile/delete-account').set(auth(token)).send({ confirm: 'DELETE', password: 'nope' });
    expect(wrong.body.error.code).toBe('WRONG_PASSWORD');
  });

  test('deletes the user, their submissions and debates; the session stops working', async () => {
    const { user, token, password } = await makeUser();
    const scene = await makeScene();
    await Submission.create({ user_id: user.id, scene_id: scene.id, response_text: 'A man buys coffee.', status: 'completed', score: 70 });
    await Debate.create({ user_id: user.id, topic: 'Homework should be banned', user_side: 'for' });
    const r = await api().post('/api/profile/delete-account').set(auth(token)).send({ confirm: 'DELETE', password });
    expect(r.body.data.deleted).toBe(true);
    expect(await User.findByPk(user.id)).toBeNull();
    expect(await Submission.count({ where: { user_id: user.id } })).toBe(0);
    expect(await Debate.count({ where: { user_id: user.id } })).toBe(0);
    expect((await api().get('/api/auth/me').set(auth(token))).status).toBe(401);
  });

  test('Google-only users confirm with DELETE alone', async () => {
    const user = await User.create({ email: 'g@gmail.com', username: 'guser', is_registered: true, google_id: 'g1' }, { hooks: false });
    const r = await api().post('/api/profile/delete-account').set(auth(issueSessionToken(user))).send({ confirm: 'DELETE' });
    expect(r.body.data.deleted).toBe(true);
  });

  test('admins cannot delete themselves', async () => {
    const { token, password } = await makeUser({ is_admin: true });
    const r = await api().post('/api/profile/delete-account').set(auth(token)).send({ confirm: 'DELETE', password });
    expect(r.status).toBe(403);
  });
});

describe('streak reminders', () => {
  const today = todayStr();
  const yesterday = addDays(today, -1);

  test('emails only learners whose streak breaks tonight, once per day, within the cap', async () => {
    const due = (await makeUser({ full_name: 'Asha Rao', curr_streak: 5, last_submission_date: yesterday })).user;
    const due2 = (await makeUser({ curr_streak: 1, last_submission_date: yesterday })).user;
    await makeUser({ curr_streak: 6, last_submission_date: today });                          // already practised
    await makeUser({ curr_streak: 3, last_submission_date: addDays(today, -3) });             // streak already broken
    await makeUser({ curr_streak: 4, last_submission_date: yesterday, email_reminders: false }); // opted out
    await makeUser({ curr_streak: 4, last_submission_date: yesterday, is_registered: false });   // unfinished sign-up

    const sent = [];
    const send = async (to, data) => { sent.push({ to, ...data }); return true; };
    const r1 = await runStreakReminders({ send });
    expect(r1.sent).toBe(2);
    expect(sent.map(s => s.to)).toEqual([due.email, due2.email]); // longest streak first
    expect(sent[0]).toMatchObject({ name: 'Asha', streak: 5 });
    expect(sent[0].unsubscribeUrl).toMatch(/\/unsubscribe\?t=/);

    const r2 = await runStreakReminders({ send });
    expect(r2.sent).toBe(0);
    expect(sent).toHaveLength(2);
  });

  test('respects the daily cap and keeps going after a failed send', async () => {
    await makeUser({ curr_streak: 9, last_submission_date: yesterday });
    await makeUser({ curr_streak: 8, last_submission_date: yesterday });
    await makeUser({ curr_streak: 7, last_submission_date: yesterday });
    let calls = 0;
    const send = async () => { calls++; if (calls === 1) throw new Error('smtp down'); return true; };
    const r = await runStreakReminders({ send, cap: 2 });
    expect(r).toMatchObject({ sent: 1, failed: 1, due: 2 });
    expect((await runStreakReminders({ send, cap: 2 })).skipped).toBe('cap');
  });
});
