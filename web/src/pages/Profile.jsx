import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { api } from '../api.js'
import { formatDate, plural, scoreTone, TONE_COLOR } from '../lib/format.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'

const CEFR_NAME = { A1: 'Beginner', A2: 'Elementary', B1: 'Intermediate', B2: 'Upper-intermediate', C1: 'Advanced', C2: 'Proficient' }
const SPEAKING_SKILLS = new Set(['fluency', 'pronunciation', 'confidence'])
const UNLOCK_AT = 3

// ── Skill radar: six axes, 0–100 ────────────────────────────────────────────
const SHORT = { grammar: 'Grammar', vocabulary: 'Vocab', clarity: 'Clarity', fluency: 'Fluency', pronunciation: 'Pronunc.', confidence: 'Confidence' }

function SkillRadar({ skills, locked }) {
  const size = 280, c = size / 2, r = 88
  const n = skills.length
  const pt = (i, v) => {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / n
    return [c + Math.cos(a) * r * v, c + Math.sin(a) * r * v]
  }
  const ring = (v) => skills.map((_, i) => pt(i, v).map(x => x.toFixed(1)).join(',')).join(' ')
  const shape = skills.map((s, i) => pt(i, locked ? 0.55 + 0.15 * Math.sin(i * 2.1) : (s.score ?? 0) / 100).map(x => x.toFixed(1)).join(',')).join(' ')

  return (
    <svg className={`radar${locked ? ' radar--locked' : ''}`} viewBox={`0 0 ${size} ${size}`} role="img"
      aria-label={locked ? 'Skill profile locked' : skills.map(s => `${s.label} ${s.score ?? 'not measured'}`).join(', ')}>
      {[0.25, 0.5, 0.75, 1].map(v => <polygon key={v} points={ring(v)} className="radar-ring" />)}
      {skills.map((_, i) => { const [x, y] = pt(i, 1); return <line key={i} x1={c} y1={c} x2={x} y2={y} className="radar-axis" /> })}
      <polygon points={shape} className="radar-shape" />
      {!locked && skills.map((s, i) => s.score != null && (() => { const [x, y] = pt(i, s.score / 100); return <circle key={s.key} cx={x} cy={y} r="3.5" className="radar-dot" /> })())}
      {skills.map((s, i) => {
        const [x, y] = pt(i, 1.18)
        return <text key={s.key} x={x} y={y} className="radar-label" textAnchor={Math.abs(x - c) < 4 ? 'middle' : x > c ? 'start' : 'end'} dominantBaseline="middle">{SHORT[s.key] || s.label}</text>
      })}
    </svg>
  )
}

// ── 4-week activity heatmap (Mon-first columns of weeks) ────────────────────
function ActivityHeatmap({ activity }) {
  const days = activity || []
  const active = days.filter(d => d.count > 0).length
  return (
    <div className="heatmap-wrap">
      <div className="heatmap" role="img" aria-label={`Practised on ${active} of the last ${days.length} days`}>
        {days.map(d => (
          <span key={d.date} className={`heat heat--${Math.min(d.count, 3)}`}
            title={`${formatDate(d.date, { weekday: 'short', month: 'short', day: 'numeric' })}: ${d.count ? plural(d.count, 'practice') : 'no practice'}`} />
        ))}
      </div>
      <div className="heatmap-legend">
        <span>{plural(active, 'active day')} in 4 weeks</span>
        <span className="heatmap-scale" aria-hidden="true">less <i className="heat heat--0" /><i className="heat heat--1" /><i className="heat heat--2" /><i className="heat heat--3" /> more</span>
      </div>
    </div>
  )
}

