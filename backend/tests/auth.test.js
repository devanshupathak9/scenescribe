const { api, resetDb, makeUser, auth, sequelize } = require('./helpers');
const { User } = require('../src/models');

beforeAll(resetDb);
afterAll(() => sequelize.close());

const otpFor = async (email) => (await User.findOne({ where: { email } })).otp;

describe('registration', () => {
  test('register → verify creates an account and returns a session', async () => {
    const r1 = await api().post('/api/auth/register').send({ email: '  New@Test.com ' });
    expect(r1.status).toBe(200);
    expect(r1.body.data.email).toBe('new@test.com');

    const r2 = await api().post('/api/auth/verify').send({
      email: 'new@test.com', otp: await otpFor('new@test.com'),
      user_name: 'new_user', password: 'secret123', full_name: 'Arjun Kumar',
    });
    expect(r2.status).toBe(201);
    expect(r2.body.data.token).toBeTruthy();
    expect(r2.body.data.user).toMatchObject({ user_name: 'new_user', full_name: 'Arjun Kumar', is_admin: false });

    const login = await api().post('/api/auth/login').send({ email: 'NEW@test.com', password: 'secret123' });
    expect(login.status).toBe(200);
  });

  test('rejects an already registered email', async () => {
    await makeUser({ email: 'taken@test.com' });
    const r = await api().post('/api/auth/register').send({ email: 'taken@test.com' });
    expect(r.status).toBe(409);
    expect(r.body.error.code).toBe('EMAIL_IN_USE');
  });

  test('locks the OTP after 5 wrong guesses', async () => {
    await api().post('/api/auth/register').send({ email: 'brute@test.com' });
    const body = { email: 'brute@test.com', otp: '000000', user_name: 'brute', password: 'secret123' };
    for (let i = 0; i < 4; i++) {
      const r = await api().post('/api/auth/verify').send(body);
      expect(r.body.error.code).toBe('INVALID_OTP');
    }
    const fifth = await api().post('/api/auth/verify').send(body);
    expect(fifth.body.error.code).toBe('OTP_LOCKED');
    // Even the right code no longer works
    const right = await api().post('/api/auth/verify').send({ ...body, otp: await otpFor('brute@test.com') });
    expect(right.body.error.code).toBe('OTP_LOCKED');
  });

  test('rejects short passwords and bad usernames', async () => {
    await api().post('/api/auth/register').send({ email: 'weak@test.com' });
    const otp = await otpFor('weak@test.com');
    const short = await api().post('/api/auth/verify').send({ email: 'weak@test.com', otp, user_name: 'weakling', password: '123' });
    expect(short.status).toBe(400);
    const bad = await api().post('/api/auth/verify').send({ email: 'weak@test.com', otp, user_name: 'a b', password: 'secret123' });
    expect(bad.status).toBe(400);
  });

  test('username uniqueness is case-insensitive but underscores are literal', async () => {
    await makeUser({ email: 'u_one@test.com', username: 'snake_case' });
    await api().post('/api/auth/register').send({ email: 'u_two@test.com' });
    const otp = await otpFor('u_two@test.com');
    const clash = await api().post('/api/auth/verify').send({ email: 'u_two@test.com', otp, user_name: 'SNAKE_CASE', password: 'secret123' });
    expect(clash.body.error.code).toBe('USERNAME_TAKEN');
    // "snakeXcase" would have matched "snake_case" under iLike
    const ok = await api().post('/api/auth/verify').send({ email: 'u_two@test.com', otp, user_name: 'snakeXcase', password: 'secret123' });
    expect(ok.status).toBe(201);
  });
});

describe('login', () => {
  test('wrong password is a 401 with the envelope', async () => {
    await makeUser({ email: 'login@test.com' });
    const r = await api().post('/api/auth/login').send({ email: 'login@test.com', password: 'nope' });
    expect(r.status).toBe(401);
    expect(r.body).toEqual({ success: false, error: { code: 'INVALID_CREDENTIALS', message: expect.any(String) } });
  });

  test('legacy mixed-case stored emails can still sign in', async () => {
    await makeUser({ email: 'Legacy.User@Test.com', password: 'password123' });
    const r = await api().post('/api/auth/login').send({ email: 'legacy.user@test.com', password: 'password123' });
    expect(r.status).toBe(200);
  });

  test('Google-only accounts get a helpful error instead of a crash', async () => {
    const { User: U } = require('../src/models');
    await U.create({ email: 'g@test.com', username: 'googler', google_id: 'sub-1', is_registered: true }, { hooks: false });
    const r = await api().post('/api/auth/login').send({ email: 'g@test.com', password: 'whatever1' });
    expect(r.status).toBe(400);
    expect(r.body.error.code).toBe('USE_GOOGLE');
  });
});

describe('password reset', () => {
  test('forgot → reset changes the password', async () => {
    await makeUser({ email: 'forgot@test.com', password: 'oldpassword' });
    const f = await api().post('/api/auth/forgot').send({ email: 'forgot@test.com' });
    expect(f.status).toBe(200);
    const r = await api().post('/api/auth/reset').send({ email: 'forgot@test.com', otp: await otpFor('forgot@test.com'), password: 'newpassword' });
    expect(r.status).toBe(200);
    expect(r.body.data.token).toBeTruthy();
    expect((await api().post('/api/auth/login').send({ email: 'forgot@test.com', password: 'oldpassword' })).status).toBe(401);
    expect((await api().post('/api/auth/login').send({ email: 'forgot@test.com', password: 'newpassword' })).status).toBe(200);
  });

  test('forgot does not reveal whether an email exists', async () => {
    const r = await api().post('/api/auth/forgot').send({ email: 'nobody@test.com' });
    expect(r.status).toBe(200);
  });

  test('a registration code cannot be used to reset a password', async () => {
    await makeUser({ email: 'mixed@test.com' });
    await User.update({ otp: '123456', otp_expires_at: new Date(Date.now() + 60000), otp_purpose: 'register' }, { where: { email: 'mixed@test.com' } });
    const r = await api().post('/api/auth/reset').send({ email: 'mixed@test.com', otp: '123456', password: 'newpassword' });
    expect(r.body.error.code).toBe('NO_OTP');
  });
});

describe('google + session', () => {
  test('POST /auth/google is wired but reports not configured', async () => {
    const r = await api().post('/api/auth/google').send({ credential: 'fake.jwt.token' });
    expect(r.status).toBe(501);
    expect(r.body.error.code).toBe('GOOGLE_AUTH_NOT_CONFIGURED');
  });

  test('GET /auth/me validates the token', async () => {
    const { token } = await makeUser();
    expect((await api().get('/api/auth/me').set(auth(token))).status).toBe(200);
    expect((await api().get('/api/auth/me').set(auth('garbage'))).status).toBe(401);
    expect((await api().get('/api/auth/me')).body.error.code).toBe('NO_TOKEN');
  });
});
