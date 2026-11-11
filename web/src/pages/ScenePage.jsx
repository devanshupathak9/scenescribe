import { useState, useEffect, useCallback } from 'react'
import { Link, useParams } from 'react-router-dom'
import { api } from '../api.js'
import { formatDate } from '../lib/format.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { LoadingState, ErrorState } from '../components/ui.jsx'
import SceneSession from '../components/SceneSession.jsx'
import { CatchUp } from '../components/KeepPractising.jsx'

// A single past scene, opened from "Catch up".
export default function ScenePage() {
  const { id } = useParams()
  const [state, setState] = useState({ status: 'loading' })
  usePageTitle(state.scenes?.[0]?.video.title || 'Scene')

  const load = useCallback(() => {
    setState({ status: 'loading' })
    api.get(`/dashboard/scene/${id}`)
      .then(r => setState({ status: 'ready', scenes: r.data.scenes }))
      .catch(e => setState({ status: 'error', error: e.message, notFound: e.status === 404 }))
  }, [id])

  useEffect(() => { load() }, [load])

  if (state.status === 'loading') return <LoadingState label="Loading scene…" />
  if (state.status === 'error') {
    return (
      <div className="container page">
        <ErrorState title={state.notFound ? 'Scene not found' : "Couldn't load this scene"} message={state.notFound ? 'It may not be published yet.' : state.error}
          onRetry={state.notFound ? undefined : load} action={<Link to="/" className="btn-secondary btn-auto">Back to Today</Link>} />
      </div>
    )
  }

  const { video } = state.scenes[0]
  return (
    <div className="container page">
      <Link to="/" className="back-link">← Today</Link>
      <SceneSession
        key={id + state.scenes[0].status}
        initialScenes={state.scenes}
        onReload={load}
        kicker={video.date ? `Catch-up · ${formatDate(video.date, { weekday: 'short', month: 'short', day: 'numeric' })}` : 'Catch-up'}
        title="Practise this scene"
        renderFooter={({ allDone }) => allDone && <div className="keep-practising"><CatchUp exclude={[id]} /></div>}
      />
    </div>
  )
}
