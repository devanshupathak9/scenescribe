import { useState } from 'react'
import { getYouTubeEmbedUrl, getYouTubeThumb } from '../lib/youtube.js'
import { scoreTone, TONE_COLOR, praise } from '../lib/format.js'

export function Spinner({ label }) {
  return <span className="spinner" role={label ? 'status' : undefined} aria-label={label} />
}

export function LoadingState({ label = 'Loading…' }) {
  return (
    <div className="loading-state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" /> {label}
    </div>
  )
}

export function ErrorState({ title = 'Something went wrong', message, onRetry, action }) {
  return (
    <div className="empty-state" role="alert">
      <div className="empty-icon" aria-hidden="true">⚠️</div>
      <h3>{title}</h3>
      {message && <p>{message}</p>}
      <div className="empty-actions">
        {onRetry && <button type="button" className="btn-secondary" onClick={onRetry}>Try again</button>}
        {action}
      </div>
    </div>
  )
}

export function EmptyState({ icon = '🎬', title, children, action }) {
  return (
    <div className="empty-state">
      <div className="empty-icon" aria-hidden="true">{icon}</div>
      <h3>{title}</h3>
      {children && <p>{children}</p>}
      {action && <div className="empty-actions">{action}</div>}
    </div>
  )
}

// Score ring for /10 (scenes) or /100 (debates)
export function ScoreRing({ score, max = 10, size = 72, stroke = 6 }) {
  const r = (size - stroke) / 2
  const c = size / 2
  const circumference = 2 * Math.PI * r
  const pct = Math.max(0, Math.min(1, (score ?? 0) / max))
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={`Score ${score ?? '–'} out of ${max}`}>
      <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
      <circle cx={c} cy={c} r={r} fill="none" stroke="var(--yellow)" strokeWidth={stroke}
        strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={circumference * (1 - pct)}
        transform={`rotate(-90 ${c} ${c})`} style={{ transition: 'stroke-dashoffset 0.6s ease' }} />
      <text x={c} y={c + 1} textAnchor="middle" dominantBaseline="middle"
        fill="var(--text)" fontSize={size * 0.28} fontFamily="Syne" fontWeight="700">
        {score ?? '–'}
      </text>
    </svg>
  )
}

export function ScoreCell({ value, label, max = 10 }) {
  return (
    <div className="breakdown-cell">
      <div className="breakdown-value" style={{ color: value == null ? 'var(--muted)' : TONE_COLOR[scoreTone(value, max)] }}>
        {value ?? '–'}
      </div>
      <div className="breakdown-label">{label}</div>
    </div>
  )
}

export function SentenceBlock({ label, text, accent = 'var(--purple)' }) {
  if (!text) return null
  return (
    <div className="sentence-block" style={{ borderLeftColor: accent }}>
      <div className="sentence-label">{label}</div>
      <div className="sentence-text">{text}</div>
    </div>
  )
}

export function FeedbackList({ title, items, kind }) {
  if (!items?.length) return null
  return (
    <div className="feedback-group">
      <div className="suggestions-sublabel">{title}</div>
      <ul className="feedback-list">
        {items.map((item, i) => <li key={i} className={`feedback-item feedback-item--${kind}`}>{item}</li>)}
      </ul>
    </div>
  )
}

export function EstimateNotice({ children }) {
  return (
    <div className="estimate-notice" role="note">
      <strong>Estimated score.</strong>{' '}
      {children || 'AI feedback isn’t switched on yet, so this is an automatic estimate from your text.'}
    </div>
  )
}

// Click-to-load YouTube: no third-party iframe (or its weight) until the learner wants it.
export function VideoEmbed({ url, title }) {
  const [playing, setPlaying] = useState(false)
  const [thumbOk, setThumbOk] = useState(true)
  const embed = getYouTubeEmbedUrl(url)
  const thumb = getYouTubeThumb(url)

  if (!embed) return <div className="video-block"><div className="video-placeholder">Video unavailable</div></div>

  return (
    <div className="video-block">
      {playing ? (
        <iframe src={`${embed}&autoplay=1`} title={title || 'Scene video'} loading="lazy"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen />
      ) : (
        <button type="button" className="video-poster" onClick={() => setPlaying(true)} aria-label={`Play video: ${title || 'scene'}`}>
          {thumb && thumbOk && <img src={thumb} alt="" loading="lazy" onError={() => setThumbOk(false)} />}
          <span className="video-play" aria-hidden="true">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z" /></svg>
          </span>
        </button>
      )}
    </div>
  )
}

export function ScoreSummary({ submission }) {
  const { score, breakdown, input_type, response_text } = submission
  return (
    <div className="card result-card">
      <div className={`input-badge ${input_type === 'microphone' ? 'input-badge--mic' : 'input-badge--kb'}`}>
        {input_type === 'microphone' ? 'via microphone' : 'via keyboard'}
      </div>
      {response_text && <div className="user-response-box">{response_text}</div>}
      <div className="score-row">
        <ScoreRing score={score} />
        <div className="score-details">
          <div className="score-label">Overall score</div>
          <div className="score-display">
            <span className="score-big">{score}</span><span className="score-denom">/ 10</span>
          </div>
          <div className="score-praise" style={{ color: TONE_COLOR[scoreTone(score)] }}>{praise(score)}</div>
        </div>
      </div>
      {breakdown && (
        <div className="breakdown-grid">
          <ScoreCell value={breakdown.grammar} label="Grammar" />
          <ScoreCell value={breakdown.vocabulary} label="Vocabulary" />
          <ScoreCell value={breakdown.clarity} label="Clarity" />
        </div>
      )}
    </div>
  )
}

export function FeedbackCard({ submission }) {
  const fb = submission.feedback || {}
  return (
    <div className="card">
      <div className="section-label card-heading">Feedback</div>
      {fb.source === 'estimate' && <EstimateNotice />}
      <SentenceBlock label="Your sentence, corrected" text={submission.improved_ai_response} accent="var(--purple)" />
      <SentenceBlock label="Ideal description" text={submission.ideal_sentence} accent="var(--yellow)" />
      <FeedbackList title="Issues" items={fb.issues} kind="issue" />
      <FeedbackList title="Suggestions" items={fb.suggestions} kind="suggestion" />
    </div>
  )
}
