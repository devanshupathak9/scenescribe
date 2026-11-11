import { useState, useEffect, useRef, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { isSpeechSupported, createSpeechSession } from '../lib/speech.js'
import { plural } from '../lib/format.js'
import {
  VideoEmbed, ScoreSummary, FeedbackCard, SentenceBlock,
} from '../components/ui.jsx'

const MIN_CHARS = 10
const MAX_CHARS = 2000
const DEFAULT_INPUT = { text: '', inputType: 'keyboard', submitting: false, submitError: '', isRecording: false }

function DifficultyBadge({ level }) {
  if (!level) return null
  return <span className={`difficulty-badge difficulty-badge--${level}`}>{level}</span>
}

// Vocabulary / grammar / notes shown before the learner writes.
function LearningAids({ video }) {
  const vocab = video.vocabularies || []
  const grammar = video.grammars || []
  const hasAny = vocab.length || grammar.length || video.additional_notes
  const [open, setOpen] = useState(video.difficulty === 'beginner')
  if (!hasAny) return null

  return (
    <div className="card aids-card">
      <button type="button" className="aids-toggle" aria-expanded={open} onClick={() => setOpen(o => !o)}>
        <span>
          <span className="section-label">Before you write</span>
          <span className="aids-summary">
            {[vocab.length && plural(vocab.length, 'key word'), grammar.length && 'grammar focus', video.additional_notes && 'tips']
              .filter(Boolean).join(' · ')}
          </span>
        </span>
        <span className={`chevron${open ? ' chevron--open' : ''}`} aria-hidden="true">⌄</span>
      </button>

      {open && (
        <div className="aids-body">
          {vocab.length > 0 && (
            <div className="vocab-grid">
              {vocab.map(v => (
                <div key={v.id || v.word} className="vocab-card">
                  <div className="vocab-word">{v.word}{v.part_of_speech && <span className="vocab-pos">{v.part_of_speech}</span>}</div>
                  <div className="vocab-def">{v.definition}</div>
                  {v.example && <div className="vocab-example">“{v.example}”</div>}
                </div>
              ))}
            </div>
          )}
          {grammar.map(g => (
            <SentenceBlock key={g.id || g.pattern} label={`Grammar focus · ${g.pattern}`}
              text={`${g.explanation}${g.example ? ` — e.g. “${g.example}”` : ''}`} accent="var(--purple)" />
          ))}
          <SentenceBlock label="Tips" text={video.additional_notes} accent="var(--yellow)" />
        </div>
      )}
    </div>
  )
}

function MicIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
      <path d="M19 10v2a7 7 0 0 1-14 0v-2" /><line x1="12" y1="19" x2="12" y2="23" /><line x1="8" y1="23" x2="16" y2="23" />
    </svg>
  )
}

function PendingScene({ item, input, setInput, onSubmit, onToggleMic }) {
  const { video } = item
  const { text, submitting, submitError, isRecording } = input
  const len = text.trim().length
  const fieldId = `desc-${video.video_id}`

  return (
    <>
      <VideoEmbed url={video.video_url} title={video.title} />
      <LearningAids video={video} />

      <form className="card input-card" onSubmit={(e) => { e.preventDefault(); onSubmit() }}>
        <label className="section-label input-label" htmlFor={fieldId}>Your description</label>
        <div className="input-row">
          <textarea id={fieldId} className="desc-textarea" rows={4} maxLength={MAX_CHARS}
            placeholder="Describe what's happening in the video…"
            value={text} disabled={submitting}
            onChange={e => setInput({ text: e.target.value, submitError: '', ...(isRecording ? {} : { inputType: 'keyboard' }) })}
            onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) onSubmit() }} />
          {isSpeechSupported() && (
            <button type="button" className={`mic-btn${isRecording ? ' mic-btn--active' : ''}`} onClick={onToggleMic}
              disabled={submitting} aria-pressed={isRecording} aria-label={isRecording ? 'Stop voice input' : 'Speak your description'}>
              <MicIcon />
            </button>
          )}
        </div>
        <div className="input-meta">
          <span aria-live="polite">{isRecording ? <span className="recording-indicator">● Listening… speak naturally</span>
            : !isSpeechSupported() ? 'Voice input works in Chrome, Edge and Safari.' : 'Type, or tap the mic to speak.'}</span>
          <span className={len > 0 && len < MIN_CHARS ? 'char-count char-count--short' : 'char-count'}>{len}/{MAX_CHARS}</span>
        </div>
        {submitError && <div className="error-msg" role="alert">{submitError}</div>}
        <p className="one-attempt-note">You get one scored attempt per scene — take your time.</p>
        <button type="submit" className="btn-primary btn-full" disabled={submitting || len < MIN_CHARS}>
          {submitting ? <><span className="spinner" /> Analysing your English…</> : 'Submit description'}
        </button>
      </form>
    </>
  )
}

function SubmittedScene({ item }) {
  const { video, submission } = item
  return (
    <>
      <VideoEmbed url={video.video_url} title={video.title} />
      <ScoreSummary submission={submission} />
      <FeedbackCard submission={submission} />
      <div className="card">
        <div className="section-label card-heading">Reference answer</div>
        <SentenceBlock label="How our editors described it" text={video.description} accent="var(--muted)" />
        <SentenceBlock label="Tips" text={video.additional_notes} accent="#555566" />
        <Link to={`/feedback/${submission.submission_id}`} className="text-link">Open full feedback page →</Link>
      </div>
    </>
  )
}

