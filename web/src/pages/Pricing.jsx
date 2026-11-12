import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { formatDate } from '../lib/format.js'
import { openCheckout } from '../lib/razorpay.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { LoadingState, ErrorState } from '../components/ui.jsx'

const ROWS = [
  ['Daily scenes with AI feedback', true, true],
  ['Debates with the full report', (n) => `${n} per week`, 'Unlimited'],
  ['Verdict: who argued better', true, true],
  ['Hesitation & sentence feedback', true, true],
  ['Full progress history', true, true],
  ['New Pro features (interview mode, native-language tips)', false, true],
]

const cell = (v, n) => (typeof v === 'function' ? v(n) : v === true ? '✓' : v === false ? '—' : v)

export default function Pricing({ user, onUserUpdate }) {
  usePageTitle('Pro')
  const [plans, setPlans] = useState(null)
  const [error, setError] = useState('')
  const [period, setPeriod] = useState('yearly')
  const [busy, setBusy] = useState('')
  const [msg, setMsg] = useState({ kind: '', text: '' })
  const plan = user?.plan || {}

  const load = () => { setError(''); api.get('/billing/plans').then(r => setPlans(r.data)).catch(e => setError(e.message)) }
  useEffect(load, [])

  async function subscribe() {
    setBusy('subscribe'); setMsg({ kind: '', text: '' })
    try {
      const sub = (await api.post('/billing/subscribe', { plan: period })).data
      const paid = await openCheckout(sub)
      setBusy('verify')
      await api.post('/billing/verify', paid)
      await onUserUpdate()
      setMsg({ kind: 'ok', text: 'Welcome to Pro! Everything is unlocked.' })
    } catch (e) {
      if (e.code !== 'DISMISSED') setMsg({ kind: 'err', text: e.message })
    } finally { setBusy('') }
  }

  async function cancel() {
    setBusy('cancel'); setMsg({ kind: '', text: '' })
    try {
      await api.post('/billing/cancel')
      await onUserUpdate()
      setMsg({ kind: 'ok', text: 'Renewal cancelled. Pro stays on until your paid period ends.' })
    } catch (e) { setMsg({ kind: 'err', text: e.message }) } finally { setBusy('') }
  }

  if (error) return <div className="container page"><ErrorState title="Couldn't load plans" message={error} onRetry={load} /></div>
  if (!plans) return <LoadingState label="Loading plans…" />

  const monthly = plans.plans.find(p => p.id === 'monthly')
  const yearly = plans.plans.find(p => p.id === 'yearly')
  const chosen = period === 'yearly' ? yearly : monthly
  const saving = Math.round((1 - yearly.price / (monthly.price * 12)) * 100)
  const isPaidPro = plan.pro && plan.premium_enabled

  return (
    <div className="container page pricing">
      <header className="pricing-hero">
        <div className="section-label">SceneScribe Pro</div>
        <h1 className="page-title">Speak more. Argue better. No limits.</h1>
        <p className="pricing-sub">Daily scenes are free forever. Pro unlocks unlimited debates and every new speaking feature.</p>
      </header>

      {!plans.premium_enabled && (
        <div className="beta-banner" role="status">
          <strong>Founding beta:</strong> everything is unlocked for free while we launch. Early learners will get a founding-member price when Pro opens.
        </div>
      )}

      {isPaidPro && (
        <section className="card pro-status">
          <div>
            <div className="pro-status-title">You're on Pro ✓</div>
            <div className="muted">
              {plan.source === 'staff' ? 'Included with your admin account' : plan.source === 'admin' ? 'Granted by SceneScribe' : plan.plan ? `${plan.plan === 'yearly' ? 'Yearly' : 'Monthly'} plan` : 'Pro'}
              {plan.pro_until && <> · {plan.renews ? 'renews' : 'ends'} {formatDate(plan.pro_until, { month: 'long', day: 'numeric', year: 'numeric' })}</>}
            </div>
          </div>
          {plan.renews && <button type="button" className="btn-ghost" onClick={cancel} disabled={!!busy}>{busy === 'cancel' ? 'Cancelling…' : 'Cancel renewal'}</button>}
        </section>
      )}

      <div className="plan-grid">
        <section className="card plan-card">
          <div className="plan-name">Free</div>
          <div className="plan-price">₹0</div>
          <div className="plan-per">forever</div>
          <ul className="plan-points">
            <li>Every daily scene with feedback</li>
            <li>{plans.free.debates_per_week} debate a week</li>
            <li>Streaks and your skill profile</li>
          </ul>
          <Link to="/" className="btn-secondary btn-full">Keep practising</Link>
        </section>

        <section className="card plan-card plan-card--pro">
          <div className="plan-top">
            <div className="plan-name">Pro</div>
            <div className="seg" role="tablist" aria-label="Billing period">
              <button type="button" role="tab" aria-selected={period === 'monthly'} className={period === 'monthly' ? 'seg-on' : ''} onClick={() => setPeriod('monthly')}>Monthly</button>
              <button type="button" role="tab" aria-selected={period === 'yearly'} className={period === 'yearly' ? 'seg-on' : ''} onClick={() => setPeriod('yearly')}>Yearly <span className="save-tag">−{saving}%</span></button>
            </div>
          </div>
          <div className="plan-price">₹{chosen.price.toLocaleString('en-IN')}</div>
          <div className="plan-per">{period === 'yearly' ? `per year · ₹${yearly.per_month}/month` : 'per month'}</div>
          <ul className="plan-points">
            <li>Unlimited debates with the full report</li>
            <li>Everything in Free</li>
            <li>Every new Pro feature as it ships</li>
            <li>Cancel anytime, UPI Autopay or card</li>
          </ul>
          {isPaidPro ? (
            <button type="button" className="btn-primary btn-full" disabled>You're on Pro</button>
          ) : plans.checkout_enabled ? (
            <button type="button" className="btn-primary btn-full" onClick={subscribe} disabled={!!busy}>
              {busy ? <><span className="spinner" /> {busy === 'verify' ? 'Confirming…' : 'Opening checkout…'}</> : `Get Pro ${period === 'yearly' ? 'yearly' : 'monthly'}`}
            </button>
          ) : (
            <button type="button" className="btn-primary btn-full" disabled>{plans.premium_enabled ? 'Payments coming soon' : 'Unlocked during beta'}</button>
          )}
          {msg.text && <div className={msg.kind === 'ok' ? 'success-msg' : 'error-msg'} role={msg.kind === 'ok' ? 'status' : 'alert'}>{msg.text}</div>}
        </section>
      </div>

      <section className="card compare">
        <h2 className="section-title">Compare plans</h2>
        <div className="compare-table" role="table">
          <div className="compare-row compare-row--head" role="row"><span role="columnheader">Feature</span><span role="columnheader">Free</span><span role="columnheader">Pro</span></div>
          {ROWS.map(([label, free, pro]) => (
            <div key={label} className="compare-row" role="row">
              <span role="cell">{label}</span>
              <span role="cell" className={free === false ? 'muted' : ''}>{cell(free, plans.free.debates_per_week)}</span>
              <span role="cell" className="compare-pro">{cell(pro)}</span>
            </div>
          ))}
        </div>
      </section>
      <p className="muted small pricing-fine">Prices in INR, including taxes where applicable. Payments are processed by Razorpay.</p>
    </div>
  )
}
