import { useState, useEffect, useCallback, useMemo } from 'react'
import { api } from '../api.js'
import { LoadingState, ErrorState } from '../components/ui.jsx'

// Admin › Debate topics. While no topic is active, learners get the built-in
// list from the backend (data/debateTopics.js); this tab says so plainly.

const LEVELS = ['beginner', 'intermediate', 'advanced']
const MAX_POINTS = 6
const cap = (s) => s[0].toUpperCase() + s.slice(1)
const blank = { motion: '', category: '', level: 'intermediate', points_for: '', points_against: '' }
const toLines = (arr) => (arr || []).join('\n')
const fromLines = (s) => s.split('\n').map(l => l.trim()).filter(Boolean)

function TopicForm({ initial, categories, submitLabel, onSubmit, onCancel }) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => { setForm(f => ({ ...f, [k]: v })); setError('') }
  const id = (k) => `topic-${submitLabel.replace(/\W/g, '')}-${k}`

  async function submit(e) {
    e.preventDefault()
    const motion = form.motion.trim()
    if (motion.length < 8) return setError('Write the motion as a full statement (at least 8 characters).')
    const pf = fromLines(form.points_for); const pa = fromLines(form.points_against)
    if (pf.length > MAX_POINTS || pa.length > MAX_POINTS) return setError(`Up to ${MAX_POINTS} points per side.`)
    setSaving(true)
    try {
      await onSubmit({ motion, category: form.category.trim(), level: form.level, points_for: pf, points_against: pa })
    } catch (err) {
      setError(err.message)
      setSaving(false)
    }
  }

  const pointsField = (key, label, placeholder) => (
    <div className="form-field">
      <label className="field-label" htmlFor={id(key)}>{label} <span className="field-optional">optional · one per line</span></label>
      <textarea id={id(key)} className="field-input" rows={4} value={form[key]} onChange={e => set(key, e.target.value)} placeholder={placeholder} />
    </div>
  )

  return (
    <form onSubmit={submit} noValidate className="topic-form">
      {error && <div className="error-msg" role="alert">{error}</div>}
      <div className="form-field">
        <label className="field-label" htmlFor={id('motion')}>Motion</label>
        <input id={id('motion')} className="field-input" maxLength={200} value={form.motion}
          onChange={e => set('motion', e.target.value)} placeholder="e.g. Students should wear school uniforms" />
        <div className="field-hint">A statement someone can agree or disagree with.</div>
      </div>
      <div className="form-grid">
        <div className="form-field">
          <label className="field-label" htmlFor={id('cat')}>Category</label>
          <input id={id('cat')} className="field-input" maxLength={40} list={id('cats')} value={form.category}
            onChange={e => set('category', e.target.value)} placeholder="e.g. Education" />
          <datalist id={id('cats')}>{categories.map(c => <option key={c} value={c} />)}</datalist>
        </div>
        <div className="form-field">
          <label className="field-label" htmlFor={id('level')}>Lowest level</label>
          <select id={id('level')} className="field-input" value={form.level} onChange={e => set('level', e.target.value)}>
            {LEVELS.map(l => <option key={l} value={l}>{cap(l)}</option>)}
          </select>
        </div>
      </div>
      <div className="form-grid">
        {pointsField('points_for', 'Points for', 'Uniforms reduce peer pressure\nThey save families money')}
        {pointsField('points_against', 'Points against', 'They limit self-expression\nThey can be uncomfortable')}
      </div>
      <p className="field-hint">Learners see the points for the side they choose, as ideas to get started.</p>
      <div className="action-row action-row--end">
        {onCancel && <button type="button" className="btn-ghost" onClick={onCancel}>Cancel</button>}
        <button type="submit" className="btn-primary btn-auto" disabled={saving}>
          {saving ? <><span className="spinner" /> Saving…</> : submitLabel}
        </button>
      </div>
    </form>
  )
}

