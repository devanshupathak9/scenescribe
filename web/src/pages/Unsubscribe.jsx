import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { LogoMark, Wordmark } from '../components/Logo.jsx'

// Public landing page for the "Turn off reminders" link in streak emails.
export default function Unsubscribe() {
  const [params] = useSearchParams()
  const token = params.get('t')
  const [state, setState] = useState(token ? 'working' : 'error')
  const [message, setMessage] = useState(token ? '' : 'This link is missing its code.')

  useEffect(() => {
    if (!token) return
    api.post('/auth/unsubscribe', { token })
      .then(() => setState('done'))
      .catch(e => { setState('error'); setMessage(e.message) })
  }, [token])

  return (
    <div className="legal-page unsub-page">
      <header className="legal-head">
        <Link to="/" className="legal-brand" aria-label="SceneScribe home"><LogoMark size={32} /> <Wordmark /></Link>
      </header>
      <div className="card unsub-card" role="status" aria-live="polite">
        {state === 'working' && <p><span className="spinner" /> Turning off reminders…</p>}
        {state === 'done' && <>
          <h1>Reminders turned off</h1>
          <p className="muted">You won’t get streak reminder emails any more. You can turn them back on any time in your Profile.</p>
          <Link to="/" className="btn-primary btn-auto">Go to SceneScribe</Link>
        </>}
        {state === 'error' && <>
          <h1>Couldn’t update your settings</h1>
          <p className="muted">{message} You can also turn reminders off from your Profile.</p>
          <Link to="/profile" className="btn-primary btn-auto">Open Profile</Link>
        </>}
      </div>
    </div>
  )
}
