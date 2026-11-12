// Premium switched on, with Razorpay mocked at the fetch layer.
process.env.PREMIUM_ENABLED = 'true';
process.env.RAZORPAY_KEY_ID = 'rzp_test_key';
process.env.RAZORPAY_KEY_SECRET = 'test_secret';
process.env.RAZORPAY_WEBHOOK_SECRET = 'hook_secret';
process.env.RAZORPAY_PLAN_MONTHLY = 'plan_m';
process.env.RAZORPAY_PLAN_YEARLY = 'plan_y';

const crypto = require('crypto');
const { api, resetDb, makeUser, auth, sequelize } = require('./helpers');
const { User } = require('../src/models');

beforeAll(resetDb);
afterAll(() => sequelize.close());

const realFetch = global.fetch;
afterEach(() => { global.fetch = realFetch; });
const mockFetch = (body, status = 200) => {
  global.fetch = jest.fn().mockResolvedValue({ ok: status < 400, status, json: async () => body });
};
const hmac = (data, key) => crypto.createHmac('sha256', key).update(data).digest('hex');
const startDebate = (token) => api().post('/api/debate').set(auth(token)).send({ topic: 'Homework should be banned', side: 'for', rounds: 2 });

describe('free plan limits', () => {
  test('one debate a week, then 402 PRO_REQUIRED with a reset time', async () => {
    const { token } = await makeUser();
    const me = await api().get('/api/auth/me').set(auth(token));
    expect(me.body.data.user.plan).toMatchObject({ pro: false, premium_enabled: true });

    expect((await startDebate(token)).status).toBe(201);
    const second = await startDebate(token);
    expect(second.status).toBe(402);
    expect(second.body.error.code).toBe('PRO_REQUIRED');
    expect(second.body.error.details).toMatchObject({ feature: 'debates', used: 1, limit: 1 });
    expect(new Date(second.body.error.details.resets_at).getTime()).toBeGreaterThan(Date.now());
  });

  test('pricing is public', async () => {
    const r = await api().get('/api/billing/plans');
    expect(r.body.data).toMatchObject({ premium_enabled: true, checkout_enabled: true });
    expect(r.body.data.plans.map(p => p.id)).toEqual(['monthly', 'yearly']);
  });
});

describe('checkout', () => {
  test('subscribe → verify unlocks Pro; a forged signature does not', async () => {
    const { token, user } = await makeUser();
    mockFetch({ id: 'sub_123', status: 'created' });
    const sub = await api().post('/api/billing/subscribe').set(auth(token)).send({ plan: 'monthly' });
    expect(sub.status).toBe(201);
    expect(sub.body.data).toMatchObject({ subscription_id: 'sub_123', key_id: 'rzp_test_key', amount: 149 });
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe('https://api.razorpay.com/v1/subscriptions');
    expect(JSON.parse(opts.body)).toMatchObject({ plan_id: 'plan_m', notes: { user_id: user.id, plan: 'monthly' } });

    const forged = await api().post('/api/billing/verify').set(auth(token)).send({
      razorpay_payment_id: 'pay_1', razorpay_subscription_id: 'sub_123', razorpay_signature: hmac('pay_1|sub_123', 'wrong'),
    });
    expect(forged.status).toBe(400);
    expect((await User.findByPk(user.id)).pro_until).toBeNull();

    const end = Math.floor(Date.now() / 1000) + 30 * 86400;
    mockFetch({ id: 'sub_123', status: 'active', current_end: end });
    const good = await api().post('/api/billing/verify').set(auth(token)).send({
      razorpay_payment_id: 'pay_1', razorpay_subscription_id: 'sub_123', razorpay_signature: hmac('pay_1|sub_123', 'test_secret'),
    });
    expect(good.status).toBe(200);
    expect(good.body.data).toMatchObject({ pro: true, source: 'razorpay', plan: 'monthly' });
    expect((await startDebate(token)).status).toBe(201);
    expect((await startDebate(token)).status).toBe(201); // no weekly limit on Pro
  });

  test('a signature for someone else\'s subscription is rejected', async () => {
    const { token } = await makeUser();
    mockFetch({ id: 'sub_mine', status: 'created' });
    await api().post('/api/billing/subscribe').set(auth(token)).send({ plan: 'yearly' });
    const r = await api().post('/api/billing/verify').set(auth(token)).send({
      razorpay_payment_id: 'pay_2', razorpay_subscription_id: 'sub_other', razorpay_signature: hmac('pay_2|sub_other', 'test_secret'),
    });
    expect(r.status).toBe(400);
  });
});

describe('webhooks', () => {
  const send = (payload, secret = 'hook_secret') => {
    const raw = JSON.stringify(payload);
    return api().post('/api/billing/webhook').set('content-type', 'application/json')
      .set('x-razorpay-signature', hmac(raw, secret)).send(raw);
  };

  test('charged extends Pro; halted records the status but keeps the paid period', async () => {
    const { user } = await makeUser();
    const end = Math.floor(Date.now() / 1000) + 365 * 86400;
    const entity = { id: 'sub_hook', status: 'active', current_end: end, notes: { user_id: user.id, plan: 'yearly' } };
    const r = await send({ event: 'subscription.charged', payload: { subscription: { entity } } });
    expect(r.status).toBe(200);
    let u = await User.findByPk(user.id);
    expect(u.rzp_status).toBe('active');
    expect(new Date(u.pro_until).getTime()).toBeGreaterThan(Date.now() + 364 * 864e5);

    await send({ event: 'subscription.halted', payload: { subscription: { entity: { ...entity, status: 'halted' } } } });
    u = await User.findByPk(user.id);
    expect(u.rzp_status).toBe('halted');
    expect(new Date(u.pro_until).getTime()).toBeGreaterThan(Date.now());
  });

  test('bad signature is rejected and changes nothing', async () => {
    const { user } = await makeUser();
    const entity = { id: 'sub_x', current_end: Math.floor(Date.now() / 1000) + 86400 * 30, notes: { user_id: user.id } };
    const r = await send({ event: 'subscription.charged', payload: { subscription: { entity } } }, 'nope');
    expect(r.status).toBe(400);
    expect((await User.findByPk(user.id)).pro_until).toBeNull();
  });
});

describe('admin controls', () => {
  test('grant and revoke Pro; promote and demote admins with guards', async () => {
    const admin = await makeUser({ is_admin: true });
    const { user } = await makeUser();

    const g = await api().post(`/api/admin/learners/${user.id}/pro`).set(auth(admin.token)).send({ days: 30 });
    expect(g.body.data.plan).toMatchObject({ pro: true, source: 'admin' });
    const rv = await api().post(`/api/admin/learners/${user.id}/pro`).set(auth(admin.token)).send({ days: 0 });
    expect(rv.body.data.plan.pro).toBe(false);

    const up = await api().patch(`/api/admin/learners/${user.id}`).set(auth(admin.token)).send({ is_admin: true });
    expect(up.body.data.is_admin).toBe(true);
    const self = await api().patch(`/api/admin/learners/${admin.user.id}`).set(auth(admin.token)).send({ is_admin: false });
    expect(self.body.error.code).toBe('CANNOT_DEMOTE_SELF');

    const list = await api().get('/api/admin/learners').set(auth(admin.token));
    expect(list.body.data[0]).toHaveProperty('plan');
  });
});

test('admins always have Pro', async () => {
  const { token } = await makeUser({ is_admin: true });
  const me = await api().get('/api/auth/me').set(auth(token));
  expect(me.body.data.user.plan).toMatchObject({ pro: true, source: 'staff' });
});
