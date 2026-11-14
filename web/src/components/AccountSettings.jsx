import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { api } from '../api.js'

// Profile › Settings: daily reminder email toggle + permanent account deletion.

function ReminderToggle({ user, onUserUpdate }) {
  const [on, setOn] = useState(user?.email_reminders !== false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  async function toggle() {
    const next = !on
    setOn(next); setSaving(true); setError('')
    try {
      await api.patch('/profile/settings', { email_reminders: next })
      onUserUpdate?.()
    } catch (e) {
      setOn(!next); setError(e.message)
    } finally { setSaving(false) }
  }

  return (
    <div className="setting-row">
      <div>
        <div className="setting-title" id="reminder-label">Streak reminder emails</div>
        <div className="muted small">One email in the evening, only on days your streak is about to break.</div>
        {error && <div className="error-msg" role="alert">{error}</div>}
      </div>
      <button type="button" role="switch" aria-checked={on} aria-labelledby="reminder-label"
        className={`switch${on ? ' switch--on' : ''}`} onClick={toggle} disabled={saving}>
        <span className="switch-knob" />
      </button>
    </div>
  )
}

function DeleteAccount({ user, onAccountDeleted }) {
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const needsPassword = user?.has_password !== false

  if (user?.is_admin) {
    return <p className="muted small">Admin accounts can’t be deleted from the app.</p>
  }

  async function submit(e) {
    e.preventDefault()
    if (confirm !== 'DELETE') return setError('Type DELETE in capitals to confirm.')
    if (needsPassword && !password) return setError('Enter your password.')
    setBusy(true); setError('')
    try {
      await api.post('/profile/delete-account', { confirm, ...(needsPassword ? { password } : {}) })
      onAccountDeleted?.()
      navigate('/', { replace: true })
    } catch (err) {
      setError(err.message); setBusy(false)
    }
  }

  if (!open) {
    return (
      <div className="setting-row">
        <div>
          <div className="setting-title">Delete account</div>
          <div className="muted small">Permanently removes your account, streak, scenes and debates.</div>
        </div>
        <button type="button" className="btn-danger-outline" onClick={() => setOpen(true)}>Delete account</button>
      </div>
    )
  }

  return (
    <form className="delete-account" onSubmit={submit} noValidate>
      <div className="setting-title">Delete your account?</div>
      <p className="small">This can’t be undone. Your streak, scene answers, debates and reports are deleted for good.</p>
      {error && <div className="error-msg" role="alert">{error}</div>}
      <div className="form-field">
        <label className="field-label" htmlFor="del-confirm">Type DELETE to confirm</label>
        <input id="del-confirm" className="field-input" autoComplete="off" autoCapitalize="characters"
          value={confirm} onChange={e => { setConfirm(e.target.value); setError('') }} />
      </div>
      {needsPassword && (
        <div className="form-field">
          <label className="field-label" htmlFor="del-password">Your password</label>
          <input id="del-password" type="password" className="field-input" autoComplete="current-password"
            value={password} onChange={e => { setPassword(e.target.value); setError('') }} />
        </div>
      )}
      <div className="action-row action-row--end">
        <button type="button" className="btn-ghost" onClick={() => { setOpen(false); setConfirm(''); setPassword(''); setError('') }}>Cancel</button>
        <button type="submit" className="btn-danger" disabled={busy || confirm !== 'DELETE'}>
          {busy ? <><span className="spinner" /> Deleting…</> : 'Delete permanently'}
        </button>
      </div>
    </form>
  )
}

export default function AccountSettings({ user, onUserUpdate, onAccountDeleted }) {
  return (
    <section className="card account-settings" aria-labelledby="settings-heading">
      <h2 id="settings-heading" className="section-title">Settings</h2>
      <ReminderToggle user={user} onUserUpdate={onUserUpdate} />
      <div className="danger-zone">
        <DeleteAccount user={user} onAccountDeleted={onAccountDeleted} />
      </div>
    </section>
  )
}
