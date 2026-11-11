export const plural = (n, word, many = `${word}s`) => `${n} ${n === 1 ? word : many}`

export function formatDate(iso, opts = { month: 'short', day: 'numeric', year: 'numeric' }) {
  if (!iso) return ''
  // Date-only strings are calendar dates: render them without a timezone shift.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, opts)
}

export const scoreTone = (score, max = 10) => {
  const pct = score / max
  return pct >= 0.8 ? 'good' : pct >= 0.5 ? 'ok' : 'low'
}

export const TONE_COLOR = { good: 'var(--success)', ok: 'var(--warning)', low: 'var(--danger)' }

export function praise(score) {
  return score >= 9 ? 'Excellent!' : score >= 7 ? 'Great work!' : score >= 5 ? 'Good effort!' : 'Keep practising!'
}
