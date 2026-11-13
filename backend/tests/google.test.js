jest.mock('../src/services/googleAuth', () => ({ verifyGoogleIdToken: jest.fn() }));
const { verifyGoogleIdToken } = require('../src/services/googleAuth');
const { AppError } = require('../src/utils/http');
const { User } = require('../src/models');
const { api, resetDb, makeUser, auth } = require('./helpers');

beforeAll(resetDb);

const profile = (o = {}) => ({ sub: 'g-sub-1', email: 'new.person@gmail.com', email_verified: true, name: 'New Person', picture: 'https://lh3.googleusercontent.com/a/x', ...o });

describe('POST /auth/google', () => {
  test('creates a registered Google-only account and returns a session', async () => {
    verifyGoogleIdToken.mockResolvedValueOnce(profile());
    const r = await api().post('/api/auth/google').send({ credential: 'tok' });
    expect(r.status).toBe(200);
    expect(r.body.data.token).toEqual(expect.any(String));
    expect(r.body.data.user).toMatchObject({ email: 'new.person@gmail.com', avatar_url: profile().picture });
    const u = await User.findOne({ where: { email: 'new.person@gmail.com' } });
    expect(u).toMatchObject({ google_id: 'g-sub-1', is_registered: true, password_hash: null });
    expect(u.username).toMatch(/^[a-z0-9_.]{3,30}$/i);
    expect((await api().get('/api/auth/me').set(auth(r.body.data.token))).status).toBe(200);
  });

  test('signing in again finds the same account by Google id', async () => {
    verifyGoogleIdToken.mockResolvedValueOnce(profile({ email: 'renamed@gmail.com' }));
    const r = await api().post('/api/auth/google').send({ credential: 'tok' });
    expect(r.status).toBe(200);
    expect(r.body.data.user.email).toBe('new.person@gmail.com');
    expect(await User.count({ where: { google_id: 'g-sub-1' } })).toBe(1);
  });

  test('links Google to an existing email/password account and keeps the password', async () => {
    const { user, password } = await makeUser({ email: 'existing@gmail.com' });
    verifyGoogleIdToken.mockResolvedValueOnce(profile({ sub: 'g-sub-2', email: 'Existing@Gmail.com' }));
    const r = await api().post('/api/auth/google').send({ credential: 'tok' });
    expect(r.status).toBe(200);
    expect(r.body.data.user.id).toBe(user.id);
    await user.reload();
    expect(user.google_id).toBe('g-sub-2');
    const login = await api().post('/api/auth/login').send({ email: 'existing@gmail.com', password });
    expect(login.status).toBe(200);
  });

  test('Google-only accounts are told to use Google on password login', async () => {
    const r = await api().post('/api/auth/login').send({ email: 'new.person@gmail.com', password: 'whatever123' });
    expect(r.body.error.code).toBe('USE_GOOGLE');
  });

  test('rejects unverified Google emails', async () => {
    verifyGoogleIdToken.mockResolvedValueOnce(profile({ sub: 'g-sub-3', email: 'x@gmail.com', email_verified: false }));
    const r = await api().post('/api/auth/google').send({ credential: 'tok' });
    expect(r.status).toBe(403);
    expect(r.body.error.code).toBe('GOOGLE_EMAIL_UNVERIFIED');
  });

  test('passes through an invalid-token error and validates input', async () => {
    verifyGoogleIdToken.mockRejectedValueOnce(new AppError(401, 'GOOGLE_TOKEN_INVALID', 'bad'));
    expect((await api().post('/api/auth/google').send({ credential: 'tok' })).body.error.code).toBe('GOOGLE_TOKEN_INVALID');
    expect((await api().post('/api/auth/google').send({})).status).toBe(400);
  });
});
