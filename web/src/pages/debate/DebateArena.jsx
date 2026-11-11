import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation, Link } from 'react-router-dom'
import { api } from '../../api.js'
import { isSpeechSupported, createSpeechSession } from '../../lib/speech.js'
import { isTtsSupported, speak, stopSpeaking, warmUpVoices } from '../../lib/tts.js'
import { usePageTitle } from '../../lib/usePageTitle.js'
import { LoadingState, ErrorState } from '../../components/ui.jsx'

// Phases: intro → (transition → user | ai)* → finishing
// 'waiting' = transition ended but the AI's reply hasn't arrived yet.

const SIDE = { for: 'FOR', against: 'AGAINST' }

const TIPS = [
  'Point → Example → Why it matters.',
  'Start by answering their last point: “You said…, but…”',
  'Give one concrete example from real life.',
  'Pause instead of saying “um”. Silence sounds confident.',
  'Finish with a clear sentence: “That’s why I believe…”',
]
const STARTERS = ['I see your point, but…', 'Let me give you an example.', 'The main reason is…', 'On the other hand…', 'To sum up…']

// Remaining seconds until `deadline`; calls onExpire once when it passes.
function useCountdown(deadline, onExpire) {
  const [remaining, setRemaining] = useState(0)
  const expireRef = useRef(onExpire)
  expireRef.current = onExpire
  useEffect(() => {
    if (!deadline) { setRemaining(0); return }
    let fired = false
    const tick = () => {
      const left = Math.max(0, (deadline - Date.now()) / 1000)
      setRemaining(left)
      if (left <= 0 && !fired) { fired = true; expireRef.current?.() }
    }
    tick()
    const id = setInterval(tick, 100)
    return () => clearInterval(id)
  }, [deadline])
  return remaining
}

function TimerRing({ remaining, total, tone = 'user', label }) {
  const size = 132, stroke = 8, r = (size - stroke) / 2, c = size / 2
  const circ = 2 * Math.PI * r
  const pct = total ? remaining / total : 0
  const secs = Math.ceil(remaining)
  return (
    <div className={`timer-ring timer-ring--${tone}${secs <= 5 && tone === 'user' ? ' timer-ring--urgent' : ''}`}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={c} cy={c} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} />
        <circle cx={c} cy={c} r={r} fill="none" className="timer-ring-arc" strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={circ} strokeDashoffset={circ * (1 - pct)} transform={`rotate(-90 ${c} ${c})`} />
      </svg>
      <div className="timer-ring-text">
        <span className="timer-secs">{secs}</span>
        <span className="timer-label">{label}</span>
      </div>
      <span className="sr-only" aria-live="polite">{secs % 10 === 0 || secs <= 5 ? `${secs} seconds left` : ''}</span>
    </div>
  )
}

function Transcript({ turns, live, userSide }) {
  const listRef = useRef(null)
  // Scroll inside the transcript only — never move the page away from the timer.
  useEffect(() => { const el = listRef.current; if (el) el.scrollTop = el.scrollHeight }, [turns.length, live])
  if (!turns.length && !live) return null
  return (
    <section className="card transcript" aria-label="Debate transcript">
      <div className="section-label card-heading">Transcript</div>
      <ol className="transcript-list" ref={listRef} tabIndex={0} aria-label="Transcript messages">
        {turns.map((t, i) => (
          <li key={i} className={`bubble bubble--${t.speaker}`}>
            <div className="bubble-who">{t.speaker === 'user' ? `You · ${SIDE[userSide]}` : `AI · ${SIDE[userSide === 'for' ? 'against' : 'for']}`} · Round {t.round}</div>
            <div className="bubble-text">{t.text || <em className="muted">(no speech captured)</em>}</div>
          </li>
        ))}
        {live && <li className="bubble bubble--user bubble--live"><div className="bubble-who">You · speaking…</div><div className="bubble-text">{live}</div></li>}
      </ol>
    </section>
  )
}

