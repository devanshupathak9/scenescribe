import { useEffect, useRef } from 'react'
import { Link } from 'react-router-dom'
import { formatDate } from '../lib/format.js'

// Shown when the API answers 402 PRO_REQUIRED.
export default function UpgradeSheet({ details, onClose }) {
  const ref = useRef(null)
  useEffect(() => {
    ref.current?.focus()
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  return (
    <div className="sheet-backdrop" onClick={onClose}>
      <div className="sheet" role="dialog" aria-modal="true" aria-labelledby="upg-title" tabIndex={-1} ref={ref} onClick={e => e.stopPropagation()}>
        <div className="sheet-badge">PRO</div>
        <h2 id="upg-title" className="sheet-title">You've used this week's free debate</h2>
        <p className="sheet-sub">
          Free includes {details?.limit ?? 1} debate a week
          {details?.resets_at ? <> — your next one unlocks <strong>{formatDate(details.resets_at, { weekday: 'long', month: 'short', day: 'numeric' })}</strong></> : null}.
          Pro removes the limit.
        </p>
        <ul className="sheet-list">
          <li>Unlimited debates with the full report</li>
          <li>Verdict, hesitation and sentence feedback every time</li>
          <li>New Pro features as they land, at no extra cost</li>
        </ul>
        <div className="sheet-actions">
          <Link to="/pricing" className="btn-primary btn-auto">See Pro plans →</Link>
          <button type="button" className="btn-ghost" onClick={onClose}>Not now</button>
        </div>
        <p className="muted small sheet-note">Today's daily scene stays free.</p>
      </div>
    </div>
  )
}
