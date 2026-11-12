// Thin Razorpay Subscriptions client (REST + signature checks). No SDK: four
// calls don't justify the dependency, and fetch is easy to mock in tests.
const crypto = require('crypto');
const { env } = require('../config/env');

const API = 'https://api.razorpay.com/v1';

class BillingError extends Error {
  constructor(message, cause) { super(message); this.name = 'BillingError'; this.cause = cause; }
}

async function call(method, path, body) {
  const auth = Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
  let res;
  try {
    res = await fetch(`${API}${path}`, {
      method,
      headers: { Authorization: `Basic ${auth}`, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
    });
  } catch (err) {
    throw new BillingError('Payment provider unreachable', err);
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new BillingError(data?.error?.description || `Razorpay ${res.status}`);
  return data;
}

const PLANS = {
  monthly: () => ({ id: env.RAZORPAY_PLAN_MONTHLY, amount: env.PRICE_MONTHLY_INR, total_count: 60, days: 31 }),
  yearly: () => ({ id: env.RAZORPAY_PLAN_YEARLY, amount: env.PRICE_YEARLY_INR, total_count: 10, days: 366 }),
};

function createSubscription(plan, user) {
  const p = PLANS[plan]();
  return call('POST', '/subscriptions', {
    plan_id: p.id,
    total_count: p.total_count,
    customer_notify: 1,
    notes: { user_id: user.id, plan },
  });
}

const fetchSubscription = (id) => call('GET', `/subscriptions/${encodeURIComponent(id)}`);
const cancelSubscription = (id) => call('POST', `/subscriptions/${encodeURIComponent(id)}/cancel`, { cancel_at_cycle_end: 1 });

function safeEqualHex(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

// Checkout success: HMAC(payment_id + "|" + OUR stored subscription_id, key secret).
function verifyCheckout(paymentId, subscriptionId, signature) {
  const expected = crypto.createHmac('sha256', env.RAZORPAY_KEY_SECRET).update(`${paymentId}|${subscriptionId}`).digest('hex');
  return safeEqualHex(expected, signature);
}

// Webhooks: HMAC of the RAW body with the webhook secret.
function verifyWebhook(rawBody, signature) {
  if (!env.RAZORPAY_WEBHOOK_SECRET) return false;
  const expected = crypto.createHmac('sha256', env.RAZORPAY_WEBHOOK_SECRET).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

module.exports = { PLANS, createSubscription, fetchSubscription, cancelSubscription, verifyCheckout, verifyWebhook, BillingError };