function DebateHistory() {
  const [page, setPage] = useState(1)
  const [state, setState] = useState({ status: 'loading', rows: [], meta: null, error: '' })
  const load = useCallback(() => {
    setState(s => ({ ...s, status: 'loading' }))
    api.get(`/debate?page=${page}`)
      .then(res => setState({ status: 'ready', rows: res.data, meta: res.meta, error: '' }))
      .catch(e => setState({ status: 'error', rows: [], meta: null, error: e.message }))
  }, [page])
  useEffect(() => { load() }, [load])

  if (state.status === 'error') return <ErrorState title="Couldn't load your debates" message={state.error} onRetry={load} />
  if (state.status === 'ready' && !state.rows.length && page === 1) {
    return (
      <EmptyState icon="🎙️" title="No debates yet" action={<Link to="/debate" className="btn-primary btn-auto">Start a debate →</Link>}>
        Two short rounds against the AI — you'll get a speaking report at the end.
      </EmptyState>
    )
  }
  return (
    <div aria-busy={state.status === 'loading'}>
      <div className={`history-list${state.status === 'loading' ? ' is-loading' : ''}`}>
        {state.status === 'loading' && !state.rows.length && <LoadingState />}
        {state.rows.map(d => (
          <Link key={d.id} to={`/debate/${d.id}`} className="history-item">
            <div className="history-score-badge history-score-badge--wide" style={{ color: d.overall_score != null ? TONE_COLOR[scoreTone(d.overall_score, 100)] : undefined }}>
              {d.overall_score ?? '–'}
            </div>
            <div className="history-info">
              <div className="history-scene">{d.topic}</div>
              <div className="history-date">
                {formatDate(d.completed_at || d.created_at)} · {d.user_side === 'for' ? 'For' : 'Against'}{d.cefr_level ? ` · ${d.cefr_level}` : ''}
              </div>
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
  const [tab, setTab] = useState('scenes')

  const load = useCallback(() => {
    setError('')
    api.get('/profile/me').then(res => setProfile(res.data)).catch(e => setError(e.message))
  }, [])
  useEffect(() => { load() }, [load])

  const shown = profile?.user || user
  const name = shown?.full_name || shown?.user_name || 'Learner'
  const initials = name.split(/\s+/).map(p => p[0]).join('').slice(0, 2).toUpperCase()

  if (error) return <div className="container page"><ErrorState title="Couldn't load your profile" message={error} onRetry={load} /></div>
  if (!profile) return <LoadingState label="Loading your profile…" />

  const { stats, skills = [], focus, activity, recent_corrections: corrections = [], level } = profile
  const locked = stats.practices < UNLOCK_AT
  const focusSkill = skills.find(s => s.key === focus)
  const streak = stats.current_streak

  return (
    <div className="container page profile">
      {/* Identity + streak */}
      <section className="card profile-hero">
        <div className="profile-id">
          <div className="profile-avatar">
            {shown?.avatar_url
              ? <img className="avatar avatar--img" src={shown.avatar_url} alt="" referrerPolicy="no-referrer" />
              : <div className="avatar" aria-hidden="true">{initials}</div>}
            {level && <span className="level-chip" aria-hidden="true">{level}</span>}
          </div>
          <div className="profile-id-text">
            <h1 className="avatar-name">{name}</h1>
            <div className="avatar-email">{shown?.user_name ? `@${shown.user_name}` : shown?.email}</div>
            <div className="profile-level">
              {level
                ? <><strong>{level}</strong> · {CEFR_NAME[level] || 'Speaking level'} <span className="muted">from your latest debate</span></>
                : <Link to="/debate" className="text-link">Finish a debate to get your CEFR level →</Link>}
            </div>
          </div>
        </div>

        <div className={`streak-flame${streak ? '' : ' streak-flame--off'}`}>
          <div className="streak-flame-num"><span aria-hidden="true">🔥</span>{streak}</div>
          <div className="streak-flame-label">day streak</div>
          <div className="streak-flame-sub">
            {stats.practised_today ? 'Safe for today ✓' : streak ? 'Practise today to keep it' : 'Practise today to start one'}
            {stats.longest_streak > 0 && <> · best {stats.longest_streak}</>}
          </div>
        </div>

        <div className="profile-hero-activity">
          <ActivityHeatmap activity={activity} />
        </div>
      </section>

      {/* Stat strip */}
      <div className="stat-strip">
        <div className="stat-chip"><span className="stat-chip-val">{stats.practices}</span><span className="stat-chip-label">practices</span></div>
        <div className="stat-chip"><span className="stat-chip-val">{stats.total_completed}</span><span className="stat-chip-label">scenes</span></div>
        <div className="stat-chip"><span className="stat-chip-val">{stats.debates_completed}</span><span className="stat-chip-label">debates</span></div>
        <div className="stat-chip">
          <span className="stat-chip-val">{stats.total_completed ? stats.avg_score : '–'}<small>/10</small></span>
          <span className="stat-chip-label">scene avg</span>
        </div>
        <div className="stat-chip">
          <span className="stat-chip-val">{stats.debate_avg_score ?? '–'}<small>/100</small></span>
          <span className="stat-chip-label">speaking avg</span>
        </div>
      </div>

      {/* Skill profile */}
      <section className="card skills-card" aria-labelledby="skills-heading">
        <div className="skills-head">
          <h2 id="skills-heading" className="section-title">Skill profile</h2>
          {!locked && <span className="muted skills-note">Writing from scenes · speaking from debates</span>}
        </div>
        <div className="skills-body">
          <div className="radar-box">
            <SkillRadar skills={skills} locked={locked} />
            {locked && (
              <div className="radar-lock">
                <div className="radar-lock-title">🔒 {stats.practices}/{UNLOCK_AT} practices</div>
                <div className="radar-lock-sub">Any scene or debate counts. Then we map your six skills.</div>
                <div className="unlock-dots" aria-hidden="true">
                  {Array.from({ length: UNLOCK_AT }, (_, i) => <span key={i} className={i < stats.practices ? 'on' : ''} />)}
                </div>
              </div>
            )}
          </div>
          <div className="skill-bars">
            {skills.map(s => (
              <div key={s.key} className={`skill-bar${s.key === focus ? ' skill-bar--focus' : ''}`}>
                <div className="skill-bar-top">
                  <span>{s.label}{SPEAKING_SKILLS.has(s.key) && <span className="skill-tag">speaking</span>}</span>
                  <span className="skill-bar-val">{s.score ?? '—'}</span>
                </div>
                <div className="skill-track"><div className="skill-fill" style={{ width: `${s.score ?? 0}%` }} /></div>
              </div>
            ))}
          </div>
        </div>
        {focusSkill && (
          <div className="focus-next">
            <div>
              <div className="focus-next-kicker">Focus next</div>
              <div className="focus-next-title">{focusSkill.label} is your lowest skill at {focusSkill.score}</div>
            </div>
            {SPEAKING_SKILLS.has(focusSkill.key)
              ? <Link to="/debate" className="btn-primary btn-auto">Train it in a debate →</Link>
              : <Link to="/" className="btn-primary btn-auto">Train it with a scene →</Link>}
          </div>
        )}
      </section>

      {/* Corrections */}
      {corrections.length > 0 && (
        <section className="card" aria-labelledby="fixes-heading">
          <h2 id="fixes-heading" className="section-title">Your recent fixes</h2>
          <div className="fix-list">
            {corrections.map((m, i) => (
              <div key={i} className="fix">
                <div className="fix-said"><span className="fix-tag">You said</span>{m.original}</div>
                <div className="fix-better"><span className="fix-tag">Better</span>{m.correction}</div>
                {m.explanation && <div className="fix-why">{m.explanation}</div>}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* History */}
      <section className="section" aria-labelledby="history-heading">
        <div className="history-head">
          <h2 id="history-heading" className="section-title">History</h2>
          <div className="seg" role="tablist" aria-label="History type">
            <button type="button" role="tab" aria-selected={tab === 'scenes'} className={tab === 'scenes' ? 'seg-on' : ''} onClick={() => setTab('scenes')}>Scenes</button>
            <button type="button" role="tab" aria-selected={tab === 'debates'} className={tab === 'debates' ? 'seg-on' : ''} onClick={() => setTab('debates')}>Debates</button>
          </div>
        </div>
        {tab === 'scenes'
          ? <HistoryList onEmpty={
              <EmptyState title="No scenes yet" action={<Link to="/" className="btn-primary btn-auto">Go to Today →</Link>}>
                Describe your first scene and your feedback will be saved here.
              </EmptyState>
            } />
          : <DebateHistory />}
      </section>
    </div>
  )
}
