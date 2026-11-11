import { useState, useEffect, useMemo } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../../api.js'
import { isSpeechSupported } from '../../lib/speech.js'
import { isTtsSupported, warmUpVoices } from '../../lib/tts.js'
import { formatDate } from '../../lib/format.js'
import { usePageTitle } from '../../lib/usePageTitle.js'
import { LoadingState, ErrorState } from '../../components/ui.jsx'

const LEVELS = [
  { id: 'beginner', label: 'Beginner', sub: 'Simple words, slower AI' },
  { id: 'intermediate', label: 'Intermediate', sub: 'Everyday debate' },
  { id: 'advanced', label: 'Advanced', sub: 'Rich vocabulary, tougher AI' },
]
const LEVEL_RANK = { beginner: 0, intermediate: 1, advanced: 2 }

function HowItWorks({ turnSeconds, transitionSeconds }) {
  const steps = [
    ['Pick a motion and a side', 'Choose a topic or write your own. The AI argues the opposite side.'],
    [`Speak for ${turnSeconds} seconds`, `Take turns. You get ${transitionSeconds} seconds to prepare before each turn.`],
    ['Get your speaking report', 'Grammar, vocabulary, fluency, pronunciation and argument — with corrections.'],
  ]
  return (
    <ol className="how-steps">
      {steps.map(([t, s], i) => (
        <li key={t} className="how-step">
          <span className="how-num" aria-hidden="true">{i + 1}</span>
          <div><strong>{t}</strong><span>{s}</span></div>
        </li>
      ))}
    </ol>
  )
}

function PastDebates() {
  const [state, setState] = useState({ status: 'loading', rows: [] })
  useEffect(() => {
    api.get('/debate').then(r => setState({ status: 'ready', rows: r.data })).catch(() => setState({ status: 'error', rows: [] }))
  }, [])
  if (state.status !== 'ready' || !state.rows.length) return null
  return (
    <section className="section" aria-labelledby="past-heading">
      <h2 id="past-heading" className="section-label section-heading">Your debates</h2>
      <div className="history-list">
        {state.rows.map(d => (
          <Link key={d.id} to={`/debate/${d.id}`} className="history-item">
            <div className="history-score-badge history-score-badge--wide">{d.overall_score ?? '–'}</div>
            <div className="history-info">
              <div className="history-scene">{d.topic}</div>
              <div className="history-date">{formatDate(d.created_at)} · You argued {d.user_side.toUpperCase()}{d.cefr_level ? ` · ${d.cefr_level}` : ''}</div>
            </div>
            <div className="history-arrow" aria-hidden="true">→</div>
          </Link>
        ))}
      </div>
    </section>
  )
}

