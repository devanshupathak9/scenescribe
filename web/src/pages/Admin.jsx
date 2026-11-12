import { useState, useEffect, useCallback, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { api } from '../api.js'
import { formatDate, plural } from '../lib/format.js'
import { getYouTubeId, getYouTubeThumb, formatClip } from '../lib/youtube.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced']
const MAX_PER_DAY = 4
const TABS = [['overview', 'Overview'], ['schedule', 'Schedule'], ['learners', 'Learners']]
// Validated against the card surface (dataviz palette check, dark mode).
const SERIES = { scenes: { label: 'Scenes', color: '#879a12' }, debates: { label: 'Debates', color: '#7c6fef' } }

const emptyForm = (date) => ({
  date, title: '', video_url: '', description: '', difficulty: 'intermediate',
  additional_notes: '', vocabularies: [], grammars: [],
})

function fromScene(s) {
  return {
    date: s.date, title: s.title || '', video_url: s.video_url || '', description: s.description || '',
    difficulty: s.difficulty || 'intermediate', additional_notes: s.additional_notes || '',
    vocabularies: (s.vocabularies || []).map(({ word, definition, example, part_of_speech }) => ({ word, definition, example: example || '', part_of_speech: part_of_speech || '' })),
    grammars: (s.grammars || []).map(({ pattern, explanation, example }) => ({ pattern, explanation, example: example || '' })),
  }
}

const timeAgo = (iso) => {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.floor(s / 60)}m ago`
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`
  return `${Math.floor(s / 86400)}d ago`
}
const shortDay = (date) => formatDate(date, { weekday: 'short' })
const dayNum = (date) => Number(date.slice(8, 10))

function ListEditor({ label, items, onChange, fields, blank, addLabel }) {
  const update = (i, k, v) => onChange(items.map((it, j) => (j === i ? { ...it, [k]: v } : it)))
  return (
    <fieldset className="list-editor">
      <legend className="field-label">{label} <span className="field-optional">optional</span></legend>
      {items.map((it, i) => (
        <div key={i} className="list-editor-row">
          {fields.map(f => (
            <input key={f.key} className="field-input" placeholder={f.placeholder} aria-label={`${label} ${i + 1} ${f.placeholder}`}
              value={it[f.key]} onChange={e => update(i, f.key, e.target.value)} style={f.wide ? { gridColumn: '1 / -1' } : undefined} />
          ))}
          <button type="button" className="action-btn action-btn--del list-editor-remove" onClick={() => onChange(items.filter((_, j) => j !== i))}
            aria-label={`Remove ${label} ${i + 1}`}>Remove</button>
        </div>
      ))}
      <button type="button" className="btn-ghost btn-sm" onClick={() => onChange([...items, { ...blank }])}>+ {addLabel}</button>
    </fieldset>
  )
}

