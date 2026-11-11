import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { formatDate, plural, scoreTone, TONE_COLOR } from '../lib/format.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'

function Sparkline({ values }) {
  if (!values?.length) return <div className="sparkline-empty">Your recent scores will appear here.</div>
  const w = 160, h = 40, pad = 4
  const pts = values.map((v, i) => [
    values.length === 1 ? w / 2 : pad + (i * (w - pad * 2)) / (values.length - 1),
    h - pad - ((v - 1) / 9) * (h - pad * 2),
  ])
  const d = pts.map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(' ')
  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${h}`} width="100%" height={h} role="img"
      aria-label={`Last ${values.length} scores: ${values.join(', ')}`} preserveAspectRatio="none">
      <path d={d} fill="none" stroke="var(--yellow)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      {pts.map((p, i) => <circle key={i} cx={p[0]} cy={p[1]} r={i === pts.length - 1 ? 3.5 : 2} fill="var(--yellow)" />)}
    </svg>
  )
}

function HistoryList({ onEmpty }) {
  const [page, setPage] = useState(1)
  const [state, setState] = useState({ status: 'loading', rows: [], meta: null, error: '' })

  const load = useCallback(() => {
    setState(s => ({ ...s, status: 'loading' }))
    api.get(`/profile/history?page=${page}`)
      .then(res => setState({ status: 'ready', rows: res.data, meta: res.meta, error: '' }))
      .catch(e => setState({ status: 'error', rows: [], meta: null, error: e.message }))
  }, [page])

  useEffect(() => { load() }, [load])

  if (state.status === 'error') return <ErrorState title="Couldn't load your history" message={state.error} onRetry={load} />
  if (state.status === 'ready' && !state.rows.length && page === 1) return onEmpty

  return (
    <div aria-busy={state.status === 'loading'}>
      <div className={`history-list${state.status === 'loading' ? ' is-loading' : ''}`}>
        {state.status === 'loading' && !state.rows.length && <LoadingState />}
        {state.rows.map(sub => (
          <Link key={sub.submission_id} to={`/feedback/${sub.submission_id}`} className="history-item">
            <div className="history-score-badge" style={{ color: TONE_COLOR[scoreTone(sub.score)] }}>{sub.score}</div>
            <div className="history-info">
              <div className="history-scene">{sub.scene_title}</div>
              <div className="history-date">{formatDate(sub.date)}{sub.difficulty ? ` · ${sub.difficulty}` : ''}</div>
            </div>
            <div className="history-arrow" aria-hidden="true">→</div>
          </Link>
        ))}
      </div>
      {state.meta?.pages > 1 && (
        <div className="pagination">
          <button type="button" className="btn-ghost" onClick={() => setPage(p => p - 1)} disabled={page === 1 || state.status === 'loading'}>← Prev</button>
          <span className="page-info">Page {page} of {state.meta.pages}</span>
          <button type="button" className="btn-ghost" onClick={() => setPage(p => p + 1)} disabled={page >= state.meta.pages || state.status === 'loading'}>Next →</button>
        </div>
      )}
    </div>
  )
}

export default function Profile({ user }) {
  usePageTitle('Profile')
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(() => {
    setError('')
    api.get('/profile/me').then(res => setProfile(res.data)).catch(e => setError(e.message))
  }, [])
  useEffect(() => { load() }, [load])

  const stats = profile?.stats
  const shown = profile?.user || user
  const name = shown?.full_name || shown?.user_name || 'Learner'
  const initials = name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase()
  const v = (x) => (profile ? x : '–')

  return (
    <div className="container page">
      <div className="avatar-row">
        {shown?.avatar_url
          ? <img className="avatar avatar--img" src={shown.avatar_url} alt="" referrerPolicy="no-referrer" />
          : <div className="avatar" aria-hidden="true">{initials}</div>}
        <div className="avatar-text">
          <h1 className="avatar-name">{name}</h1>
          <div className="avatar-email">{shown?.user_name && shown?.full_name ? `@${shown.user_name} · ` : ''}{shown?.email}</div>
        </div>
      </div>

      {error && <ErrorState title="Couldn't load your stats" message={error} onRetry={load} />}

      {!error && (
        <div className="stats-grid">
          <div className="stat-cell">
            <div className="stat-label">Average score</div>
            <div className="stat-value">{v(stats?.avg_score)}<span className="stat-unit">/10</span></div>
          </div>
          <div className="stat-cell">
            <div className="stat-label">Highest score</div>
            <div className="stat-value">{v(stats?.highest_score)}<span className="stat-unit">/10</span></div>
          </div>

          <div className="streak-card">
            <div className="streak-left">
              <div className="stat-label">Current streak</div>
              <div className="streak-value">🔥 {profile ? plural(stats.current_streak, 'day') : '–'}</div>
              {profile && stats.current_streak === 0 && <div className="stat-hint">Complete today&apos;s scene to start one.</div>}
            </div>
            <div className="streak-right">
              <div className="stat-label">Longest streak</div>
              <div className="streak-longest">{profile ? plural(stats.longest_streak, 'day') : '–'}</div>
            </div>
          </div>

          <div className="scenes-card">
            <div className="scenes-card-top">
              <div>
                <div className="stat-label">Scenes completed</div>
                <div className="stat-value">{v(stats?.total_completed)}</div>
              </div>
              <div className="stat-label">Recent scores</div>
            </div>
            {profile && <Sparkline values={stats.recent_scores} />}
          </div>

          <Link to="/debate" className="debate-stat-card">
            <div>
              <div className="stat-label">Debates completed</div>
              <div className="stat-value">{v(stats?.debates_completed)}</div>
            </div>
            <div>
              <div className="stat-label">Avg speaking score</div>
              <div className="stat-value">{stats?.debate_avg_score ?? '–'}<span className="stat-unit">/100</span></div>
            </div>
            <span className="debate-stat-cta">{stats?.debates_completed ? 'View debates →' : 'Try your first debate →'}</span>
          </Link>
        </div>
      )}

      <section className="section" aria-labelledby="history-heading">
        <h2 id="history-heading" className="section-label section-heading">Scene history</h2>
        <HistoryList onEmpty={
          <EmptyState title="No submissions yet" action={<Link to="/" className="btn-primary btn-auto">Start today&apos;s scene →</Link>}>
            Describe your first scene and your feedback will be saved here.
          </EmptyState>
        } />
      </section>
    </div>
  )
}
