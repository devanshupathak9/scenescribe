// Premium plan: prices, checkout, verification and Razorpay webhooks.
const express = require('express');
const { env } = require('../config/env');
const { User } = require('../models');
const { authenticate } = require('../middleware/auth');
const { asyncHandler, ok, fail } = require('../utils/http');
const { planOf, grantPro } = require('../services/entitlements');
const rzp = require('../services/razorpay');

const router = express.Router();

const BILLING_OFF = 'Payments are not switched on yet.';
const PROVIDER_DOWN = "We couldn't reach the payment provider. Nothing was charged — please try again.";
const GRACE_MS = 864e5; // a day of slack for webhook/charge timing

const untilFrom = (sub, plan) => (sub?.current_end
  ? new Date(sub.current_end * 1000 + GRACE_MS)
  : new Date(Date.now() + rzp.PLANS[plan]().days * 864e5));

// GET /billing/plans — public pricing for the pricing page
router.get('/plans', (req, res) => ok(res, {
  premium_enabled: env.PREMIUM_ENABLED,
  checkout_enabled: env.billingEnabled,
  currency: 'INR',
  free: { debates_per_week: env.FREE_DEBATES_PER_WEEK },
  plans: [
    { id: 'monthly', price: env.PRICE_MONTHLY_INR, period: 'month' },
    { id: 'yearly', price: env.PRICE_YEARLY_INR, period: 'year', per_month: Math.round(env.PRICE_YEARLY_INR / 12) },
  ],
}));

router.use(authenticate);

// GET /billing/me
router.get('/me', asyncHandler(async (req, res) => ok(res, planOf(req.user))));

// POST /billing/subscribe { plan: 'monthly' | 'yearly' } → subscription for Razorpay Checkout
router.post('/subscribe', asyncHandler(async (req, res) => {
  if (!env.billingEnabled) return fail(res, 503, 'BILLING_DISABLED', BILLING_OFF);
  const { plan } = req.body;
  if (!rzp.PLANS[plan]) return fail(res, 400, 'INVALID_INPUT', 'plan must be "monthly" or "yearly"');
  const user = req.user;
  if (user.pro_source === 'razorpay' && user.rzp_status === 'active' && planOf(user).pro) {
    return fail(res, 409, 'ALREADY_PRO', 'You already have an active Pro subscription.');
  }
  let sub;
  try {
    sub = await rzp.createSubscription(plan, user);
  } catch (err) {
    if (err instanceof rzp.BillingError) return fail(res, 502, 'BILLING_UNAVAILABLE', PROVIDER_DOWN);
    throw err;
  }
  await user.update({ rzp_subscription_id: sub.id, rzp_plan: plan, rzp_status: sub.status || 'created' }, { hooks: false });
  return ok(res, {
    subscription_id: sub.id,
    key_id: env.RAZORPAY_KEY_ID,
    plan,
    amount: rzp.PLANS[plan]().amount,
    prefill: { name: user.full_name || user.username, email: user.email },
  }, 201);
}));

// POST /billing/verify { razorpay_payment_id, razorpay_subscription_id, razorpay_signature }
// Unlocks Pro straight after checkout; webhooks keep it renewed afterwards.
router.post('/verify', asyncHandler(async (req, res) => {
  if (!env.billingEnabled) return fail(res, 503, 'BILLING_DISABLED', BILLING_OFF);
  const { razorpay_payment_id: paymentId, razorpay_subscription_id: subId, razorpay_signature: sig } = req.body;
  const user = req.user;
  // Check against the subscription WE created for this user, never the one the browser sends.
  if (!user.rzp_subscription_id || subId !== user.rzp_subscription_id
      || !paymentId || !rzp.verifyCheckout(paymentId, user.rzp_subscription_id, sig)) {
    return fail(res, 400, 'INVALID_SIGNATURE', "We couldn't confirm this payment. If you were charged, it will be applied automatically within a few minutes.");
  }
  let sub = null;
  try { sub = await rzp.fetchSubscription(user.rzp_subscription_id); } catch { /* fall back to plan length */ }
  await grantPro(user, untilFrom(sub, user.rzp_plan || 'monthly'), 'razorpay', { rzp_status: sub?.status || 'active' });
  return ok(res, planOf(user));
}));

// POST /billing/cancel — stops renewal; Pro stays until the paid period ends.
router.post('/cancel', asyncHandler(async (req, res) => {
  if (!env.billingEnabled) return fail(res, 503, 'BILLING_DISABLED', BILLING_OFF);
  const user = req.user;
  if (!user.rzp_subscription_id || user.rzp_status !== 'active') {
    return fail(res, 409, 'NO_SUBSCRIPTION', 'There is no active subscription to cancel.');
  }
  try {
    await rzp.cancelSubscription(user.rzp_subscription_id);
  } catch (err) {
    if (err instanceof rzp.BillingError) return fail(res, 502, 'BILLING_UNAVAILABLE', PROVIDER_DOWN);
    throw err;
  }
  await user.update({ rzp_status: 'cancelled' }, { hooks: false });
  return ok(res, planOf(user));
}));

// Mounted separately with express.raw() — see app.js. Razorpay retries on non-2xx.
const webhook = asyncHandler(async (req, res) => {
  const raw = Buffer.isBuffer(req.body) ? req.body : Buffer.from('');
  if (!rzp.verifyWebhook(raw, req.get('x-razorpay-signature'))) {
    return fail(res, 400, 'INVALID_SIGNATURE', 'Bad signature');
  }
  let event;
  try { event = JSON.parse(raw.toString('utf8')); } catch { return fail(res, 400, 'INVALID_INPUT', 'Bad JSON'); }

  const sub = event?.payload?.subscription?.entity;
  if (!sub?.id) return ok(res, { ignored: true });

  const user = (sub.notes?.user_id && await User.findByPk(sub.notes.user_id).catch(() => null))
    || await User.findOne({ where: { rzp_subscription_id: sub.id } });
  if (!user) return ok(res, { ignored: true });

  const plan = sub.notes?.plan && rzp.PLANS[sub.notes.plan] ? sub.notes.plan : (user.rzp_plan || 'monthly');
  switch (event.event) {
    case 'subscription.activated':
    case 'subscription.charged':
    case 'subscription.resumed':
      await grantPro(user, untilFrom(sub, plan), 'razorpay', { rzp_subscription_id: sub.id, rzp_plan: plan, rzp_status: 'active' });
      break;
    case 'subscription.cancelled':
    case 'subscription.halted':
    case 'subscription.completed':
    case 'subscription.paused':
      // Access runs out naturally at pro_until; just record that it won't renew.
      if (user.rzp_subscription_id === sub.id) await user.update({ rzp_status: sub.status || event.event.split('.')[1] }, { hooks: false });
      break;
    default:
      return ok(res, { ignored: true });
  }
  return ok(res, { received: true });
});

module.exports = { router, webhook };