// Plays one or more scenes: tabs, write/speak, submit, then feedback.
// Shared by Today (/) and a single past scene (/scene/:id).
export default function SceneSession({ initialScenes, kicker, title, onReload, renderFooter }) {
  const [scenes, setScenes] = useState(initialScenes)
  const [currentIdx, setCurrentIdx] = useState(() => {
    const i = initialScenes.findIndex(s => s.status === 'pending')
    return i >= 0 ? i : 0
  })
  const [inputs, setInputs] = useState({})
  const speechRef = useRef(null) // { session, videoId }

  const stopSpeech = useCallback(() => {
    const current = speechRef.current
    if (!current) return
    current.session.stop()
    speechRef.current = null
    setInputs(prev => ({ ...prev, [current.videoId]: { ...(prev[current.videoId] || DEFAULT_INPUT), isRecording: false } }))
  }, [])

  // Never leave the mic running after navigating away.
  useEffect(() => () => speechRef.current?.session.abort(), [])

  const getInput = (videoId) => inputs[videoId] || DEFAULT_INPUT
  const setInput = (videoId, updates) =>
    setInputs(prev => ({ ...prev, [videoId]: { ...(prev[videoId] || DEFAULT_INPUT), ...updates } }))

  function toggleMic(videoId) {
    if (speechRef.current?.videoId === videoId) return stopSpeech()
    stopSpeech()
    const session = createSpeechSession({
      initialText: getInput(videoId).text,
      onUpdate: ({ finalText, interimText }) => setInput(videoId, { text: [finalText, interimText].filter(Boolean).join(' ') }),
      onError: (_code, message) => {
        speechRef.current = null
        setInput(videoId, { isRecording: false, submitError: message })
      },
    })
    speechRef.current = { session, videoId }
    setInput(videoId, { isRecording: true, inputType: 'microphone', submitError: '' })
    session.start()
  }

  async function handleSubmit(idx) {
    const item = scenes[idx]
    const videoId = item.video.video_id
    if (speechRef.current?.videoId === videoId) stopSpeech()
    const { text, inputType } = getInput(videoId)
    if (text.trim().length < MIN_CHARS) {
      return setInput(videoId, { submitError: `Please write at least ${MIN_CHARS} characters describing the scene.` })
    }
    setInput(videoId, { submitting: true, submitError: '' })
    try {
      const res = await api.post('/dashboard/submit', { video_id: videoId, response_text: text.trim(), input_type: inputType }, { timeout: 60_000 })
      setScenes(prev => prev.map((s, i) => i !== idx ? s : {
        ...s,
        status: 'submitted',
        video: { ...s.video, description: res.data.reference_description ?? s.video.description },
        submission: res.data,
      }))
      setInput(videoId, { submitting: false })
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      if (err.code === 'ALREADY_SUBMITTED') return onReload?.()
      setInput(videoId, { submitting: false, submitError: err.message })
    }
  }

  function goTo(idx) {
    stopSpeech()
    setCurrentIdx(idx)
  }

  const current = scenes[currentIdx]
  const completed = scenes.filter(s => s.status === 'submitted').length
  const allDone = completed === scenes.length

  return (
    <>
      <div className="page-header">
        <div>
          {kicker && <div className="section-label">{kicker}</div>}
          <h1 className="page-title">{typeof title === 'function' ? title(allDone, scenes.length) : title}</h1>
        </div>
        {scenes.length > 1 && (
          <span className="scene-progress-badge" aria-label={`${completed} of ${scenes.length} scenes done`}>{completed} / {scenes.length} done</span>
        )}
      </div>

      {scenes.length > 1 && (
        <div className="scene-tabs" role="tablist" aria-label="Scenes">
          {scenes.map((s, i) => (
            <button key={s.video.video_id} type="button" role="tab" aria-selected={i === currentIdx}
              className={`scene-tab${i === currentIdx ? ' scene-tab--active' : ''}${s.status === 'submitted' ? ' scene-tab--done' : ''}`}
              onClick={() => goTo(i)}>
              <span className="scene-tab-num" aria-hidden="true">{s.status === 'submitted' ? '✓' : i + 1}</span>
              <span className="scene-tab-title">{s.video.title}</span>
            </button>
          ))}
        </div>
      )}

      <div className="scene-head">
        <h2 className="scene-title">{current.video.title}</h2>
        <DifficultyBadge level={current.video.difficulty} />
      </div>

      <div className="stack" key={current.video.video_id} role="tabpanel">
        {current.status === 'pending'
          ? <PendingScene item={current} input={getInput(current.video.video_id)}
              setInput={(u) => setInput(current.video.video_id, u)}
              onSubmit={() => handleSubmit(currentIdx)}
              onToggleMic={() => toggleMic(current.video.video_id)} />
          : <SubmittedScene item={current} />}
      </div>

      {current.status === 'submitted' && !allDone && (
        <button type="button" className="btn-primary btn-full next-scene-btn"
          onClick={() => goTo(scenes.findIndex(s => s.status === 'pending'))}>
          Next scene →
        </button>
      )}

      {renderFooter?.({ allDone, scenes })}
    </>
  )
}