function SceneForm({ initial, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError('') }
  const videoOk = !form.video_url || getYouTubeId(form.video_url)

  async function submit(e) {
    e.preventDefault()
    if (!form.date || !form.title.trim() || !form.video_url.trim() || !form.description.trim()) {
      return setError('Date, title, YouTube URL and reference answer are required.')
    }
    if (!videoOk) return setError('That doesn’t look like a YouTube link.')
    setSaving(true)
    try {
      await onSubmit({
        ...form,
        vocabularies: form.vocabularies.filter(v => v.word.trim() && v.definition.trim()),
        grammars: form.grammars.filter(g => g.pattern.trim() && g.explanation.trim()),
      })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const id = (k) => `${submitLabel.replace(/\W/g, '')}-${k}`

  return (
    <form onSubmit={submit} noValidate>
      {error && <div className="error-msg" role="alert">{error}</div>}
      <div className="form-grid">
        <div className="form-field">
          <label className="field-label" htmlFor={id('date')}>Date <span className="field-optional">up to {MAX_PER_DAY} per day</span></label>
          <input id={id('date')} className="field-input" type="date" value={form.date} onChange={e => set('date', e.target.value)} />
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor={id('difficulty')}>Difficulty</label>
          <select id={id('difficulty')} className="field-input" value={form.difficulty} onChange={e => set('difficulty', e.target.value)}>
            {DIFFICULTIES.map(d => <option key={d} value={d}>{d[0].toUpperCase() + d.slice(1)}</option>)}
          </select>
        </div>
      </div>
      <div className="form-field">
        <label className="field-label" htmlFor={id('title')}>Title</label>
        <input id={id('title')} className="field-input" value={form.title} maxLength={200}
          onChange={e => set('title', e.target.value)} placeholder="e.g. Man ordering coffee at a café" />
      </div>
      <div className="form-field">
        <label className="field-label" htmlFor={id('url')}>YouTube URL</label>
        <input id={id('url')} className="field-input" type="url" inputMode="url" value={form.video_url} aria-invalid={!videoOk}
          onChange={e => set('video_url', e.target.value)} placeholder="https://www.youtube.com/watch?v=… or /shorts/…" />
        {!videoOk && <div className="field-error">Not a recognised YouTube link.</div>}
        {videoOk && form.video_url && formatClip(form.video_url) && (
          <div className="field-hint">Plays {formatClip(form.video_url)} of the video.</div>
        )}
        <div className="field-hint">Only part of a long video? Add <code>&amp;t=1m35s&amp;end=5m20s</code> to the link.</div>
        {videoOk && form.video_url && getYouTubeThumb(form.video_url) && (
          <img className="url-preview" src={getYouTubeThumb(form.video_url)} alt="Video thumbnail" onError={e => { e.currentTarget.style.display = 'none' }} />
        )}
      </div>
      <div className="form-field">
        <label className="field-label" htmlFor={id('desc')}>Reference answer <span className="field-optional">hidden from learners until they submit; used for AI scoring</span></label>
        <textarea id={id('desc')} className="field-input" rows={3} maxLength={2000} value={form.description}
          onChange={e => set('description', e.target.value)} placeholder="The ideal description of the scene…" />
      </div>
      <div className="form-field">
        <label className="field-label" htmlFor={id('notes')}>Tips for learners <span className="field-optional">optional, shown before writing</span></label>
        <textarea id={id('notes')} className="field-input" rows={2} maxLength={2000} value={form.additional_notes}
          onChange={e => set('additional_notes', e.target.value)} placeholder="What should they notice?" />
      </div>

      <ListEditor label="Key vocabulary" items={form.vocabularies} onChange={v => set('vocabularies', v)} addLabel="Add word"
        blank={{ word: '', part_of_speech: '', definition: '', example: '' }}
        fields={[
          { key: 'word', placeholder: 'Word' },
          { key: 'part_of_speech', placeholder: 'Part of speech' },
          { key: 'definition', placeholder: 'Definition', wide: true },
          { key: 'example', placeholder: 'Example sentence', wide: true },
        ]} />
      <ListEditor label="Grammar focus" items={form.grammars} onChange={v => set('grammars', v)} addLabel="Add grammar point"
        blank={{ pattern: '', explanation: '', example: '' }}
        fields={[
          { key: 'pattern', placeholder: 'Pattern, e.g. present continuous', wide: true },
          { key: 'explanation', placeholder: 'Explanation', wide: true },
          { key: 'example', placeholder: 'Example', wide: true },
        ]} />

      <div className="action-row action-row--end">
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn-primary btn-auto" disabled={saving}>
          {saving ? <><span className="spinner" /> Saving…</> : submitLabel}
        </button>
      </div>
    </form>
  )
}


// ── Overview ────────────────────────────────────────────────────────────────
function StatusPill({ ok, label, okText, offText }) {
  return (
    <div className={`sys-pill${ok ? ' sys-pill--ok' : ' sys-pill--warn'}`}>
      <span className="sys-icon" aria-hidden="true">{ok ? '✓' : '!'}</span>
      <span><strong>{label}</strong> {ok ? okText : offText}</span>
    </div>
  )
}

function ActivityChart({ activity }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...activity.map(d => d.scenes + d.debates))
  const W = 560, H = 160, padB = 22, padT = 8, gap = 6
  const bw = (W - gap * (activity.length - 1)) / activity.length
  const y = (v) => ((H - padB - padT) * v) / max
  const total = activity.reduce((a, d) => a + d.scenes + d.debates, 0)

  return (
    <div className="chart">
      <div className="chart-legend">
        {Object.values(SERIES).map(s => <span key={s.label}><i style={{ background: s.color }} />{s.label}</span>)}
      </div>
      <div className="chart-plot" onMouseLeave={() => setHover(null)}>
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label={`Practice over the last 14 days: ${total} sessions`}>
          {[0.5, 1].map(f => <line key={f} x1="0" x2={W} y1={H - padB - (H - padB - padT) * f} y2={H - padB - (H - padB - padT) * f} className="chart-grid" />)}
          <line x1="0" x2={W} y1={H - padB} y2={H - padB} className="chart-base" />
          {activity.map((d, i) => {
            const x = i * (bw + gap)
            const hs = y(d.scenes), hd = y(d.debates)
            const base = H - padB
            return (
              <g key={d.date} onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} tabIndex={0}>
                <rect x={x} y={padT} width={bw} height={H - padB - padT} fill="transparent" />
                {d.scenes > 0 && <rect x={x} y={base - hs} width={bw} height={hs} rx="3" fill={SERIES.scenes.color} />}
                {d.debates > 0 && <rect x={x} y={base - hs - hd - (d.scenes ? 2 : 0)} width={bw} height={hd} rx="3" fill={SERIES.debates.color} />}
                {(i % 2 === activity.length % 2 || i === activity.length - 1) && (
                  <text x={x + bw / 2} y={H - 6} textAnchor="middle" className="chart-tick">{dayNum(d.date)}</text>
                )}
              </g>
            )
          })}
        </svg>
        {hover != null && (() => {
          const d = activity[hover]
          const left = ((hover + 0.5) / activity.length) * 100
          return (
            <div className="chart-tip" style={{ left: `${left}%` }} role="status">
              <div className="chart-tip-date">{formatDate(d.date, { weekday: 'short', month: 'short', day: 'numeric' })}</div>
              <div><i style={{ background: SERIES.scenes.color }} />{plural(d.scenes, 'scene')}</div>
              <div><i style={{ background: SERIES.debates.color }} />{plural(d.debates, 'debate')}</div>
              <div className="muted">{plural(d.learners, 'learner')}</div>
            </div>
          )
        })()}
      </div>
      <table className="sr-only">
        <caption>Daily practice</caption>
        <thead><tr><th>Date</th><th>Scenes</th><th>Debates</th><th>Learners</th></tr></thead>
        <tbody>{activity.map(d => <tr key={d.date}><td>{d.date}</td><td>{d.scenes}</td><td>{d.debates}</td><td>{d.learners}</td></tr>)}</tbody>
      </table>
    </div>
  )
}

