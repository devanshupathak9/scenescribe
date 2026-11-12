import { useState, useEffect, useCallback } from 'react'
import { useParams, Link, useNavigate } from 'react-router-dom'
import { api } from '../../api.js'
import { formatDate } from '../../lib/format.js'
import { isTtsSupported, speak } from '../../lib/tts.js'
import { usePageTitle } from '../../lib/usePageTitle.js'
import { LoadingState, ErrorState, ScoreRing, EstimateNotice } from '../../components/ui.jsx'

const CATEGORIES = [
  ['grammar', 'Grammar'],
  ['sentence_structure', 'Sentence construction'],
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

const AREA_LABEL = {
  grammar: 'Grammar', sentence_structure: 'Sentences', vocabulary: 'Vocabulary', fluency: 'Fluency',
  hesitation: 'Hesitation', pronunciation: 'Pronunciation', argument: 'Argument',
}
const WIN_TEXT = { learner: 'You won', ai: 'AI won', draw: 'Draw' }

function Verdict({ v, userSide, aiSide }) {
  const youLead = v.winner === 'learner'
  return (
    <section className={`card verdict verdict--${v.winner}`} aria-labelledby="verdict-h">
      <div className="verdict-top">
        <div>
          <h2 id="verdict-h" className="section-label card-heading">Who made the stronger case</h2>
          <div className="verdict-headline">
            {v.winner === 'learner' ? 'You won this debate 🏆' : v.winner === 'ai' ? 'The AI edged it this time' : 'It was a draw'}
          </div>
          <p className="verdict-reason">{v.reason}</p>
        </div>
        <div className="scoreboard" aria-label={`Argument points: you ${v.learner_points}, AI ${v.ai_points}, out of 10`}>
          <div className={`sb-side${youLead ? ' sb-side--lead' : ''}`}>
            <span className="sb-name">You · {userSide}</span>
            <span className="sb-pts">{v.learner_points}</span>
          </div>
          <span className="sb-dash" aria-hidden="true">–</span>
          <div className={`sb-side${v.winner === 'ai' ? ' sb-side--lead' : ''}`}>
            <span className="sb-name">AI · {aiSide}</span>
            <span className="sb-pts">{v.ai_points}</span>
          </div>
          <span className="sb-note">argument points / 10</span>
        </div>
      </div>

      {v.rounds?.length > 0 && (
        <ol className="round-list">
          {v.rounds.map(r => (
            <li key={r.round} className="round-row">
              <span className={`round-chip round-chip--${r.winner}`}>R{r.round} · {WIN_TEXT[r.winner]}</span>
              <div className="round-points">
                {r.learner_point && <div><span className="round-who">You</span>{r.learner_point}</div>}
                {r.ai_point && <div><span className="round-who">AI</span>{r.ai_point}</div>}
                {r.why && <div className="round-why">{r.why}</div>}
              </div>
            </li>
          ))}
        </ol>
      )}

      {(v.strongest_point || v.missed_counter) && (
        <div className="verdict-notes">
          {v.strongest_point && <div className="verdict-note verdict-note--good"><strong>Your strongest point</strong>{v.strongest_point}</div>}
          {v.missed_counter && <div className="verdict-note"><strong>Point you left unanswered</strong>{v.missed_counter}</div>}
        </div>
      )}
      {v.source === 'estimate' && <p className="muted small verdict-est">Estimated from the reasons, examples and rebuttals in each turn.</p>}
    </section>
  )
}

function FocusAreas({ items }) {
  return (
    <section className="card section" aria-labelledby="focus-h">
      <h2 id="focus-h" className="section-label card-heading">Where to improve your spoken English</h2>
      <ol className="focus-list">
        {items.map((f, i) => (
          <li key={i} className="focus-item">
            <span className="focus-num" aria-hidden="true">{i + 1}</span>
            <div className="focus-body">
              <div className="focus-title"><span className="tag">{AREA_LABEL[f.area] || f.area}</span> {f.issue}</div>
              {f.example && <div className="focus-line"><span className="focus-k">You said</span><span className="correction-from">{f.example}</span></div>}
              {f.fix && <div className="focus-line"><span className="focus-k">Try</span><span className="correction-to">{f.fix}</span> <SpeakButton text={f.fix} /></div>}
              {f.drill && <div className="focus-drill">🎯 {f.drill}</div>}
            </div>
          </li>
        ))}
      </ol>
    </section>
  )
}

// Highlights the repeated words inside an example snippet.
function MarkRepeats({ text }) {
  const w = text.split(' ')
  return w.map((x, i) => {
    const rep = (i > 0 && w[i - 1] === x) || (i + 1 < w.length && w[i + 1] === x) ||
      (i >= 2 && w[i - 2] === x) || (i + 2 < w.length && w[i + 2] === x)
    return <span key={i} className={rep ? 'rep' : undefined}>{x}{i < w.length - 1 ? ' ' : ''}</span>
  })
}

function Hesitation({ h }) {
  const s = h.smoothness
  const label = s == null ? 'Too little speech to measure' : s >= 80 ? 'Smooth' : s >= 60 ? 'A few stumbles' : 'Frequent stumbles'
  return (
    <div className="hes">
      <div className="hes-head">
        <span className="suggestions-sublabel">Stuttering & hesitation</span>
        {s != null && <span className={`cat-score cat-score--${tone(s)}`}>{s}</span>}
      </div>
      {s != null && (
        <div className="cat-track" role="progressbar" aria-valuenow={s} aria-valuemin={0} aria-valuemax={100} aria-label="Smoothness">
          <div className={`cat-fill cat-fill--${tone(s)}`} style={{ width: `${s}%` }} />
        </div>
      )}
      <div className="hes-label">{label} · {h.per_100_words} per 100 words</div>
      <div className="hes-counts">
        <span><strong>{h.repetitions}</strong> repeated words</span>
        <span><strong>{h.restarts}</strong> restarts</span>
        <span><strong>{h.fillers}</strong> fillers</span>
        {h.long_pauses != null && <span><strong>{h.long_pauses}</strong> long pauses</span>}
      </div>
      {h.examples?.length > 0 && (
        <ul className="hes-examples">
          {h.examples.slice(0, 4).map((e, i) => <li key={i}>“…<MarkRepeats text={e.text} />…”</li>)}
        </ul>
      )}
      <p className="muted small">Speech recognition hides some hesitations, so real counts may be a little higher. When you get stuck, pause silently instead of repeating.</p>
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

      {r.verdict && <Verdict v={r.verdict} userSide={debate.user_side.toUpperCase()} aiSide={debate.ai_side.toUpperCase()} />}

      {r.focus_areas?.length > 0 && <FocusAreas items={r.focus_areas} />}

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
          {m.hesitation && <Hesitation h={m.hesitation} />}
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
