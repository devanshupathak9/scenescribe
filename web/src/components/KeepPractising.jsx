import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { api } from '../api.js'
import { formatDate } from '../lib/format.js'
import { getYouTubeThumb } from '../lib/youtube.js'
import UpgradeSheet from './UpgradeSheet.jsx'

// Same motion for everyone on a given day, so learners can compare notes.
function pickDaily(topics, dateStr) {
  const pool = topics.filter(t => t.level !== 'advanced')
  const list = pool.length ? pool : topics
  let h = 0
  for (const ch of dateStr || '') h = (h * 31 + ch.charCodeAt(0)) >>> 0
  return list[h % list.length]
}

export function DebateOfTheDay({ date, compact = false }) {
  const navigate = useNavigate()
  const [topic, setTopic] = useState(null)
  const [starting, setStarting] = useState(null) // 'for' | 'against'
  const [error, setError] = useState('')
  const [paywall, setPaywall] = useState(null)

  useEffect(() => {
    let live = true
    api.get('/debate/topics')
      .then(r => { if (live) setTopic(pickDaily(r.data.topics || [], date || new Date().toISOString().slice(0, 10))) })
      .catch(() => { /* card falls back to a plain link */ })
    return () => { live = false }
  }, [date])

  async function start(side) {
    setStarting(side); setError('')
    try {
      const res = await api.post('/debate', { topic: topic.motion, side, rounds: 2, level: 'intermediate' }, { timeout: 45_000 })
      navigate(`/debate/${res.data.id}/live`, { state: { debate: res.data } })
    } catch (e) {
      if (e.code === 'PRO_REQUIRED') setPaywall(e.details || {})
      else setError(e.message)
      setStarting(null)
    }
  }

  return (
    <section className={`card dotd${compact ? ' dotd--compact' : ''}`} aria-labelledby="dotd-title">
      <div className="dotd-top">
        <span className="dotd-kicker"><span className="dotd-dot" aria-hidden="true" /> Debate of the day</span>
        <span className="dotd-meta">2 rounds · ~4 min · speaking</span>
      </div>
      <h2 id="dotd-title" className="dotd-motion">
        {topic ? <>“{topic.motion}”</> : <span className="skeleton-line" aria-label="Loading topic" />}
      </h2>
      <p className="dotd-sub">Pick a side. The AI argues the other one, then scores your fluency, grammar and confidence.</p>
      <div className="dotd-sides">
        <button type="button" className="side-btn side-btn--for" disabled={!topic || !!starting} onClick={() => start('for')}>
          {starting === 'for' ? <span className="spinner" /> : <span aria-hidden="true">👍</span>} I agree
        </button>
        <button type="button" className="side-btn side-btn--against" disabled={!topic || !!starting} onClick={() => start('against')}>
          {starting === 'against' ? <span className="spinner" /> : <span aria-hidden="true">👎</span>} I disagree
        </button>
      </div>
      {error && <div className="error-msg" role="alert">{error}</div>}
      <Link to="/debate" className="text-link dotd-more">Choose another topic →</Link>
      {paywall && <UpgradeSheet details={paywall} onClose={() => setPaywall(null)} />}
    </section>
  )
}

export function CatchUp({ exclude = [] }) {
  const [scenes, setScenes] = useState(null)

  useEffect(() => {
    let live = true
    api.get('/dashboard/catch-up')
      .then(r => { if (live) setScenes(r.data.scenes || []) })
      .catch(() => { if (live) setScenes([]) })
    return () => { live = false }
  }, [])

  const list = (scenes || []).filter(s => !exclude.includes(s.video_id))
  if (scenes && !list.length) return null

  return (
    <section aria-labelledby="catchup-title">
      <div className="section-row">
        <h2 id="catchup-title" className="section-title">Catch up on scenes you missed</h2>
      </div>
      <div className="catchup-grid">
        {!scenes && [0, 1, 2].map(i => <div key={i} className="catchup-card catchup-card--skeleton" aria-hidden="true" />)}
        {list.map(s => {
          const thumb = getYouTubeThumb(s.video_url)
          return (
            <Link key={s.video_id} to={`/scene/${s.video_id}`} className="catchup-card">
              <div className="catchup-thumb">
                {thumb && <img src={thumb} alt="" loading="lazy" onError={e => { e.currentTarget.style.display = 'none' }} />}
                <span className="catchup-play" aria-hidden="true">▶</span>
              </div>
              <div className="catchup-body">
                <div className="catchup-title">{s.title}</div>
                <div className="catchup-meta">
                  {formatDate(s.date, { month: 'short', day: 'numeric' })}
                  {s.difficulty && <> · <span className="catchup-diff">{s.difficulty}</span></>}
                </div>
              </div>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