export default function DebateArena() {
  const { id } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  usePageTitle('Live debate')

  const [debate, setDebate] = useState(location.state?.debate || null)
  const [loadError, setLoadError] = useState('')
  const [phase, setPhaseState] = useState('loading')
  const [target, setTarget] = useState(null) // who speaks after the transition
  const [deadline, setDeadline] = useState(null)
  const [played, setPlayed] = useState(0)
  const [liveText, setLiveText] = useState('')
  const [typed, setTyped] = useState('')
  const [typingMode, setTypingMode] = useState(!isSpeechSupported())
  const [micNotice, setMicNotice] = useState('')
  const [spokenUpTo, setSpokenUpTo] = useState(0)
  const [muted, setMuted] = useState(!isTtsSupported())
  const [aiError, setAiError] = useState('')
  const [finishError, setFinishError] = useState('')
  const [confirmEnd, setConfirmEnd] = useState(false)

  const debateRef = useRef(debate); debateRef.current = debate
  const playedRef = useRef(played); playedRef.current = played
  const phaseRef = useRef(phase)
  // Keep the ref in sync immediately so callbacks in the same tick see the new phase.
  const setPhase = useCallback((p) => { phaseRef.current = p; setPhaseState(p) }, [])
  const mutedRef = useRef(muted); mutedRef.current = muted
  const typingRef = useRef(typingMode); typingRef.current = typingMode
  const typedRef = useRef(typed); typedRef.current = typed
  const liveTextRef = useRef(liveText); liveTextRef.current = liveText
  const sessionRef = useRef(null)
  const ttsRef = useRef(null)
  const turnStartRef = useRef(0)
  const pendingRef = useRef(null)
  const finishAfterPendingRef = useRef(false)

  const turnSeconds = debate?.turn_seconds || 40
  const transitionSeconds = debate?.transition_seconds || 10

  // ── load / resume ─────────────────────────────────────────────────────────
  useEffect(() => {
    warmUpVoices()
    api.get(`/debate/${id}`)
      .then(res => {
        const d = res.data
        if (d.status !== 'in_progress') return navigate(`/debate/${id}`, { replace: true })
        setDebate(d)
        // Replay the AI's last turn if the learner hasn't answered it yet.
        const last = d.turns[d.turns.length - 1]
        setPlayed(last?.speaker === 'ai' ? d.turns.length - 1 : d.turns.length)
        setAiError(d.ai_error || '')
        setPhase('intro')
      })
      .catch(e => { setLoadError(e.message); setPhase('error') })
  }, [id, navigate])

  // ── cleanup: never leave the mic or voice running ────────────────────────
  useEffect(() => () => { sessionRef.current?.abort(); stopSpeaking() }, [])

  useEffect(() => {
    const active = ['transition', 'user', 'ai', 'waiting'].includes(phase)
    if (!active) return
    const warn = (e) => { e.preventDefault(); e.returnValue = '' }
    window.addEventListener('beforeunload', warn)
    return () => window.removeEventListener('beforeunload', warn)
  }, [phase])

  // ── flow ──────────────────────────────────────────────────────────────────
  const finish = useCallback(async () => {
    sessionRef.current?.abort()
    stopSpeaking()
    setDeadline(null)
    setPhase('finishing')
    setFinishError('')
    try {
      await api.post(`/debate/${id}/finish`, {}, { timeout: 120_000 })
      navigate(`/debate/${id}`, { replace: true })
    } catch (err) {
      setFinishError(err.message)
      setPhase('finish_error')
    }
  }, [id, navigate])

  const startTransition = useCallback((who) => {
    setTarget(who)
    setPhase('transition')
    setDeadline(Date.now() + transitionSeconds * 1000)
  }, [transitionSeconds])

  // Decide what happens after the current turn.
  const beginNext = useCallback(() => {
    const d = debateRef.current
    const p = playedRef.current
    if (p < d.turns.length) return startTransition('ai')
    if (!d.next_turn) return finish()
    if (d.next_turn.speaker === 'user') return startTransition('user')
    // AI's turn but no text yet
    setDeadline(null)
    setPhase(pendingRef.current ? 'waiting' : 'ai_error')
  }, [finish, startTransition])

  const startAiTurn = useCallback(() => {
    const turn = debateRef.current.turns[playedRef.current]
    if (!turn) { setPhase(pendingRef.current ? 'waiting' : 'ai_error'); return }
    setPhase('ai')
    setSpokenUpTo(0)
    setDeadline(Date.now() + turnSeconds * 1000)
    if (!mutedRef.current) {
      ttsRef.current = speak(turn.text, { onProgress: setSpokenUpTo })
      ttsRef.current.done.then(() => {
        // Auto-advance shortly after the AI stops talking.
        if (phaseRef.current === 'ai' && !mutedRef.current) setTimeout(() => phaseRef.current === 'ai' && endAiTurnRef.current(), 900)
      })
    }
  }, [turnSeconds])

  const endAiTurn = useCallback(() => {
    ttsRef.current?.cancel()
    setDeadline(null)
    // Update the ref synchronously: beginNext() reads it in this same tick.
    const next = playedRef.current + 1
    playedRef.current = next
    setPlayed(next)
    beginNext()
  }, [beginNext])
  const endAiTurnRef = useRef(endAiTurn); endAiTurnRef.current = endAiTurn

  const startUserTurn = useCallback(() => {
    setPhase('user')
    setLiveText('')
    setTyped('')
    setMicNotice('')
    turnStartRef.current = Date.now()
    setDeadline(Date.now() + turnSeconds * 1000)
    if (typingRef.current) return
    try {
      const session = createSpeechSession({
        onUpdate: ({ finalText, interimText }) => setLiveText([finalText, interimText].filter(Boolean).join(' ')),
        onError: (code, message) => {
          // Mic blocked or missing: keep the turn going by typing.
          setMicNotice(message)
          setTypingMode(true)
        },
      })
      sessionRef.current = session
      session.start()
    } catch {
      setTypingMode(true)
    }
  }, [turnSeconds])

  // Applies a server response after a learner turn.
  const applyServerDebate = useCallback((d) => {
    setDebate(d)
    debateRef.current = d
    if (d.ai_error) setAiError(d.ai_error)
    if (finishAfterPendingRef.current) { finishAfterPendingRef.current = false; return finish() }
    if (phaseRef.current === 'waiting') {
      if (playedRef.current < d.turns.length) startAiTurn()
      else if (!d.next_turn) finish()
      else setPhase('ai_error')
    }
  }, [finish, startAiTurn])

  const endUserTurn = useCallback(({ thenFinish = false } = {}) => {
    if (phaseRef.current !== 'user') return
    const session = sessionRef.current
    session?.stop()
    sessionRef.current = null
    setDeadline(null)

    const d = debateRef.current
    // liveText includes interim words the recogniser hasn't finalised yet.
    const spoken = liveTextRef.current || session?.getText() || ''
    const text = [spoken, typedRef.current.trim()].filter(Boolean).join(' ').trim()
    const turnIndex = d.turns.length
    const userTurn = { speaker: 'user', round: d.next_turn?.round, text }

    // Optimistically show the learner's turn
    const optimistic = { ...d, turns: [...d.turns, userTurn], next_turn: null }
    setDebate(optimistic)
    debateRef.current = optimistic
    setPlayed(turnIndex + 1)
    playedRef.current = turnIndex + 1
    setLiveText('')

    const aiFollows = turnIndex + 1 < d.rounds * 2
    finishAfterPendingRef.current = thenFinish || !aiFollows
    setAiError('')

    const body = {
      turn_index: turnIndex,
      text,
      duration_s: Math.round((Date.now() - turnStartRef.current) / 100) / 10,
      input_type: session && !typingRef.current ? 'microphone' : 'keyboard',
      metrics: session?.getMetrics() || {},
    }
    const req = api.post(`/debate/${id}/turns`, body, { timeout: 60_000 })
    pendingRef.current = req
    req.then(res => { pendingRef.current = null; applyServerDebate(res.data) })
      .catch(err => {
        pendingRef.current = null
        if (err.code === 'TURN_MISMATCH' || err.code === 'DEBATE_FINISHED') {
          return api.get(`/debate/${id}`).then(r => applyServerDebate(r.data)).catch(() => {})
        }
        if (finishAfterPendingRef.current) {
          finishAfterPendingRef.current = false
          setFinishError(err.message)
          return setPhase('finish_error')
        }
        setAiError(err.message)
        if (phaseRef.current === 'waiting') setPhase('ai_error')
      })

    if (finishAfterPendingRef.current) setPhase('finishing')
    else startTransition('ai')
  }, [applyServerDebate, id, startTransition])

  async function retryAi() {
    setAiError('')
    setPhase('waiting')
    // If the learner's turn itself failed to save, resubmitting isn't possible
    // from here; reloading the debate re-syncs with the server.
    try {
      const fresh = (await api.get(`/debate/${id}`)).data
      if (fresh.turns.length < debateRef.current.turns.length) {
        setDebate(fresh); debateRef.current = fresh
        setPlayed(fresh.turns.length); playedRef.current = fresh.turns.length
        return beginNext()
      }
      const res = fresh.next_turn?.speaker === 'ai' ? await api.post(`/debate/${id}/ai-turn`, {}, { timeout: 60_000 }) : { data: fresh }
      applyServerDebate(res.data)
    } catch (err) {
      setAiError(err.message)
      setPhase('ai_error')
    }
  }

  // Timer expiry for whatever phase is running.
  const remaining = useCountdown(deadline, () => {
    const ph = phaseRef.current
    if (ph === 'transition') {
      if (target === 'user') startUserTurn()
      else if (playedRef.current < debateRef.current.turns.length) startAiTurn()
      else setPhase(pendingRef.current ? 'waiting' : 'ai_error')
    } else if (ph === 'user') endUserTurn()
    else if (ph === 'ai') endAiTurn()
  })

  function skipTransition() {
    setDeadline(Date.now())
  }

  function begin() {
    // User gesture: unlocks speech synthesis on iOS and lets the mic prompt appear.
    if (isTtsSupported()) { try { window.speechSynthesis.resume() } catch { /* ignore */ } }
    beginNext()
  }

  function endEarly() {
    setConfirmEnd(false)
    if (phaseRef.current === 'user') return endUserTurn({ thenFinish: true })
    ttsRef.current?.cancel()
    if (pendingRef.current) { finishAfterPendingRef.current = true; setPhase('finishing'); return }
    finish()
  }

  function toggleMute() {
    setMuted(m => {
      if (!m) ttsRef.current?.cancel()
      return !m
    })
  }

  // ── render ────────────────────────────────────────────────────────────────
  if (phase === 'error') {
    return <div className="container page"><ErrorState title="Couldn't open this debate" message={loadError}
      action={<Link to="/debate" className="btn-secondary">← Back to debates</Link>} /></div>
  }
  if (!debate || phase === 'loading') return <LoadingState label="Loading debate…" />

  const aiSide = debate.user_side === 'for' ? 'against' : 'for'
  const userTurnsDone = debate.turns.filter(t => t.speaker === 'user').length
  const currentRound = Math.min(debate.rounds, (phase === 'ai' ? debate.turns[played]?.round : debate.next_turn?.round)
    || debate.turns[played - 1]?.round || 1)
  const visibleTurns = debate.turns.slice(0, played)
  const aiTurn = phase === 'ai' ? debate.turns[played] : null
  const tip = TIPS[userTurnsDone % TIPS.length]

  return (
    <div className="container page debate-arena">
      <div className="arena-top">
        <div className="arena-motion">
          <span className="section-label">Motion · Round {currentRound} of {debate.rounds}</span>
          <h1 className="arena-motion-text">“{debate.topic}”</h1>
          <div className="arena-sides">
            <span className={`side-pill side-pill--${debate.user_side}`}>You: {SIDE[debate.user_side]}</span>
            <span className={`side-pill side-pill--${aiSide} side-pill--ai`}>AI: {SIDE[aiSide]}</span>
          </div>
        </div>
        <div className="arena-controls">
          {isTtsSupported() && (
            <button type="button" className="btn-ghost btn-sm" onClick={toggleMute} aria-pressed={muted}>
              {muted ? '🔇 AI voice off' : '🔊 AI voice on'}
            </button>
          )}
          {!['intro', 'finishing', 'finish_error'].includes(phase) && (
            confirmEnd
              ? <span className="confirm-inline">End now? <button type="button" className="action-btn action-btn--del" onClick={endEarly}>End & get report</button>
                  <button type="button" className="action-btn" onClick={() => setConfirmEnd(false)}>Continue</button></span>
              : <button type="button" className="btn-ghost btn-sm" onClick={() => setConfirmEnd(true)}>End debate</button>
          )}
        </div>
      </div>

      <div className="round-dots" aria-hidden="true">
        {Array.from({ length: debate.rounds * 2 }, (_, i) => (
          <span key={i} className={`round-dot${i < played ? ' round-dot--done' : ''}${i === played && ['user', 'ai'].includes(phase) ? ' round-dot--now' : ''}`} />
        ))}
      </div>

      <section className={`card stage stage--${phase}`} aria-live="polite">
        {phase === 'intro' && (
          <div className="stage-center">
            <div className="stage-kicker">Ready when you are</div>
            <h2 className="stage-title">
              {debate.next_turn?.speaker === 'user' && played >= debate.turns.length ? 'You open the debate' : 'The AI speaks first'}
            </h2>
            <ul className="intro-list">
              <li>Each turn lasts <strong>{turnSeconds} seconds</strong>, with <strong>{transitionSeconds} seconds</strong> to prepare before each one.</li>
              <li>{typingMode ? 'Type your argument during your turn.' : 'Speak naturally — your words appear as you talk. Use headphones to avoid echo.'}</li>
              <li>Your English is evaluated at the end, not during the debate.</li>
            </ul>
            <button type="button" className="btn-primary btn-lg btn-auto" onClick={begin} autoFocus>
              {played > 0 ? 'Resume debate' : "I'm ready — start"}
            </button>
          </div>
        )}

        {phase === 'transition' && (
          <div className="stage-split">
            <TimerRing remaining={remaining} total={transitionSeconds} tone="transition" label="get ready" />
            <div className="stage-body">
              <div className="stage-kicker">{target === 'user' ? 'Your turn next' : 'AI’s turn next'}</div>
              <h2 className="stage-title">{target === 'user' ? 'Plan your point' : 'Listen for their main argument'}</h2>
              {target === 'user'
                ? <p className="stage-tip">💡 {tip}</p>
                : <p className="stage-tip">Note one thing you disagree with — you’ll answer it next.</p>}
              <button type="button" className="btn-ghost btn-sm" onClick={skipTransition}>
                {target === 'user' ? "I'm ready — start now" : 'Skip wait'}
              </button>
            </div>
          </div>
        )}

        {phase === 'user' && (
          <div className="stage-split">
            <TimerRing remaining={remaining} total={turnSeconds} tone="user" label="your turn" />
            <div className="stage-body">
              <div className="stage-kicker">
                {typingMode ? '⌨️ Type your argument' : <><span className="rec-dot" aria-hidden="true" /> Listening — speak now</>}
              </div>
              {micNotice && <div className="error-msg" role="alert">{micNotice} You can type this turn instead.</div>}
              {typingMode ? (
                <>
                  <label className="sr-only" htmlFor="typed-turn">Your argument</label>
                  <textarea id="typed-turn" className="desc-textarea typed-turn" rows={4} autoFocus maxLength={2000}
                    value={typed} onChange={e => setTyped(e.target.value)} placeholder="Make your point…" />
                </>
              ) : (
                <div className={`live-caption${liveText ? '' : ' live-caption--empty'}`}>{liveText || 'Start speaking — your words will appear here.'}</div>
              )}
              <div className="starter-row" aria-label="Useful phrases">
                {STARTERS.map(s => <span key={s} className="starter">{s}</span>)}
              </div>
              <button type="button" className="btn-primary btn-auto" onClick={() => endUserTurn()}>Done — end my turn</button>
            </div>
          </div>
        )}

        {phase === 'ai' && aiTurn && (
          <div className="stage-split">
            <TimerRing remaining={remaining} total={turnSeconds} tone="ai" label="AI speaking" />
            <div className="stage-body">
              <div className="stage-kicker">🤖 AI · {SIDE[aiSide]}</div>
              <p className="ai-caption">
                <span className="ai-caption-spoken">{muted ? aiTurn.text : aiTurn.text.slice(0, spokenUpTo)}</span>
                {!muted && <span className="ai-caption-rest">{aiTurn.text.slice(spokenUpTo)}</span>}
              </p>
              <button type="button" className="btn-ghost btn-sm" onClick={endAiTurn}>
                {muted ? "I've read it — continue" : 'Skip to next'}
              </button>
            </div>
          </div>
        )}

        {phase === 'waiting' && (
          <div className="stage-center">
            <span className="thinking" aria-hidden="true"><i /><i /><i /></span>
            <h2 className="stage-title">Your opponent is thinking…</h2>
          </div>
        )}

        {phase === 'ai_error' && (
          <div className="stage-center">
            <h2 className="stage-title">The AI couldn’t reply</h2>
            <p className="muted">{aiError || 'Something went wrong. Your progress is saved.'}</p>
            <div className="action-row">
              <button type="button" className="btn-primary btn-auto" onClick={retryAi}>Retry</button>
              <button type="button" className="btn-ghost" onClick={finish}>End & get my report</button>
            </div>
          </div>
        )}

        {phase === 'finishing' && (
          <div className="stage-center">
            <span className="thinking" aria-hidden="true"><i /><i /><i /></span>
            <h2 className="stage-title">Evaluating your English…</h2>
            <p className="muted">Checking grammar, vocabulary, fluency, pronunciation and your arguments.</p>
          </div>
        )}

        {phase === 'finish_error' && (
          <div className="stage-center">
            <h2 className="stage-title">Couldn’t create your report</h2>
            <p className="muted">{finishError}</p>
            <button type="button" className="btn-primary btn-auto" onClick={finish}>Try again</button>
          </div>
        )}
      </section>

      <Transcript turns={visibleTurns} live={phase === 'user' && !typingMode ? liveText : ''} userSide={debate.user_side} />
    </div>
  )
}
