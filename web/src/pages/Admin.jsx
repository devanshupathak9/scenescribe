import { useState, useEffect, useCallback } from 'react'
import { api } from '../api.js'
import { formatDate, plural } from '../lib/format.js'
import { getYouTubeId } from '../lib/youtube.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { LoadingState, ErrorState, EmptyState } from '../components/ui.jsx'

const DIFFICULTIES = ['beginner', 'intermediate', 'advanced']
const MAX_PER_DAY = 4

const localToday = () => {
  const d = new Date()
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10)
}

const emptyForm = () => ({
  date: localToday(), title: '', video_url: '', description: '', difficulty: 'intermediate',
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

function Analytics({ data }) {
  if (!data) return null
  const items = [
    ['Learners', data.total_users], ['Submissions', data.total_submissions], ['Avg score', data.average_score],
    ['Scenes', data.total_scenes], ['Debates', data.total_debates],
  ]
  return (
    <>
      {!data.ai_enabled && (
        <div className="estimate-notice" role="note">
          <strong>AI is off.</strong> Set <code>OPENAI_API_KEY</code> on the backend — learners are currently getting estimated scores.
        </div>
      )}
      <div className="analytics-strip">
        {items.map(([label, value]) => (
          <div key={label} className="analytics-cell"><div className="stat-value">{value}</div><div className="stat-label">{label}</div></div>
        ))}
      </div>
    </>
  )
}

export default function Admin() {
  usePageTitle('Admin')
  const [scenes, setScenes] = useState(null)
  const [analytics, setAnalytics] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [formKey, setFormKey] = useState(0)
  const [flash, setFlash] = useState('')
  const [editId, setEditId] = useState(null)
  const [confirmId, setConfirmId] = useState(null)
  const [rowError, setRowError] = useState({})
  const [showPast, setShowPast] = useState(false)

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

  async function create(payload) {
    await api.post('/admin/schedule', payload)
    setFlash(`Scene scheduled for ${formatDate(payload.date)}.`)
    setFormKey(k => k + 1)
    load()
  }

  async function saveEdit(id, payload) {
    await api.patch(`/admin/schedule/${id}`, payload)
    setEditId(null)
    load()
  }

  async function remove(id) {
    try {
      await api.delete(`/admin/schedule/${id}`)
      setConfirmId(null)
      setScenes(prev => prev.filter(s => s.video_id !== id))
    } catch (err) {
      setConfirmId(null)
      setRowError(e => ({ ...e, [id]: err.message }))
    }
  }

  if (loadError) return <div className="container page"><ErrorState title="Couldn't load the admin panel" message={loadError} onRetry={load} /></div>
  if (!scenes) return <LoadingState label="Loading schedule…" />

  const today = localToday()
  const visible = scenes.filter(s => showPast || s.date >= today)
  const grouped = visible.reduce((acc, s) => ((acc[s.date] ||= []).push(s), acc), {})
  const dates = Object.keys(grouped).sort((a, b) => (showPast ? b.localeCompare(a) : a.localeCompare(b)))
  const pastCount = scenes.filter(s => s.date < today).length

  return (
    <div className="container page">
      <h1 className="page-title">Admin</h1>
      <Analytics data={analytics} />

      <section className="card section">
        <h2 className="section-label card-heading">Schedule a scene</h2>
        {flash && <div className="success-msg" role="status">✓ {flash}</div>}
        <SceneForm key={formKey} initial={emptyForm()} submitLabel="+ Add scene" onSubmit={create} />
      </section>

      <section className="section" aria-labelledby="schedule-heading">
        <div className="section-row">
          <h2 id="schedule-heading" className="section-label">{showPast ? 'All scenes' : 'Upcoming schedule'}</h2>
          {pastCount > 0 && (
            <button type="button" className="btn-ghost btn-sm" onClick={() => setShowPast(p => !p)}>
              {showPast ? 'Hide past' : `Show past (${pastCount})`}
            </button>
          )}
        </div>

        {!dates.length && (
          <EmptyState icon="📅" title="Nothing scheduled">Use the form above to schedule upcoming scenes.</EmptyState>
        )}

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
                  <div className="scene-count-badge">{day.length} / {MAX_PER_DAY}</div>
                </div>

                {day.map((item, i) => (
                  <div key={item.video_id} className="schedule-row schedule-row--nested">
                    <div className="scene-number">#{i + 1}</div>
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
