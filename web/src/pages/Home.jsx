import { useState, useEffect, useCallback } from 'react'
import { api } from '../api.js'
import { formatDate, plural } from '../lib/format.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { LoadingState, ErrorState } from '../components/ui.jsx'
import SceneSession from '../components/SceneSession.jsx'
import { DebateOfTheDay, CatchUp } from '../components/KeepPractising.jsx'

function useCountdown(iso) {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!iso) return
    const t = setInterval(() => setNow(Date.now()), 30_000)
    return () => clearInterval(t)
  }, [iso])
  if (!iso) return null
  const ms = Math.max(0, new Date(iso).getTime() - now)
  const h = Math.floor(ms / 3_600_000)
  const m = Math.floor((ms % 3_600_000) / 60_000)
  return h > 0 ? `${h}h ${m}m` : `${m}m`
}

function StreakPill({ streak, practisedToday }) {
  if (streak > 0) {
    return (
      <span className={`streak-pill${practisedToday ? ' streak-pill--safe' : ''}`}>
        🔥 {plural(streak, 'day')} {practisedToday ? '· safe today' : '· keep it alive'}
      </span>
    )
  }
  return <span className="streak-pill streak-pill--new">🔥 Start a streak today</span>
}

// No scene published today: still give the learner a full day of practice.
function TodayEmpty({ meta, firstName }) {
  const countdown = useCountdown(meta?.next_scene_at)
  const streak = meta?.current_streak || 0
  return (
    <div className="today-empty">
      <header className="today-hero">
        <div className="today-hero-text">
          <div className="section-label">{meta?.date ? formatDate(meta.date, { weekday: 'long', month: 'long', day: 'numeric' }) : 'Today'}</div>
          <h1 className="page-title">{firstName ? `Hi ${firstName} — ` : ''}today is a speaking day</h1>
          <p className="today-hero-sub">
            The next scene is still being prepared. Debating counts toward your streak, so warm up with today's motion.
          </p>
        </div>
        <div className="today-hero-side">
          <StreakPill streak={streak} />
          {countdown && (
            <div className="next-drop" aria-live="off">
              <span className="next-drop-label">Next scene in</span>
              <span className="next-drop-time">{countdown}</span>
            </div>
          )}
        </div>
      </header>

      <DebateOfTheDay date={meta?.date} />
      <CatchUp />
    </div>
  )
}

export default function Home({ user }) {
  usePageTitle('Today')
  const [state, setState] = useState({ status: 'loading' }) // loading | ready | empty | error
  const firstName = (user?.full_name || user?.user_name || '').split(' ')[0]

  const load = useCallback(() => {
    setState({ status: 'loading' })
    api.get('/dashboard/today')
      .then(res => {
        const scenes = res.data.scenes || []
        const meta = res.meta || { date: res.data.date }
        setState(scenes.length ? { status: 'ready', scenes, meta } : { status: 'empty', meta })
      })
      .catch(e => {
        if (e.code === 'NO_SCENE') setState({ status: 'empty', meta: e.details || {} })
        else setState({ status: 'error', error: e.message })
      })
  }, [])

  useEffect(() => { load() }, [load])

  if (state.status === 'loading') return <LoadingState label="Loading today's scenes…" />
  if (state.status === 'error') {
    return <div className="container page"><ErrorState title="Couldn't load today's scenes" message={state.error} onRetry={load} /></div>
  }
  if (state.status === 'empty') {
    return <div className="container page"><TodayEmpty meta={state.meta} firstName={firstName} /></div>
  }

  const { scenes, meta } = state
  return (
    <div className="container page">
      <SceneSession
        key={scenes.map(s => s.video.video_id + s.status).join()}
        initialScenes={scenes}
        onReload={load}
        kicker={meta.date ? formatDate(meta.date, { weekday: 'long', month: 'long', day: 'numeric' }) : 'Today'}
        title={(allDone, n) => allDone ? `Nice work${firstName ? `, ${firstName}` : ''}!` : `Today's scene${n > 1 ? 's' : ''}`}
        renderFooter={({ allDone }) => allDone && (
          <div className="keep-practising">
            <div className="done-banner">
              <span className="done-banner-icon" aria-hidden="true">✓</span>
              <div>
                <div className="done-banner-title">Today's {scenes.length > 1 ? 'scenes are' : 'scene is'} done — streak safe</div>
                <div className="done-banner-sub">Want more? Speak your mind or catch up on a scene you missed.</div>
              </div>
            </div>
            <DebateOfTheDay date={meta.date} compact />
            <CatchUp exclude={scenes.map(s => s.video.video_id)} />
          </div>
        )}
      />
    </div>
  )
}