export default function DebateHub() {
  usePageTitle('Debate with AI')
  const navigate = useNavigate()
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [level, setLevel] = useState('intermediate')
  const [category, setCategory] = useState('All')
  const [topic, setTopic] = useState('')
  const [custom, setCustom] = useState(false)
  const [side, setSide] = useState('for')
  const [rounds, setRounds] = useState(3)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState('')

  const load = () => {
    setLoadError('')
    api.get('/debate/topics').then(r => setData(r.data)).catch(e => setLoadError(e.message))
  }
  useEffect(() => { load(); warmUpVoices() }, [])

  const topics = useMemo(() => (data?.topics || []).filter(t =>
    LEVEL_RANK[t.level] <= LEVEL_RANK[level] && (category === 'All' || t.category === category)), [data, level, category])
  const categories = useMemo(() => ['All', ...new Set((data?.topics || []).map(t => t.category))], [data])

  function surprise() {
    const pool = (data?.topics || []).filter(t => LEVEL_RANK[t.level] <= LEVEL_RANK[level])
    const pick = pool[Math.floor(Math.random() * pool.length)]
    if (pick) { setCustom(false); setTopic(pick.motion); setSide(Math.random() < 0.5 ? 'for' : 'against') }
  }

  async function start() {
    const motion = topic.trim()
    if (motion.length < 8) return setError('Pick a topic, or write one of at least 8 characters.')
    setStarting(true)
    setError('')
    try {
      const res = await api.post('/debate', { topic: motion, side, rounds, level }, { timeout: 45_000 })
      navigate(`/debate/${res.data.id}/live`, { state: { debate: res.data } })
    } catch (err) {
      setError(err.message)
      setStarting(false)
    }
  }

  if (loadError) return <div className="container page"><ErrorState title="Couldn't load debate topics" message={loadError} onRetry={load} /></div>
  if (!data) return <LoadingState label="Loading debate topics…" />

  const { turn_seconds: turnSec, transition_seconds: transSec, min_rounds: minR, max_rounds: maxR } = data.config
  const minutes = Math.ceil((rounds * 2 * (turnSec + transSec)) / 60)
  const speech = isSpeechSupported()

  return (
    <div className="container page">
      <div className="page-header">
        <div>
          <div className="section-label">Speaking practice</div>
          <h1 className="page-title">Debate with AI</h1>
        </div>
      </div>

      <HowItWorks turnSeconds={turnSec} transitionSeconds={transSec} />

      {!speech && (
        <div className="estimate-notice" role="note">
          <strong>Voice isn’t supported in this browser.</strong> You can still debate by typing, but fluency and pronunciation
          can’t be assessed. For the full experience use Chrome or Edge on desktop or Android, or Safari on iPhone.
        </div>
      )}
      {speech && !isTtsSupported() && (
        <div className="estimate-notice" role="note">Your browser can’t read the AI’s turns aloud, so they’ll appear as text.</div>
      )}

      <section className="card section debate-setup" aria-labelledby="setup-heading">
        <h2 id="setup-heading" className="sr-only">Set up your debate</h2>

        <fieldset className="setup-block">
          <legend className="field-label">1 · Your level</legend>
          <div className="choice-row choice-row--3">
            {LEVELS.map(l => (
              <button key={l.id} type="button" className={`choice${level === l.id ? ' choice--on' : ''}`} aria-pressed={level === l.id}
                onClick={() => setLevel(l.id)}>
                <strong>{l.label}</strong><span>{l.sub}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="setup-block">
          <legend className="field-label setup-legend-row">
            <span>2 · Motion</span>
            <button type="button" className="btn-ghost btn-sm" onClick={surprise}>🎲 Surprise me</button>
          </legend>

          <div className="chip-row" role="group" aria-label="Topic category">
            {categories.map(c => (
              <button key={c} type="button" className={`chip${category === c && !custom ? ' chip--on' : ''}`} aria-pressed={category === c && !custom}
                onClick={() => { setCategory(c); setCustom(false) }}>{c}</button>
            ))}
            <button type="button" className={`chip${custom ? ' chip--on' : ''}`} aria-pressed={custom}
              onClick={() => { setCustom(true); setTopic('') }}>✏️ My own</button>
          </div>

          {custom ? (
            <div className="form-field">
              <label className="sr-only" htmlFor="custom-topic">Your motion</label>
              <input id="custom-topic" className="field-input" maxLength={200} autoFocus value={topic}
                onChange={e => { setTopic(e.target.value); setError('') }}
                placeholder="e.g. Students should learn to cook at school" />
              <div className="field-hint">Write it as a statement someone can agree or disagree with.</div>
            </div>
          ) : (
            <div className="topic-grid">
              {topics.map(t => (
                <button key={t.id} type="button" className={`topic-card${topic === t.motion ? ' topic-card--on' : ''}`}
                  aria-pressed={topic === t.motion} onClick={() => { setTopic(t.motion); setError('') }}>
                  <span className="topic-cat">{t.category}</span>
                  <span className="topic-motion">{t.motion}</span>
                </button>
              ))}
              {!topics.length && <p className="muted">No topics in this category at this level — try another.</p>}
            </div>
          )}
        </fieldset>

        <fieldset className="setup-block">
          <legend className="field-label">3 · Your side</legend>
          <div className="choice-row">
            {[['for', 'For', 'You agree with the motion — and you speak first'], ['against', 'Against', 'You disagree — the AI opens']].map(([id, label, sub]) => (
              <button key={id} type="button" className={`choice choice--side-${id}${side === id ? ' choice--on' : ''}`} aria-pressed={side === id}
                onClick={() => setSide(id)}>
                <strong>{label}</strong><span>{sub}</span>
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="setup-block">
          <legend className="field-label">4 · Rounds</legend>
          <div className="segmented" role="radiogroup" aria-label="Number of rounds">
            {Array.from({ length: maxR - minR + 1 }, (_, i) => minR + i).map(n => (
              <button key={n} type="button" role="radio" aria-checked={rounds === n}
                className={`segmented-item${rounds === n ? ' segmented-item--on' : ''}`} onClick={() => setRounds(n)}>{n}</button>
            ))}
          </div>
          <div className="field-hint">About {minutes} minutes · {rounds} turns each · {turnSec}s per turn</div>
        </fieldset>

        {topic && !custom && <div className="selected-motion"><span className="section-label">Motion</span>“{topic}”</div>}
        {error && <div className="error-msg" role="alert">{error}</div>}

        <button type="button" className="btn-primary btn-full btn-lg" onClick={start} disabled={starting || topic.trim().length < 8}>
          {starting ? <><span className="spinner" /> Setting up the debate…</> : 'Start debate'}
        </button>
        <p className="fine-print">
          {speech ? 'You’ll be asked for microphone access. Speech is transcribed by your browser.' : 'You’ll type your turns.'}
        </p>
      </section>

      <PastDebates />
    </div>
  )
}
