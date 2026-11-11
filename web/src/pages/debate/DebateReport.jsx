import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api } from '../../api.js'
import { formatDate } from '../../lib/format.js'
import { isTtsSupported, speak } from '../../lib/tts.js'
import { usePageTitle } from '../../lib/usePageTitle.js'
import { LoadingState, ErrorState, ScoreRing, EstimateNotice } from '../../components/ui.jsx'

const CATEGORIES = [
  ['grammar', 'Grammar & structure'],
  ['vocabulary', 'Vocabulary & word choice'],
  ['fluency', 'Fluency & pace'],
  ['pronunciation', 'Pronunciation & clarity'],
  ['confidence', 'Confidence & argument'],
]

const CEFR_TEXT = {
  A1: 'Beginner', A2: 'Elementary', B1: 'Intermediate', B2: 'Upper-intermediate', C1: 'Advanced', C2: 'Proficient',
}

const tone = (s) => (s >= 75 ? 'good' : s >= 50 ? 'ok' : 'low')

function CategoryBar({ label, score, comment }) {
  return (
    <div className="cat-row">
      <div className="cat-head">
        <span className="cat-label">{label}</span>
        <span className={`cat-score cat-score--${tone(score)}`}>{score}</span>
      </div>
      <div className="cat-track" role="progressbar" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`cat-fill cat-fill--${tone(score)}`} style={{ width: `${score}%` }} />
      </div>
      {comment && <p className="cat-comment">{comment}</p>}
    </div>
  )
}

function SpeakButton({ text }) {
  if (!isTtsSupported()) return null
  return (
    <button type="button" className="speak-btn" onClick={() => speak(text, { rate: 0.95 })} aria-label={`Listen: ${text}`}>🔊</button>
  )
}

function Stat({ label, value, hint }) {
  return (
    <div className="metric">
      <div className="metric-value">{value}</div>
      <div className="metric-label">{label}</div>
      {hint && <div className="metric-hint">{hint}</div>}
    </div>
  )
}

function paceHint(wpm) {
  if (!wpm) return null
  if (wpm < 90) return 'A bit slow — aim for 110–160'
  if (wpm > 175) return 'Quite fast — slow down slightly'
  return 'Natural conversational pace'
}