function Overview({ data, onPlan }) {
  const gapSoon = data.first_gap && data.runway.findIndex(d => d.date === data.first_gap) < 3
  const covered = data.runway.filter(d => d.scenes).length
  const kpis = [
    ['Active today', data.active_today, `${plural(data.active_7d, 'learner')} this week`],
    ['Learners', data.total_users, `+${data.new_users_7d} in 7 days`],
    ['Scenes done', data.total_submissions, `avg score ${data.average_score}/10`],
    ['Debates', data.total_debates, 'completed'],
  ]
  return (
    <div className="admin-stack">
      <div className="sys-row">
        <StatusPill ok={data.system.ai_enabled} label="AI scoring" okText="on" offText="off — learners get estimated scores. Set OPENAI_API_KEY." />
        <StatusPill ok={data.system.email_enabled} label="Email" okText="on" offText="off — new sign-ups can't receive codes. Set SMTP_HOST/USER/PASS." />
        <div className="sys-pill"><span className="sys-icon" aria-hidden="true">◷</span><span><strong>Day starts</strong> in {data.system.timezone}</span></div>
      </div>

      {data.first_gap && (
        <div className={`runway-alert${gapSoon ? ' runway-alert--urgent' : ''}`}>
          <div>
            <div className="runway-alert-title">
              {data.first_gap === data.today ? 'No scene today' : `No scene on ${formatDate(data.first_gap, { weekday: 'long', month: 'short', day: 'numeric' })}`}
            </div>
            <div className="runway-alert-sub">{covered} of the next 14 days have a scene. Learners see the speaking-day page on empty days.</div>
          </div>
          <button type="button" className="btn-primary btn-auto" onClick={() => onPlan(data.first_gap)}>Schedule it →</button>
        </div>
      )}

      <div className="kpi-grid">
        {kpis.map(([label, value, sub]) => (
          <div key={label} className="kpi">
            <div className="kpi-label">{label}</div>
            <div className="kpi-value">{value}</div>
            <div className="kpi-sub">{sub}</div>
          </div>
        ))}
      </div>

      <div className="admin-two">
        <section className="card admin-panel">
          <h2 className="section-title">Practice, last 14 days</h2>
          <ActivityChart activity={data.activity} />
        </section>
        <section className="card admin-panel">
          <h2 className="section-title">Latest activity</h2>
          {!data.recent_activity.length && <p className="muted">Nothing yet — activity appears as learners practise.</p>}
          <ul className="feed">
            {data.recent_activity.map(a => (
              <li key={a.type + a.id} className="feed-item">
                <span className={`feed-dot feed-dot--${a.type}`} aria-hidden="true" />
                <div className="feed-body">
                  <div className="feed-line"><strong>@{a.username || 'learner'}</strong> {a.type === 'scene' ? 'described' : 'debated'} <span className="feed-title">{a.title}</span></div>
                  <div className="feed-meta">{a.score != null ? `${a.score}/${a.max}` : 'scored'} · {timeAgo(a.at)}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  )
}

// ── Schedule ────────────────────────────────────────────────────────────────
function RunwayStrip({ runway, today, selected, onPick }) {
  return (
    <div className="runway" role="list" aria-label="Next 14 days">
      {runway.map(d => {
        const full = d.scenes >= MAX_PER_DAY
        return (
          <button key={d.date} type="button" role="listitem" disabled={full}
            className={`runway-day${d.scenes ? '' : ' runway-day--gap'}${d.date === selected ? ' runway-day--on' : ''}${d.date === today ? ' runway-day--today' : ''}`}
            onClick={() => onPick(d.date)}
            aria-label={`${formatDate(d.date, { weekday: 'long', month: 'short', day: 'numeric' })}: ${plural(d.scenes, 'scene')}${full ? ', full' : ', add a scene'}`}>
            <span className="runway-dow">{d.date === today ? 'Today' : shortDay(d.date)}</span>
            <span className="runway-num">{dayNum(d.date)}</span>
            <span className="runway-dots" aria-hidden="true">
              {Array.from({ length: MAX_PER_DAY }, (_, i) => <i key={i} className={i < d.scenes ? 'on' : ''} />)}
            </span>
            <span className="runway-add" aria-hidden="true">{d.scenes ? `${d.scenes}/${MAX_PER_DAY}` : '+ add'}</span>
          </button>
        )
      })}
    </div>
  )
}

function Schedule({ scenes, today, runway, planDate, setPlanDate, reload }) {
  const [flash, setFlash] = useState('')
  const [editId, setEditId] = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  const [rowError, setRowError] = useState({})
  const [showPast, setShowPast] = useState(false)

  async function create(payload) {
    await api.post('/admin/schedule', payload)
    setFlash(`Scheduled “${payload.title}” for ${formatDate(payload.date, { weekday: 'short', month: 'short', day: 'numeric' })}.`)
    setPlanDate(null)
    reload()
  }
  async function saveEdit(id, payload) {
    await api.patch(`/admin/schedule/${id}`, payload)
    setEditId(null)
    reload()
  }
  async function remove(id) {
    try {
      await api.delete(`/admin/schedule/${id}`)
      setConfirmId(null)
      reload()
    } catch (err) {
      setConfirmId(null)
      setRowError(e => ({ ...e, [id]: err.message }))
    }
  }

  const visible = scenes.filter(s => showPast || s.date >= today)
  const grouped = visible.reduce((acc, s) => ((acc[s.date] ||= []).push(s), acc), {})
  const dates = Object.keys(grouped).sort((a, b) => (showPast ? b.localeCompare(a) : a.localeCompare(b)))
  const pastCount = scenes.filter(s => s.date < today).length

  return (
    <div className="admin-stack">
      <section className="card admin-panel">
        <div className="section-row">
          <h2 className="section-title">Next 14 days</h2>
          <button type="button" className="btn-primary btn-sm btn-auto" onClick={() => { setFlash(''); setPlanDate(planDate ? null : (runway.find(d => !d.scenes)?.date || today)) }}>
            {planDate ? 'Close' : '+ New scene'}
          </button>
        </div>
        <RunwayStrip runway={runway} today={today} selected={planDate} onPick={(d) => { setFlash(''); setPlanDate(d) }} />
        {flash && <div className="success-msg" role="status">✓ {flash}</div>}
        {planDate && (
          <div className="plan-panel">
            <h3 className="plan-title">New scene · {formatDate(planDate, { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
            <SceneForm key={planDate} initial={emptyForm(planDate)} submitLabel="Schedule scene" onSubmit={create} onCancel={() => setPlanDate(null)} />
          </div>
        )}
      </section>

      <section aria-labelledby="schedule-heading">
        <div className="section-row">
          <h2 id="schedule-heading" className="section-title">{showPast ? 'All scenes' : 'Upcoming'}</h2>
          {pastCount > 0 && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setShowPast(p => !p)}>
              {showPast ? 'Hide past' : `Show past (${pastCount})`}
            </button>
          )}
        </div>

        {!dates.length && <EmptyState icon="📅" title="Nothing scheduled">Pick a day above to add the first scene.</EmptyState>}

        <div className="schedule-list">
          {dates.map(date => {
            const day = grouped[date]
            const d = new Date(`${date}T12:00:00`)
            return (
              <div key={date} className={`date-group${date < today ? ' date-group--past' : ''}`}>
                <div className="date-group-header">
                  <div className="date-badge">
                    <div className="date-day">{d.getDate()}</div>
                    <div className="date-month">{d.toLocaleString(undefined, { month: 'short' })}</div>
                  </div>
                  <div className="date-group-meta">
                    <div className="date-group-title">{formatDate(date, { weekday: 'short', month: 'long', day: 'numeric', year: 'numeric' })}{date === today && ' · Today'}</div>
                    <div className="date-group-sub">{plural(day.length, 'scene')} scheduled</div>
                  </div>
                  {date >= today && day.length < MAX_PER_DAY
                    ? <button type="button" className="action-btn" onClick={() => { setPlanDate(date); window.scrollTo({ top: 0, behavior: 'smooth' }) }}>+ Add</button>
                    : <div className="scene-count-badge">{day.length} / {MAX_PER_DAY}</div>}
                </div>

                {day.map((item, i) => (
                  <div key={item.video_id} className="schedule-row schedule-row--nested">
                    {getYouTubeThumb(item.video_url)
                      ? <img className="schedule-thumb" src={getYouTubeThumb(item.video_url)} alt="" loading="lazy" onError={e => { e.currentTarget.style.visibility = 'hidden' }} />
                      : <div className="scene-number">#{i + 1}</div>}
                    {editId === item.video_id ? (
                      <div className="schedule-edit">
                        <SceneForm initial={fromScene(item)} submitLabel="Save changes"
                          onSubmit={(p) => saveEdit(item.video_id, p)} onCancel={() => setEditId(null)} />
                      </div>
                    ) : (
                      <>
                        <div className="schedule-meta">
                          <div className="schedule-title">{item.title}</div>
                          <div className="schedule-desc">{item.description}</div>
                          <div className="schedule-tags">
                            <span className={`difficulty-badge difficulty-badge--${item.difficulty}`}>{item.difficulty}</span>
                            {item.vocabularies.length > 0 && <span className="tag">{plural(item.vocabularies.length, 'word')}</span>}
                            {item.grammars.length > 0 && <span className="tag">{plural(item.grammars.length, 'grammar point')}</span>}
                            <a className="tag tag--link" href={item.video_url} target="_blank" rel="noreferrer">Video ↗</a>
                          </div>
                          {rowError[item.video_id] && <div className="error-msg" role="alert">{rowError[item.video_id]}</div>}
                        </div>
                        <div className="schedule-actions">
                          {confirmId === item.video_id ? (
                            <>
                              <span className="confirm-text">Delete?</span>
                              <button type="button" className="action-btn action-btn--del" onClick={() => remove(item.video_id)}>Yes, delete</button>
                              <button type="button" className="action-btn" onClick={() => setConfirmId(null)}>Keep</button>
                            </>
                          ) : (
                            <>
                              <button type="button" className="action-btn" onClick={() => { setEditId(item.video_id); setRowError(e => ({ ...e, [item.video_id]: '' })) }}>Edit</button>
                              <button type="button" className="action-btn action-btn--del" onClick={() => setConfirmId(item.video_id)}>Delete</button>
                            </>
                          )}
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )
          })}
        </div>
      </section>
    </div>
  )
}

// ── Learners ────────────────────────────────────────────────────────────────
function LearnerActions({ u, onDone }) {
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const run = async (key, fn) => {
    setBusy(key); setErr('')
    try { await fn(); onDone() } catch (e) { setErr(e.message) } finally { setBusy('') }
  }
  const pro = (days) => run(`pro${days}`, () => api.post(`/admin/learners/${u.id}/pro`, { days }))
  const role = (is_admin) => run('role', () => api.patch(`/admin/learners/${u.id}`, { is_admin }))
  return (
    <div className="learner-actions">
      <div className="learner-actions-group">
        <span className="learner-actions-label">Pro access</span>
        <button type="button" className="action-btn" disabled={!!busy} onClick={() => pro(30)}>+30 days</button>
        <button type="button" className="action-btn" disabled={!!busy} onClick={() => pro(365)}>+1 year</button>
        {u.plan?.pro && u.plan?.source === 'admin' && <button type="button" className="action-btn action-btn--del" disabled={!!busy} onClick={() => pro(0)}>Revoke</button>}
      </div>
      <div className="learner-actions-group">
        <span className="learner-actions-label">Role</span>
        {u.is_admin
          ? (!u.is_owner && <button type="button" className="action-btn action-btn--del" disabled={!!busy} onClick={() => role(false)}>Remove admin</button>)
          : <button type="button" className="action-btn" disabled={!!busy} onClick={() => role(true)}>Make admin</button>}
        {u.is_owner && <span className="muted small">Owner (set by ADMIN_EMAIL)</span>}
      </div>
      {err && <div className="error-msg" role="alert">{err}</div>}
    </div>
  )
}

function planLabel(plan) {
  if (!plan?.premium_enabled) return { text: 'Beta', cls: '' }
  if (!plan.pro) return { text: 'Free', cls: '' }
  if (plan.source === 'staff') return { text: 'Staff', cls: '' }
  return { text: plan.source === 'admin' ? 'Pro · granted' : 'Pro', cls: ' mini-badge--pro' }
}

function Learners() {
  const [open, setOpen] = useState(null)
  const [q, setQ] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [state, setState] = useState({ status: 'loading', rows: [], meta: null, error: '' })

  useEffect(() => { const t = setTimeout(() => { setQuery(q.trim()); setPage(1) }, 300); return () => clearTimeout(t) }, [q])

  const load = useCallback(() => {
    setState(s => ({ ...s, status: 'loading' }))
    api.get(`/admin/learners?page=${page}${query ? `&q=${encodeURIComponent(query)}` : ''}`)
      .then(r => setState({ status: 'ready', rows: r.data, meta: r.meta, error: '' }))
      .catch(e => setState({ status: 'error', rows: [], meta: null, error: e.message }))
  }, [page, query])
  useEffect(() => { load() }, [load])

  return (
    <div className="admin-stack">
      <div className="learner-toolbar">
        <input className="field-input learner-search" type="search" placeholder="Search name, username or email…" value={q}
          onChange={e => setQ(e.target.value)} aria-label="Search learners" />
        {state.meta && <span className="muted">{plural(state.meta.total, 'learner')}</span>}
      </div>

      {state.status === 'error' && <ErrorState title="Couldn't load learners" message={state.error} onRetry={load} />}
      {state.status === 'ready' && !state.rows.length && (
        <EmptyState icon="🔎" title={query ? 'No matches' : 'No learners yet'}>{query ? 'Try a different search.' : 'Sign-ups will appear here.'}</EmptyState>
      )}

      {state.rows.length > 0 && (
        <div className={`learner-table${state.status === 'loading' ? ' is-loading' : ''}`} role="table" aria-label="Learners">
          <div className="learner-row learner-row--head" role="row">
            <span role="columnheader">Learner</span><span role="columnheader">Joined</span><span role="columnheader">Last practice</span>
            <span role="columnheader">Streak</span><span role="columnheader">Scenes</span><span role="columnheader">Debates</span>
            <span role="columnheader">Plan</span>
          </div>
          {state.rows.map(u => (
            <div key={u.id} className="learner-row" role="row">
              <span role="cell" className="learner-who">
                <span className="learner-avatar" aria-hidden="true">{(u.full_name || u.user_name || '?')[0].toUpperCase()}</span>
                <span className="learner-names">
                  <span className="learner-name">{u.full_name || u.user_name}
                    {u.is_admin && <span className="mini-badge">admin</span>}
                    {u.google && <span className="mini-badge mini-badge--g">Google</span>}
                  </span>
                  <span className="learner-email">{u.email}</span>
                </span>
              </span>
              <span role="cell" data-label="Joined">{formatDate(u.joined_at, { month: 'short', day: 'numeric' })}</span>
              <span role="cell" data-label="Last">{u.last_practice ? formatDate(u.last_practice, { month: 'short', day: 'numeric' }) : '—'}</span>
              <span role="cell" data-label="Streak">{u.current_streak ? `🔥 ${u.current_streak}` : '—'}</span>
              <span role="cell" data-label="Scenes">{u.scenes}</span>
              <span role="cell" data-label="Debates">{u.debates}</span>
              <span role="cell" data-label="Plan" className="learner-plan">
                <span className={`mini-badge${planLabel(u.plan).cls}`}>{planLabel(u.plan).text}</span>
                <button type="button" className="action-btn learner-manage" aria-expanded={open === u.id}
                  onClick={() => setOpen(open === u.id ? null : u.id)}>{open === u.id ? 'Close' : 'Manage'}</button>
              </span>
              {open === u.id && <LearnerActions u={u} onDone={load} />}
            </div>
          ))}
        </div>
      )}

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

// ── Page ────────────────────────────────────────────────────────────────────
export default function Admin() {
  usePageTitle('Admin')
  const [params, setParams] = useSearchParams()
  const tab = TABS.some(([k]) => k === params.get('tab')) ? params.get('tab') : 'overview'
  const setTab = (k) => setParams(k === 'overview' ? {} : { tab: k }, { replace: true })
  const [scenes, setScenes] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [planDate, setPlanDate] = useState(null)

  const load = useCallback(async () => {
    setLoadError('')
    try {
      const [s, a] = await Promise.all([api.get('/admin/schedule'), api.get('/admin/analytics')])
      setScenes(s.data || [])
      setAnalytics(a.data)
    } catch (err) {
      setLoadError(err.message)
    }
  }, [])
  useEffect(() => { load() }, [load])

  const gaps = useMemo(() => analytics?.runway.filter(d => !d.scenes).length || 0, [analytics])

  if (loadError) return <div className="container page"><ErrorState title="Couldn't load the admin panel" message={loadError} onRetry={load} /></div>
  if (!scenes || !analytics) return <LoadingState label="Loading admin…" />

  return (
    <div className="container page admin">
      <div className="admin-head">
        <div>
          <div className="section-label">Admin</div>
          <h1 className="page-title">SceneScribe control room</h1>
        </div>
        <Link to="/" className="btn-ghost btn-sm">View as learner →</Link>
      </div>

      <div className="seg admin-tabs" role="tablist" aria-label="Admin sections">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" role="tab" aria-selected={tab === k} className={tab === k ? 'seg-on' : ''} onClick={() => setTab(k)}>
            {label}{k === 'schedule' && gaps > 0 && <span className="tab-count" aria-label={`${gaps} empty days`}>{gaps}</span>}
          </button>
        ))}
      </div>

      {tab === 'overview' && <Overview data={analytics} onPlan={(d) => { setPlanDate(d); setTab('schedule') }} />}
      {tab === 'schedule' && (
        <Schedule scenes={scenes} today={analytics.today} runway={analytics.runway}
          planDate={planDate} setPlanDate={setPlanDate} reload={load} />
      )}
      {tab === 'learners' && <Learners />}
    </div>
  )
}
