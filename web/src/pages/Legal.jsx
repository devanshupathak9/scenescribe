import { Link } from 'react-router-dom'
import { LogoMark, Wordmark } from '../components/Logo.jsx'

// Public /privacy and /terms pages. Google's OAuth consent screen links here,
// so both must load without signing in.

const CONTACT = 'scenescribe.app@gmail.com'
const UPDATED = '13 November 2026'

function LegalShell({ title, children }) {
  return (
    <div className="legal-page">
      <header className="legal-head">
        <Link to="/" className="legal-brand" aria-label="SceneScribe home">
          <LogoMark size={32} /> <Wordmark />
        </Link>
        <nav className="legal-nav">
          <Link to="/privacy">Privacy</Link>
          <Link to="/terms">Terms</Link>
        </nav>
      </header>
      <article className="legal-body">
        <h1>{title}</h1>
        <p className="muted">Last updated {UPDATED}</p>
        {children}
        <h2>Contact</h2>
        <p>Questions or requests: <a href={`mailto:${CONTACT}`}>{CONTACT}</a>.</p>
      </article>
    </div>
  )
}

export function Privacy() {
  return (
    <LegalShell title="Privacy Policy">
      <p>SceneScribe (“we”) is an English-practice app at scenescribe.in. This policy explains what we collect, why, and the choices you have.</p>

      <h2>What we collect</h2>
      <ul>
        <li><strong>Account details</strong> — your email, name and username. If you sign up with a password we store only a secure hash of it.</li>
        <li><strong>Google sign-in</strong> — if you choose “Continue with Google”, Google shares your name, email address, profile photo and a Google account ID. We don’t get your Google password or access to anything else in your Google account.</li>
        <li><strong>Your practice</strong> — the descriptions you write or speak, debate turns, and the scores and feedback we generate. When you use the microphone, your browser’s speech service turns speech into text; we receive the text and simple timing data (for example pauses), not the audio.</li>
        <li><strong>Payments</strong> — if you buy a plan, Razorpay processes the payment. We receive a payment and subscription reference, not your card or UPI details.</li>
        <li><strong>Technical data</strong> — basic server logs (such as IP address and timestamps) used to keep the service secure and working.</li>
      </ul>

      <h2>How we use it</h2>
      <ul>
        <li>To run your account, keep you signed in and send sign-up and password-reset codes by email.</li>
        <li>To give feedback on your English. Your answers are sent to OpenAI’s API to generate scores and suggestions.</li>
        <li>To show your progress, streaks and history, and to improve the app.</li>
      </ul>
      <p>We don’t sell your data or use it for advertising.</p>

      <h2>Who processes it</h2>
      <p>We use these providers to run SceneScribe: Vercel (website hosting), Railway (app server), Supabase (database), OpenAI (feedback generation), Google (sign-in and email delivery) and Razorpay (payments). They handle data only to provide their service to us.</p>

      <h2>How long we keep it</h2>
      <p>We keep your account and practice history while your account is active. If you ask us to delete your account, we delete your data within 30 days, except where the law requires us to keep payment records.</p>

      <h2>Your choices</h2>
      <ul>
        <li>Ask for a copy of your data, a correction, or deletion of your account by emailing us.</li>
        <li>Remove SceneScribe’s access to your Google account at any time from your Google Account settings (Security → Third-party connections).</li>
      </ul>

      <h2>Children</h2>
      <p>SceneScribe isn’t intended for children under 13. If you believe a child has created an account, contact us and we will delete it.</p>

      <h2>Changes</h2>
      <p>If we change this policy we’ll update the date above, and tell you in the app for significant changes.</p>
    </LegalShell>
  )
}

export function Terms() {
  return (
    <LegalShell title="Terms of Service">
      <p>By creating an account or using SceneScribe you agree to these terms.</p>

      <h2>Your account</h2>
      <ul>
        <li>Give accurate details and keep your login secure. You’re responsible for activity on your account.</li>
        <li>You must be at least 13 years old to use SceneScribe.</li>
      </ul>

      <h2>Using SceneScribe</h2>
      <ul>
        <li>Use the app for learning English. Don’t misuse it — no attempts to break, overload or scrape the service, and no abusive or unlawful content.</li>
        <li>Feedback and scores are generated automatically, partly by AI. They can be wrong and are for practice only — not an official assessment or certification.</li>
        <li>Video scenes are embedded from YouTube and remain owned by their creators.</li>
      </ul>

      <h2>Your content</h2>
      <p>You own what you write and say. You allow us to store and process it to give you feedback and run the service, as described in our <Link to="/privacy">Privacy Policy</Link>.</p>

      <h2>Paid plans</h2>
      <p>Paid plans are billed through Razorpay at the price shown before you pay, and renew until you cancel. Cancelling stops future renewals; access continues until the end of the period you paid for.</p>

      <h2>Availability and changes</h2>
      <p>We work to keep SceneScribe running but can’t promise it will always be available or error-free. We may change features or these terms; continued use after a change means you accept it.</p>

      <h2>Ending your account</h2>
      <p>You can stop using SceneScribe and ask us to delete your account at any time. We may suspend accounts that break these terms.</p>

      <h2>Liability</h2>
      <p>SceneScribe is provided “as is”. To the extent the law allows, we aren’t liable for indirect losses arising from your use of the app.</p>

      <h2>Governing law</h2>
      <p>These terms are governed by the laws of India.</p>
    </LegalShell>
  )
}
