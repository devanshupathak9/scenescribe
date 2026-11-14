const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const { Op } = require('sequelize');
const { User, sequelize } = require('../models');
const { sendOTPEmail } = require('../services/email');
const { issueSessionToken, verifyUnsubscribeToken } = require('../services/tokens');
const { verifyGoogleIdToken } = require('../services/googleAuth');
const { authenticate } = require('../middleware/auth');
const { authLimiter, otpSendLimiter } = require('../middleware/rateLimit');
const { ok, fail, asyncHandler } = require('../utils/http');

const router = express.Router();

const OTP_TTL_MS = 10 * 60 * 1000;
const MAX_OTP_ATTEMPTS = 5;
const MIN_PASSWORD = 8;
const USERNAME_RE = /^[a-zA-Z0-9_.]{3,30}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// ── helpers ──────────────────────────────────────────────────────────────────

const normEmail = (e) => (typeof e === 'string' ? e.trim().toLowerCase() : '');

// Exact, case-insensitive match (iLike would treat _ and % as wildcards).
// Accounts created before emails were normalised may have mixed case stored.
const ciEquals = (column, value) => sequelize.where(sequelize.fn('lower', sequelize.col(column)), value.toLowerCase());
const byEmail = (email, extra = {}) => ({ where: { [Op.and]: [ciEquals('email', email), extra] } });

function generateOTP() {
  // Cryptographically random 6-digit code (100000–999999)
  return crypto.randomInt(100000, 1000000).toString();
}