function TopicRow({ t, categories, onChanged }) {
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState('')
  const [err, setErr] = useState('')
  const run = async (key, fn) => {
    setBusy(key); setErr('')
    try { await fn(); onChanged() } catch (e) { setErr(e.message); setBusy('') }
  }

  if (editing) {
    return (
      <li className="topic-row topic-row--editing">
        <TopicForm categories={categories} submitLabel="Save topic"
          initial={{ ...t, points_for: toLines(t.points_for), points_against: toLines(t.points_against) }}
          onCancel={() => setEditing(false)}
          onSubmit={async (body) => { await api.patch(`/admin/topics/${t.id}`, body); setEditing(false); onChanged() }} />
      </li>
    )
  }

  return (
    <li className={`topic-row${t.is_active ? '' : ' topic-row--off'}`}>
      <div className="topic-row-main">
        <div className="topic-row-meta">
          <span className="tag">{t.category}</span>
          <span className="muted small">{cap(t.level)}+</span>
          {!t.is_active && <span className="tag tag--muted">Hidden</span>}
        </div>
        <div className="topic-row-motion">{t.motion}</div>
        <div className="muted small">
          {t.points_for.length || t.points_against.length
            ? `${t.points_for.length} for · ${t.points_against.length} against`
            : 'No talking points'}
        </div>
      </div>
      <div className="topic-row-actions">
        <button type="button" className="action-btn" disabled={!!busy}
          onClick={() => run('toggle', () => api.patch(`/admin/topics/${t.id}`, { is_active: !t.is_active }))}>
          {t.is_active ? 'Hide' : 'Show'}
        </button>
        <button type="button" className="action-btn" disabled={!!busy} onClick={() => setEditing(true)}>Edit</button>
        <button type="button" className="action-btn action-btn--del" disabled={!!busy}
          onClick={() => window.confirm(`Delete “${t.motion}”?`) && run('del', () => api.delete(`/admin/topics/${t.id}`))}>Delete</button>
      </div>
      {err && <div className="error-msg" role="alert">{err}</div>}
    </li>
  )
}

export default function AdminTopics() {
  const [data, setData] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [adding, setAdding] = useState(false)
  const [importing, setImporting] = useState(false)
  const [notice, setNotice] = useState('')

  const load = useCallback(async () => {
    setLoadError('')
    try { setData((await api.get('/admin/topics')).data) } catch (e) { setLoadError(e.message) }
  }, [])
  useEffect(() => { load() }, [load])

  const categories = useMemo(() => [...new Set([...(data?.topics || []), ...(data?.defaults || [])].map(t => t.category))].sort(), [data])
  const grouped = useMemo(() => {
    const m = new Map()
    for (const t of data?.topics || []) m.set(t.category, [...(m.get(t.category) || []), t])
    return [...m.entries()]
  }, [data])

  async function importDefaults() {
    setImporting(true); setNotice('')
    try {
      const r = await api.post('/admin/topics/import-defaults')
      setNotice(r.data.imported ? `Imported ${r.data.imported} built-in topics. Edit them or add points below.` : 'All built-in topics are already in your list.')
      await load()
    } catch (e) { setNotice(e.message) } finally { setImporting(false) }
  }

  if (loadError) return <ErrorState title="Couldn't load debate topics" message={loadError} onRetry={load} />
  if (!data) return <LoadingState label="Loading topics…" />

  const active = data.topics.filter(t => t.is_active).length

  return (
    <div className="admin-topics">
      <section className={`card topics-status${data.using_defaults ? ' topics-status--default' : ''}`}>
        <div>
          <div className="section-label">What learners see</div>
          {data.using_defaults
            ? <p><strong>The {data.defaults.length} built-in topics.</strong> Add or show at least one of your own and learners will see only yours.</p>
            : <p><strong>Your {active} active topic{active === 1 ? '' : 's'}.</strong> Hide them all to fall back to the built-in set.</p>}
        </div>
        <div className="action-row">
          <button type="button" className="btn-ghost btn-sm" onClick={importDefaults} disabled={importing}>
            {importing ? <><span className="spinner" /> Importing…</> : 'Import built-in topics'}
          </button>
          {!adding && <button type="button" className="btn-primary btn-auto btn-sm" onClick={() => setAdding(true)}>+ New topic</button>}
        </div>
      </section>
      {notice && <div className="estimate-notice" role="status">{notice}</div>}

      {adding && (
        <section className="card section">
          <h2 className="section-title">New debate topic</h2>
          <TopicForm initial={blank} categories={categories} submitLabel="Add topic" onCancel={() => setAdding(false)}
            onSubmit={async (body) => { await api.post('/admin/topics', body); setAdding(false); setNotice('Topic added.'); load() }} />
        </section>
      )}

      {grouped.length > 0 ? grouped.map(([cat, list]) => (
        <section key={cat} className="card section">
          <h2 className="section-title">{cat} <span className="muted small">{list.length}</span></h2>
          <ul className="topic-list">{list.map(t => <TopicRow key={t.id} t={t} categories={categories} onChanged={load} />)}</ul>
        </section>
      )) : (
        <section className="card section">
          <h2 className="section-title">Built-in topics <span className="muted small">read-only</span></h2>
          <p className="muted small">Import them to edit, hide or add talking points.</p>
          <ul className="topic-list">
            {data.defaults.map(t => (
              <li key={t.id} className="topic-row">
                <div className="topic-row-main">
                  <div className="topic-row-meta"><span className="tag">{t.category}</span><span className="muted small">{cap(t.level)}+</span></div>
                  <div className="topic-row-motion">{t.motion}</div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