export default function DebateReport() {
  const { id } = useParams()
  const navigate = useNavigate()
  const [debate, setDebate] = useState(null)
  const [error, setError] = useState(null)
  const [busy, setBusy] = useState('')
  const [actionError, setActionError] = useState('')
  usePageTitle('Debate report')

  const load = useCallback(() => {
    setError(null)
    api.get(`/debate/${id}`).then(r => setDebate(r.data)).catch(setError)
  }, [id])
  useEffect(() => { load() }, [load])

  async function getReport() {
    setBusy('report'); setActionError('')
    try {
      const r = await api.post(`/debate/${id}/finish`, {}, { timeout: 120_000 })
      setDebate(r.data)
    } catch (err) { setActionError(err.message) } finally { setBusy('') }
  }

  async function rematch() {
    setBusy('rematch'); setActionError('')
    try {
      const r = await api.post('/debate', {
        topic: debate.topic, side: debate.ai_side, rounds: debate.rounds, level: debate.level,
      }, { timeout: 45_000 })
      navigate(`/debate/${r.data.id}/live`, { state: { debate: r.data } })
    } catch (err) { setActionError(err.message); setBusy('') }
  }

  if (error) {
    return (
      <div className="container page">
        <ErrorState title={error.status === 404 ? 'Debate not found' : "Couldn't load this debate"} message={error.message}
          onRetry={error.status === 404 ? undefined : load} action={<Link to="/debate" className="btn-secondary">← All debates</Link>} />
      </div>
    )
  }
  if (!debate) return <LoadingState label="Loading report…" />

  if (debate.status !== 'completed') {
    const spoke = debate.turns.some(t => t.speaker === 'user')
    return (
      <div className="container page">
        <div className="empty-state">
          <div className="empty-icon" aria-hidden="true">🎙️</div>
          <h3>This debate isn’t finished</h3>
          <p>“{debate.topic}”</p>
          {actionError && <div className="error-msg" role="alert">{actionError}</div>}
          <div className="empty-actions">
            {debate.status === 'in_progress' && <Link to={`/debate/${id}/live`} className="btn-primary btn-auto">Continue debate</Link>}
            {spoke && debate.status === 'in_progress' && (
              <button type="button" className="btn-secondary" onClick={getReport} disabled={!!busy}>
                {busy === 'report' ? 'Evaluating…' : 'End & get report'}
              </button>
            )}
            <Link to="/debate" className="btn-ghost">All debates</Link>
          </div>
        </div>
      </div>
    )
  }

  const r = debate.report
  const m = r.metrics || {}
  const userTurnIdx = []
  debate.turns.forEach((t, i) => { if (t.speaker === 'user') userTurnIdx.push(i) })

  return (
    <div className="container container--wide page report">
      <Link to="/debate" className="back-link">← All debates</Link>

      <header className="card report-hero">
        <div className="report-hero-score">
          <ScoreRing score={r.overall_score} max={100} size={112} stroke={9} />
          <div className="cefr-badge" title="Estimated CEFR level">
            <strong>{r.cefr_level}</strong><span>{CEFR_TEXT[r.cefr_level]}</span>
          </div>
        </div>
        <div className="report-hero-text">
          <div className="section-label">{formatDate(debate.completed_at || debate.created_at, { month: 'long', day: 'numeric', year: 'numeric' })} · You argued {debate.user_side.toUpperCase()}</div>
          <h1 className="report-title">“{debate.topic}”</h1>
          <p className="report-summary">{r.summary}</p>
          {r.ended_early && <p className="muted small">You ended this debate early, so the report covers the turns you completed.</p>}
        </div>
      </header>

      {r.source === 'estimate' && (
        <EstimateNotice>AI evaluation isn’t switched on yet, so this report is an automatic estimate from your transcript and speech statistics.</EstimateNotice>
      )}

      <div className="report-grid">
        <section className="card" aria-labelledby="scores-h">
          <h2 id="scores-h" className="section-label card-heading">Your scores</h2>
          {CATEGORIES.map(([k, label]) => r.scores?.[k] && <CategoryBar key={k} label={label} score={r.scores[k].score} comment={r.scores[k].comment} />)}
        </section>

        <section className="card" aria-labelledby="speech-h">
          <h2 id="speech-h" className="section-label card-heading">How you spoke</h2>
          <div className="metric-grid">
            <Stat label="Words spoken" value={m.total_words ?? '–'} />
            <Stat label="Words / minute" value={m.avg_wpm || '–'} hint={paceHint(m.avg_wpm)} />
            <Stat label="Filler words" value={m.filler_count ?? '–'} hint={m.filler_count > 3 ? 'um, uh, like…' : null} />
            <Stat label="Long pauses" value={m.long_pauses ?? '–'} />
            <Stat label="Clarity" value={m.avg_confidence != null ? `${Math.round(m.avg_confidence * 100)}%` : '–'} hint="How clearly the recogniser heard you" />
            <Stat label="Word variety" value={m.vocabulary_variety != null ? `${Math.round(m.vocabulary_variety * 100)}%` : '–'} />
          </div>
          {m.unclear_words?.length > 0 && (
            <div className="unclear">
              <div className="suggestions-sublabel">Words to practise saying</div>
              <div className="chip-row">
                {m.unclear_words.map(w => <span key={w} className="chip chip--static">{w} <SpeakButton text={w} /></span>)}
              </div>
            </div>
          )}
        </section>
      </div>

      <div className="report-grid">
        <section className="card" aria-labelledby="str-h">
          <h2 id="str-h" className="section-label card-heading">Strengths</h2>
          <ul className="feedback-list">{r.strengths?.map((s, i) => <li key={i} className="feedback-item feedback-item--good">{s}</li>)}</ul>
          {r.best_moment && (
            <div className="best-moment"><div className="suggestions-sublabel">Your best moment</div><p>{r.best_moment}</p></div>
          )}
        </section>
        <section className="card" aria-labelledby="imp-h">
          <h2 id="imp-h" className="section-label card-heading">Needs attention</h2>
          <ul className="feedback-list">{r.improvements?.map((s, i) => <li key={i} className="feedback-item feedback-item--issue">{s}</li>)}</ul>
        </section>
      </div>

      {r.mistakes?.length > 0 && (
        <section className="card section" aria-labelledby="mist-h">
          <h2 id="mist-h" className="section-label card-heading">Corrections</h2>
          <ul className="corrections">
            {r.mistakes.map((x, i) => (
              <li key={i} className="correction">
                <div className="correction-pair">
                  <span className="correction-from">{x.original}</span>
                  {x.correction && <><span className="correction-arrow" aria-label="should be">→</span>
                    <span className="correction-to">{x.correction}</span><SpeakButton text={x.correction} /></>}
                </div>
                <div className="correction-why"><span className="tag">{x.category}</span> {x.explanation}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <div className={`report-grid${r.vocabulary_upgrades?.length ? '' : ' report-grid--single'}`}>
        {r.vocabulary_upgrades?.length > 0 && (
          <section className="card" aria-labelledby="voc-h">
            <h2 id="voc-h" className="section-label card-heading">Vocabulary upgrades</h2>
            <ul className="upgrades">
              {r.vocabulary_upgrades.map((v, i) => (
                <li key={i}>
                  <div><span className="correction-from">{v.instead_of}</span> <span className="correction-arrow">→</span> <strong className="correction-to">{v.try}</strong></div>
                  {v.example && <div className="upgrade-example">“{v.example}” <SpeakButton text={v.example} /></div>}
                </li>
              ))}
            </ul>
          </section>
        )}
        <section className="card" aria-labelledby="phr-h">
          <h2 id="phr-h" className="section-label card-heading">Phrases to practise</h2>
          <ul className="phrases">{r.useful_phrases?.map((p, i) => <li key={i}><span>{p}</span><SpeakButton text={p} /></li>)}</ul>
          {r.next_steps?.length > 0 && (
            <>
              <div className="suggestions-sublabel">Next time</div>
              <ol className="next-steps">{r.next_steps.map((s, i) => <li key={i}>{s}</li>)}</ol>
            </>
          )}
        </section>
      </div>

      <details className="card section transcript-details">
        <summary className="section-label">Full transcript</summary>
        <ol className="transcript-list transcript-list--full">
          {debate.turns.map((t, i) => {
            const um = t.speaker === 'user' ? m.turns?.[userTurnIdx.indexOf(i)] : null
            return (
              <li key={i} className={`bubble bubble--${t.speaker}`}>
                <div className="bubble-who">{t.speaker === 'user' ? 'You' : 'AI'} · Round {t.round}{um ? ` · ${um.words} words${um.wpm ? ` · ${um.wpm} wpm` : ''}` : ''}</div>
                <div className="bubble-text">{t.text || <em className="muted">(no speech captured)</em>}</div>
              </li>
            )
          })}
        </ol>
      </details>

      {actionError && <div className="error-msg" role="alert">{actionError}</div>}
      <div className="action-row report-actions">
        <button type="button" className="btn-primary btn-auto" onClick={rematch} disabled={!!busy}>
          {busy === 'rematch' ? <><span className="spinner" /> Setting up…</> : `Rematch — argue ${debate.ai_side.toUpperCase()}`}
        </button>
        <Link to="/debate" className="btn-secondary">New debate</Link>
      </div>
    </div>
  )
}