function otpMatches(user, otp) {
  if (!user.otp || typeof otp !== 'string') return false;
  const a = Buffer.from(user.otp);
  const b = Buffer.from(otp.trim());
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// Validates an OTP for `purpose`; on a wrong guess increments the attempt
// counter and burns the code after MAX_OTP_ATTEMPTS. Returns an error tuple or null.
async function checkOtp(user, otp, purpose) {
  if (!user.otp || !user.otp_expires_at || user.otp_purpose !== purpose) {
    return [400, 'NO_OTP', 'No active code. Please request a new one.'];
  }
  if (new Date() > new Date(user.otp_expires_at)) {
    return [400, 'OTP_EXPIRED', 'This code has expired. Please request a new one.'];
  }
  if (user.otp_attempts >= MAX_OTP_ATTEMPTS) {
    return [429, 'OTP_LOCKED', 'Too many wrong attempts. Please request a new code.'];
  }
  if (!otpMatches(user, otp)) {
    const attempts = user.otp_attempts + 1;
    await user.update({ otp_attempts: attempts }, { hooks: false });
    const left = MAX_OTP_ATTEMPTS - attempts;
    return left > 0
      ? [400, 'INVALID_OTP', `Incorrect code. ${left} attempt${left === 1 ? '' : 's'} left.`]
      : [429, 'OTP_LOCKED', 'Too many wrong attempts. Please request a new code.'];
  }
  return null;
}

async function issueOtp(user, purpose) {
  const otp = generateOTP();
  await user.update(
    { otp, otp_expires_at: new Date(Date.now() + OTP_TTL_MS), otp_purpose: purpose, otp_attempts: 0 },
    { hooks: false },
  );
  await sendOTPEmail(user.email, otp, purpose);
}

const clearOtp = { otp: null, otp_expires_at: null, otp_purpose: null, otp_attempts: 0 };

function sessionResponse(user) {
  return { token: issueSessionToken(user), user: user.toPublic() };
}

async function uniqueUsernameFrom(base) {
  const stem = (base || 'learner').toLowerCase().replace(/[^a-z0-9_.]/g, '').slice(0, 20) || 'learner';
  const candidate = stem.length >= 3 ? stem : `${stem}_learner`;
  if (!(await User.findOne({ where: ciEquals('username', candidate) }))) return candidate;
  for (let i = 0; i < 20; i++) {
    const c = `${candidate}${crypto.randomInt(100, 10000)}`;
    if (!(await User.findOne({ where: ciEquals('username', c) }))) return c;
  }
  return `${candidate}${Date.now().toString(36)}`;
}

// ── POST /auth/register ───────────────────────────────────────────────────────
// Step 1: submit email → receive OTP. Re-calling for a pending email resends.

router.post('/register', otpSendLimiter, asyncHandler(async (req, res) => {
  const email = normEmail(req.body.email);
  if (!EMAIL_RE.test(email)) return fail(res, 400, 'INVALID_INPUT', 'Please enter a valid email address');

  const existing = await User.findOne(byEmail(email));
  if (existing && existing.is_registered) {
    return fail(res, 409, 'EMAIL_IN_USE', 'This email is already registered. Try signing in instead.');
  }

  const user = existing || await User.create({ email }, { hooks: false });
  await issueOtp(user, 'register');

  return ok(res, { email }, 200, { message: 'Code sent. It expires in 10 minutes.' });
}));

// ── POST /auth/verify ─────────────────────────────────────────────────────────
// Step 2: OTP + username + password (+ optional full_name) → account + session

router.post('/verify', authLimiter, asyncHandler(async (req, res) => {
  const email = normEmail(req.body.email);
  const { otp, password } = req.body;
  const user_name = typeof req.body.user_name === 'string' ? req.body.user_name.trim() : '';
  const full_name = typeof req.body.full_name === 'string' ? req.body.full_name.trim().slice(0, 100) : null;

  if (!email || !otp || !user_name || !password) {
    return fail(res, 400, 'INVALID_INPUT', 'email, otp, user_name, and password are required');
  }
  if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > 128) {
    return fail(res, 400, 'INVALID_INPUT', `Password must be ${MIN_PASSWORD}–128 characters`);
  }
  if (!USERNAME_RE.test(user_name)) {
    return fail(res, 400, 'INVALID_INPUT', 'Username must be 3–30 characters: letters, numbers, _ or .');
  }

  const user = await User.findOne(byEmail(email, { is_registered: false }));
  if (!user) return fail(res, 404, 'NOT_FOUND', 'No pending registration for this email. Please start again.');

  const otpError = await checkOtp(user, otp, 'register');
  if (otpError) return fail(res, ...otpError);

  const taken = await User.findOne({ where: { [Op.and]: [ciEquals('username', user_name), { id: { [Op.ne]: user.id } }] } });
  if (taken) return fail(res, 409, 'USERNAME_TAKEN', 'That username is taken. Try another one.');

  await user.update({
    username: user_name,
    full_name: full_name || null,
    password_hash: await bcrypt.hash(password, 10),
    is_registered: true,
    ...clearOtp,
  }, { hooks: false });

  return ok(res, sessionResponse(user), 201, { message: 'Email verified. Registration complete.' });
}));

// ── POST /auth/login ──────────────────────────────────────────────────────────

