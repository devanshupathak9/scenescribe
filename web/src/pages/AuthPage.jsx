import { useState, useRef, useEffect } from 'react'
import { authService } from '../auth/authService.js'
import GoogleSignInButton from '../components/GoogleSignInButton.jsx'
import { LogoMark, Wordmark } from '../components/Logo.jsx'

const OTP_LENGTH = 6
const MIN_PASSWORD = 8
const RESEND_SECONDS = 30
const USERNAME_RE = /^[a-zA-Z0-9_.]{3,30}$/
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

function pwStrength(pw) {
  let s = 0
  if (pw.length >= MIN_PASSWORD) s++
  if (/[A-Z]/.test(pw)) s++
  if (/[0-9]/.test(pw)) s++
  if (/[^a-zA-Z0-9]/.test(pw)) s++
  return s
}
const STRENGTH_LABEL = ['Too short', 'Weak', 'Fair', 'Good', 'Strong']

// ── Icons ────────────────────────────────────────────────────────────
function IconEnvelope({ size = 14, color = 'white' }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="4" width="20" height="16" rx="2" stroke={color} strokeWidth="1.8" />
      <path d="M2 7l10 7 10-7" stroke={color} strokeWidth="1.8" strokeLinejoin="round" />
    </svg>
  )
}
const IconPlay = () => (
  <svg width="14" height="14" viewBox="0 0 12 12" fill="none" stroke="#e8ff47" strokeWidth="1.6" strokeLinejoin="round" aria-hidden="true">
    <path d="M2.5 1.5l8 4.5-8 4.5V1.5z" />
  </svg>
)
const IconMic = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#e8ff47" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
    <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z" /><path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="22" />
  </svg>
)
const IconTrend = () => (
  <svg width="15" height="15" viewBox="0 0 12 12" fill="none" stroke="#e8ff47" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="1,9 4,5 7,7 11,2" /><polyline points="8,2 11,2 11,5" />
  </svg>
)
const IconCheck = () => (
  <svg width="38" height="38" viewBox="0 0 30 30" fill="none" stroke="#4ade80" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="5,15 12,22 25,8" />
  </svg>
)