router.post('/login', authLimiter, asyncHandler(async (req, res) => {
  const email = normEmail(req.body.email);
  const { password } = req.body;
  if (!email || !password) return fail(res, 400, 'INVALID_INPUT', 'Email and password are required');

  const user = await User.findOne(byEmail(email));

  if (user && !user.is_registered) {
    return fail(res, 403, 'EMAIL_NOT_VERIFIED', 'Please finish creating your account first — check your email for the code.');
  }
  if (user && !user.password_hash && user.google_id) {
    return fail(res, 400, 'USE_GOOGLE', 'This account uses Google sign-in. Continue with Google, or reset your password to add one.');
  }
  if (!user || !(await user.validatePassword(password))) {
    return fail(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password');
  }

  return ok(res, sessionResponse(user));
}));

// ── POST /auth/forgot ─────────────────────────────────────────────────────────
// Always 200 so the endpoint can't be used to discover which emails exist.

router.post('/forgot', otpSendLimiter, asyncHandler(async (req, res) => {
  const email = normEmail(req.body.email);
  if (!EMAIL_RE.test(email)) return fail(res, 400, 'INVALID_INPUT', 'Please enter a valid email address');

  const user = await User.findOne(byEmail(email, { is_registered: true }));
  if (user) await issueOtp(user, 'reset');

  return ok(res, { email }, 200, { message: 'If that email has an account, a reset code is on its way.' });
}));

// ── POST /auth/reset ──────────────────────────────────────────────────────────

router.post('/reset', authLimiter, asyncHandler(async (req, res) => {
  const email = normEmail(req.body.email);
  const { otp, password } = req.body;
  if (!email || !otp || !password) return fail(res, 400, 'INVALID_INPUT', 'email, otp, and password are required');
  if (typeof password !== 'string' || password.length < MIN_PASSWORD || password.length > 128) {
    return fail(res, 400, 'INVALID_INPUT', `Password must be ${MIN_PASSWORD}–128 characters`);
  }

  const user = await User.findOne(byEmail(email, { is_registered: true }));
  if (!user) return fail(res, 400, 'NO_OTP', 'No active code. Please request a new one.');

  const otpError = await checkOtp(user, otp, 'reset');
  if (otpError) return fail(res, ...otpError);

  await user.update({ password_hash: await bcrypt.hash(password, 10), ...clearOtp }, { hooks: false });
  return ok(res, sessionResponse(user), 200, { message: 'Password updated.' });
}));

// ── POST /auth/google ─────────────────────────────────────────────────────────
// Body: { credential } — a Google ID token from Google Identity Services.
// Verification lives in services/googleAuth.js (the integration point).

router.post('/google', authLimiter, asyncHandler(async (req, res) => {
  const { credential } = req.body;
  if (!credential || typeof credential !== 'string') {
    return fail(res, 400, 'INVALID_INPUT', 'credential is required');
  }

  const profile = await verifyGoogleIdToken(credential);
  const email = normEmail(profile.email);
  if (!profile.sub || !email) return fail(res, 401, 'GOOGLE_TOKEN_INVALID', 'Google sign-in failed. Please try again.');
  if (profile.email_verified === false) {
    return fail(res, 403, 'GOOGLE_EMAIL_UNVERIFIED', 'Your Google email address is not verified.');
  }

  let user = await User.findOne({ where: { google_id: profile.sub } })
    || await User.findOne(byEmail(email));

  if (user) {
    // Link Google to an existing account (or finish a pending email signup —
    // Google has already proven ownership of the address).
    await user.update({
      google_id: profile.sub,
      is_registered: true,
      username: user.username || await uniqueUsernameFrom(email.split('@')[0]),
      full_name: user.full_name || profile.name || null,
      avatar_url: profile.picture || user.avatar_url,
      ...(user.is_registered ? {} : clearOtp),
    }, { hooks: false });
  } else {
    user = await User.create({
      email,
      google_id: profile.sub,
      username: await uniqueUsernameFrom(email.split('@')[0]),
      full_name: profile.name || null,
      avatar_url: profile.picture || null,
      is_registered: true,
    }, { hooks: false });
  }

  return ok(res, sessionResponse(user));
}));

// ── GET /auth/me ──────────────────────────────────────────────────────────────
// Lets the client validate a stored token and refresh the cached user on load.

// POST /auth/unsubscribe { token } — one-click "turn off reminders" from an email.
// Public on purpose: the signed token is the proof, and it can only opt out.
router.post('/unsubscribe', authLimiter, asyncHandler(async (req, res) => {
  const { token } = req.body || {};
  let userId;
  try {
    if (typeof token !== 'string' || !token) throw new Error('missing');
    userId = verifyUnsubscribeToken(token);
  } catch {
    return fail(res, 400, 'INVALID_TOKEN', 'This unsubscribe link is invalid. You can turn reminders off from your profile.');
  }
  const user = await User.findByPk(userId);
  if (user) await user.update({ email_reminders: false }, { hooks: false });
  return ok(res, { unsubscribed: true });
}));

router.get('/me', authenticate, (req, res) => ok(res, { user: req.user.toPublic() }));

module.exports = router;