// ── Left Panel ───────────────────────────────────────────────────────
function LeftPanel() {
  return (
    <div className="ap-left">
      <div className="ap-orb ap-orb-1" />
      <div className="ap-orb ap-orb-2" />
      <div className="ap-orb ap-orb-3" />
      <div className="ap-left-inner">
        <div className="ap-brand">
          <LogoMark size={40} />
          <span className="ap-brand-name"><Wordmark /></span>
        </div>

        <div className="ap-badge">✓&nbsp;&nbsp;AI English practice</div>

        <h2 className="ap-headline">Watch.<br />Describe.<br /><span className="ap-headline-acc">Get fluent.</span></h2>

        <p className="ap-body-copy">
          Real video scenes and live debates instead of textbook drills. Describe what you see, argue your point out loud,
          and get specific feedback on how you said it — a few minutes a day.
        </p>

        <div className="ap-features">
          {[
            { icon: <IconPlay />, label: 'Fresh scenes every day', sub: 'Short real-world clips with vocabulary and grammar help' },
            { icon: <IconMic />, label: 'Debate with AI', sub: 'Speak for 40 seconds a turn, then get a full speaking report' },
            { icon: <IconTrend />, label: 'Track your progress', sub: 'Scores, streaks and a history of every answer' },
          ].map(({ icon, label, sub }) => (
            <div key={label} className="ap-feature">
              <div className="ap-feat-icon">{icon}</div>
              <div className="ap-feat-text"><strong>{label}</strong><span>{sub}</span></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

// ── OTP input ────────────────────────────────────────────────────────
function OtpInput({ value, onChange, disabled }) {
  const refs = useRef([])
  useEffect(() => { refs.current[0]?.focus() }, [])

  function set(index, raw) {
    const digits = raw.replace(/\D/g, '')
    if (digits.length > 1) {
      // Paste or SMS autofill of the whole code
      const next = Array(OTP_LENGTH).fill('')
      for (let i = 0; i < OTP_LENGTH; i++) next[i] = digits[i] || ''
      onChange(next)
      refs.current[Math.min(digits.length, OTP_LENGTH - 1)]?.focus()
      return
    }
    const next = [...value]
    next[index] = digits
    onChange(next)
    if (digits && index < OTP_LENGTH - 1) refs.current[index + 1]?.focus()
  }

  function onKey(index, e) {
    if (e.key === 'Backspace' && !value[index] && index > 0) refs.current[index - 1]?.focus()
    if (e.key === 'ArrowLeft' && index > 0) refs.current[index - 1]?.focus()
    if (e.key === 'ArrowRight' && index < OTP_LENGTH - 1) refs.current[index + 1]?.focus()
  }

  return (
    <div className="ap-otp-row" role="group" aria-label="6-digit verification code">
      {value.map((digit, i) => (
        <input
          key={i}
          ref={el => (refs.current[i] = el)}
          className={`ap-otp-box ${digit ? 'ap-otp-filled' : ''}`}
          type="text"
          inputMode="numeric"
          autoComplete={i === 0 ? 'one-time-code' : 'off'}
          maxLength={OTP_LENGTH}
          value={digit}
          disabled={disabled}
          aria-label={`Digit ${i + 1}`}
          onChange={e => set(i, e.target.value)}
          onKeyDown={e => onKey(i, e)}
          onFocus={e => e.target.select()}
        />
      ))}
    </div>
  )
}

function Field({ id, label, hint, children }) {
  return (
    <div className="ap-field">
      <label className="ap-label" htmlFor={id}>{label}</label>
      {children}
      {hint && <div className="ap-hint">{hint}</div>}
    </div>
  )
}

function useCooldown() {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (left <= 0) return
    const t = setTimeout(() => setLeft(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  return [left, () => setLeft(RESEND_SECONDS)]
}

const emptyOtp = () => Array(OTP_LENGTH).fill('')

// ── Main Component ───────────────────────────────────────────────────
// mode: 'register' | 'signin' | 'forgot'
export default function AuthPage({ onLogin, initialTab = 'register' }) {
  const [mode, setMode] = useState(initialTab === 'signin' ? 'signin' : 'register')
  const [step, setStep] = useState(1)

  const [reg, setRegForm] = useState({ fullName: '', email: '', username: '', password: '' })
  const [login, setLoginForm] = useState({ email: '', password: '' })
  const [reset, setResetForm] = useState({ email: '', password: '' })
  const [otp, setOtp] = useState(emptyOtp)

  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [loading, setLoading] = useState(false)
  const [cooldown, startCooldown] = useCooldown()
  const [pendingSession, setPendingSession] = useState(null)

  function switchMode(m) {
    setMode(m)
    setStep(1)
    setError('')
    setNotice('')
    setOtp(emptyOtp())
    if (m === 'forgot') setResetForm(f => ({ ...f, email: f.email || login.email }))
  }

  const setReg = (k, v) => { setRegForm(f => ({ ...f, [k]: v })); setError('') }
  const setLogin = (k, v) => { setLoginForm(f => ({ ...f, [k]: v })); setError('') }
  const setReset = (k, v) => { setResetForm(f => ({ ...f, [k]: v })); setError('') }

  async function run(fn) {
    setLoading(true)
    setError('')
    try { await fn() } catch (err) { setError(err.message) } finally { setLoading(false) }
  }

  // Register step 1 — validate everything up front, then send the code
  function handleRegister(e) {
    e.preventDefault()
    if (!reg.fullName.trim()) return setError('Please enter your name')
    if (!EMAIL_RE.test(reg.email.trim())) return setError('Please enter a valid email address')
    if (!USERNAME_RE.test(reg.username.trim())) return setError('Username: 3–30 letters, numbers, _ or .')
    if (reg.password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters`)
    run(async () => {
      await authService.requestSignupCode(reg.email)
      setOtp(emptyOtp())
      setStep(2)
      startCooldown()
    })
  }

  function handleVerify(e) {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < OTP_LENGTH) return setError('Please enter the full 6-digit code')
    run(async () => {
      const session = await authService.verifySignup({
        email: reg.email, otp: code, username: reg.username, password: reg.password, fullName: reg.fullName,
      })
      setPendingSession(session)
      setStep(3)
    })
  }

  function handleResendSignup() {
    if (cooldown > 0) return
    run(async () => {
      await authService.requestSignupCode(reg.email)
      setOtp(emptyOtp())
      startCooldown()
      setNotice('A new code is on its way.')
    })
  }

  function handleSignIn(e) {
    e.preventDefault()
    if (!login.email.trim()) return setError('Email is required')
    if (!login.password) return setError('Password is required')
    run(async () => {
      const { user, token } = await authService.login(login.email, login.password)
      onLogin(user, token)
    })
  }

  function handleForgot(e) {
    e.preventDefault()
    if (!EMAIL_RE.test(reset.email.trim())) return setError('Please enter a valid email address')
    run(async () => {
      await authService.requestPasswordReset(reset.email)
      setOtp(emptyOtp())
      setStep(2)
      startCooldown()
    })
  }

  function handleReset(e) {
    e.preventDefault()
    const code = otp.join('')
    if (code.length < OTP_LENGTH) return setError('Please enter the full 6-digit code')
    if (reset.password.length < MIN_PASSWORD) return setError(`Password must be at least ${MIN_PASSWORD} characters`)
    run(async () => {
      const { user, token } = await authService.resetPassword({ email: reset.email, otp: code, password: reset.password })
      onLogin(user, token)
    })
  }

  function handleResendReset() {
    if (cooldown > 0) return
    run(async () => {
      await authService.requestPasswordReset(reset.email)
      setOtp(emptyOtp())
      startCooldown()
      setNotice('A new code is on its way.')
    })
  }

  const google = (
    <GoogleSignInButton
      text={mode === 'register' ? 'signup_with' : 'signin_with'}
      onSuccess={({ user, token }) => onLogin(user, token)}
      onError={setError}
    />
  )

  const strength = pwStrength(reg.password)
  const segColors = { 1: '#f87171', 2: '#f59e0b', 3: '#f59e0b', 4: '#4ade80' }
  const otpReady = otp.every(d => d !== '')
  const showTabs = (mode === 'signin') || (mode === 'register' && step === 1)

  const resendButton = (onClick) => (
    <button type="button" className="ap-link-btn" onClick={onClick} disabled={cooldown > 0 || loading}>
      {cooldown > 0 ? `Resend in ${cooldown}s` : 'Resend code'}
    </button>
  )

  return (
    <div className="ap-page">
      <LeftPanel />

      <main className="ap-right">
        <div className="ap-right-inner">

          {mode === 'register' && (
            <div className="ap-stepper" aria-label={`Step ${step} of 3`}>
              <div className={`ap-dot ${step >= 2 ? 'ap-dot-done' : 'ap-dot-active'}`} />
              <div className={`ap-line ${step >= 2 ? 'ap-line-done' : ''}`} />
              <div className={`ap-dot ${step === 2 ? 'ap-dot-active' : step > 2 ? 'ap-dot-done' : ''}`} />
              <div className={`ap-line ${step >= 3 ? 'ap-line-done' : ''}`} />
              <div className={`ap-dot ${step === 3 ? 'ap-dot-active' : ''}`} />
            </div>
          )}

          {showTabs && (
            <div className="ap-tabs" role="tablist">
              <button type="button" role="tab" aria-selected={mode === 'register'}
                className={`ap-tab ${mode === 'register' ? 'ap-tab-active' : ''}`} onClick={() => switchMode('register')}>
                Register
              </button>
              <button type="button" role="tab" aria-selected={mode === 'signin'}
                className={`ap-tab ${mode === 'signin' ? 'ap-tab-active' : ''}`} onClick={() => switchMode('signin')}>
                Sign in
              </button>
            </div>
          )}

          {error && <div className="ap-error" role="alert">{error}</div>}
          {notice && !error && <div className="ap-notice" role="status">{notice}</div>}

          {/* ── REGISTER 1: details ── */}
          {mode === 'register' && step === 1 && (
            <form onSubmit={handleRegister} noValidate>
              <div className="ap-form-head">
                <h1 className="ap-form-title">Create your account</h1>
                <p className="ap-form-sub">Free. Start your first scene in under 2 minutes.</p>
              </div>

              {google}

              <Field id="reg-name" label="FULL NAME">
                <input id="reg-name" className="ap-input" type="text" autoComplete="name" placeholder="Arjun Kumar"
                  value={reg.fullName} onChange={e => setReg('fullName', e.target.value)} maxLength={100} />
              </Field>
              <Field id="reg-email" label="EMAIL ADDRESS">
                <input id="reg-email" className="ap-input" type="email" autoComplete="email" inputMode="email" placeholder="arjun@email.com"
                  value={reg.email} onChange={e => setReg('email', e.target.value)} />
              </Field>
              <Field id="reg-username" label="USERNAME" hint="3–30 characters: letters, numbers, _ or .">
                <input id="reg-username" className="ap-input" type="text" autoComplete="username" autoCapitalize="none" spellCheck="false"
                  placeholder="arjun_speaks" value={reg.username} onChange={e => setReg('username', e.target.value)} maxLength={30} />
              </Field>
              <Field id="reg-password" label="PASSWORD">
                <input id="reg-password" className="ap-input" type="password" autoComplete="new-password"
                  placeholder={`Min. ${MIN_PASSWORD} characters`} value={reg.password} onChange={e => setReg('password', e.target.value)} />
                <div className="ap-strength" aria-hidden="true">
                  {[0, 1, 2, 3].map(i => (
                    <div key={i} className="ap-seg" style={{ background: i < strength ? (segColors[strength] || '#252535') : '#252535' }} />
                  ))}
                </div>
                {reg.password && <div className="ap-hint" aria-live="polite">{STRENGTH_LABEL[strength]}</div>}
              </Field>

              <button type="submit" className="ap-cta" disabled={loading}>
                {loading ? <><span className="spinner" /> Sending code…</> : 'Create account'}
              </button>

              <p className="ap-footer-note">
                Already have an account?{' '}
                <button type="button" className="ap-link-btn" onClick={() => switchMode('signin')}>Sign in</button>
              </p>
            </form>
          )}

          {/* ── REGISTER 2: verify ── */}
          {mode === 'register' && step === 2 && (
            <form onSubmit={handleVerify} noValidate>
              <div className="ap-form-head">
                <h1 className="ap-form-title">Check your inbox</h1>
                <p className="ap-form-sub">Enter the 6-digit code we just sent you. It expires in 10 minutes.</p>
              </div>
              <div className="ap-envelope-block">
                <div className="ap-envelope-icon"><IconEnvelope size={32} color="#e8ff47" /></div>
                <p className="ap-sent-to">We sent a code to<br /><strong>{reg.email.trim()}</strong></p>
              </div>
              <OtpInput value={otp} onChange={v => { setOtp(v); setError('') }} disabled={loading} />
              <button type="submit" className={`ap-cta ${!otpReady ? 'ap-cta-dim' : ''}`} disabled={loading || !otpReady}>
                {loading ? <><span className="spinner" /> Verifying…</> : 'Verify email'}
              </button>
              <div className="ap-otp-footer">
                <p className="ap-footer-note">Didn&apos;t get it? Check spam, or {resendButton(handleResendSignup)}</p>
                <p className="ap-footer-note">
                  <button type="button" className="ap-link-btn ap-link-muted" onClick={() => { setStep(1); setError(''); setNotice('') }}>
                    ← Change email address
                  </button>
                </p>
              </div>
            </form>
          )}

          {/* ── REGISTER 3: success ── */}
          {mode === 'register' && step === 3 && (
            <div className="ap-success">
              <div className="ap-check-circle"><IconCheck /></div>
              <h1 className="ap-verified-title">You&apos;re verified!</h1>
              <p className="ap-verified-body">
                Welcome to SceneScribe{reg.fullName ? `, ${reg.fullName.trim().split(' ')[0]}` : ''}. Your first scene is ready.
              </p>
              <button type="button" className="ap-cta" autoFocus
                onClick={() => pendingSession && onLogin(pendingSession.user, pendingSession.token)}>
                Go to dashboard →
              </button>
            </div>
          )}

          {/* ── SIGN IN ── */}
          {mode === 'signin' && (
            <form onSubmit={handleSignIn} noValidate>
              <div className="ap-form-head">
                <h1 className="ap-form-title">Welcome back</h1>
                <p className="ap-form-sub">Your streak is waiting. Sign in and keep the momentum going.</p>
              </div>

              {google}

              <Field id="login-email" label="EMAIL ADDRESS">
                <input id="login-email" className="ap-input" type="email" autoComplete="email" inputMode="email" placeholder="arjun@email.com"
                  value={login.email} onChange={e => setLogin('email', e.target.value)} />
              </Field>
              <Field id="login-password" label="PASSWORD">
                <input id="login-password" className="ap-input" type="password" autoComplete="current-password" placeholder="Your password"
                  value={login.password} onChange={e => setLogin('password', e.target.value)} />
                <div className="ap-forgot-wrap">
                  <button type="button" className="ap-forgot" onClick={() => switchMode('forgot')}>Forgot password?</button>
                </div>
              </Field>

              <button type="submit" className="ap-cta" disabled={loading}>
                {loading ? <><span className="spinner" /> Signing in…</> : 'Sign in'}
              </button>

              <p className="ap-footer-note">
                No account yet?{' '}
                <button type="button" className="ap-link-btn" onClick={() => switchMode('register')}>Create one free</button>
              </p>
            </form>
          )}

          {/* ── FORGOT 1: email ── */}
          {mode === 'forgot' && step === 1 && (
            <form onSubmit={handleForgot} noValidate>
              <div className="ap-form-head">
                <h1 className="ap-form-title">Reset your password</h1>
                <p className="ap-form-sub">Enter your account email and we&apos;ll send you a 6-digit code.</p>
              </div>
              <Field id="reset-email" label="EMAIL ADDRESS">
                <input id="reset-email" className="ap-input" type="email" autoComplete="email" inputMode="email" autoFocus
                  placeholder="arjun@email.com" value={reset.email} onChange={e => setReset('email', e.target.value)} />
              </Field>
              <button type="submit" className="ap-cta" disabled={loading}>
                {loading ? <><span className="spinner" /> Sending…</> : 'Send reset code'}
              </button>
              <p className="ap-footer-note">
                <button type="button" className="ap-link-btn ap-link-muted" onClick={() => switchMode('signin')}>← Back to sign in</button>
              </p>
            </form>
          )}

          {/* ── FORGOT 2: code + new password ── */}
          {mode === 'forgot' && step === 2 && (
            <form onSubmit={handleReset} noValidate>
              <div className="ap-form-head">
                <h1 className="ap-form-title">Choose a new password</h1>
                <p className="ap-form-sub">If <strong>{reset.email.trim()}</strong> has an account, we sent it a code.</p>
              </div>
              <OtpInput value={otp} onChange={v => { setOtp(v); setError('') }} disabled={loading} />
              <Field id="reset-password" label="NEW PASSWORD">
                <input id="reset-password" className="ap-input" type="password" autoComplete="new-password"
                  placeholder={`Min. ${MIN_PASSWORD} characters`} value={reset.password} onChange={e => setReset('password', e.target.value)} />
              </Field>
              <button type="submit" className="ap-cta" disabled={loading || !otpReady}>
                {loading ? <><span className="spinner" /> Saving…</> : 'Update password & sign in'}
              </button>
              <div className="ap-otp-footer">
                <p className="ap-footer-note">Didn&apos;t get it? {resendButton(handleResendReset)}</p>
                <p className="ap-footer-note">
                  <button type="button" className="ap-link-btn ap-link-muted" onClick={() => switchMode('signin')}>← Back to sign in</button>
                </p>
              </div>
            </form>
          )}

        </div>
      </main>
    </div>
  )
}
