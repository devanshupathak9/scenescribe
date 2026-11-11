import { useState, useEffect, useCallback } from 'react'
import { useParams, Link } from 'react-router-dom'
import { api } from '../api.js'
import { formatDate } from '../lib/format.js'
import { usePageTitle } from '../lib/usePageTitle.js'
import { LoadingState, ErrorState, VideoEmbed, ScoreSummary, FeedbackCard, SentenceBlock } from '../components/ui.jsx'

export default function Feedback() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState(null)
  usePageTitle(data?.video?.title ? `Feedback · ${data.video.title}` : 'Feedback')

  const load = useCallback(() => {
    setError(null)
    setData(null)
    api.get(`/profile/history/${id}`)
      .then(res => setData(res.data))
      .catch(e => setError(e))
  }, [id])

  useEffect(() => { load() }, [load])

  if (error) {
    const notFound = error.status === 404
    return (
      <div className="container page">
        <ErrorState
          title={notFound ? 'Feedback not found' : "Couldn't load this feedback"}
          message={notFound ? 'It may have been removed, or the link is incorrect.' : error.message}
          onRetry={notFound ? undefined : load}
          action={<Link to="/profile" className="btn-secondary">← Back to profile</Link>} />
      </div>
    )
  }
  if (!data) return <LoadingState label="Loading feedback…" />

  const { video } = data

  return (
    <div className="container container--wide page">
      <Link to="/profile" className="back-link">← Profile</Link>
      <div className="page-header">
        <div>
          <div className="section-label">{formatDate(data.date, { month: 'long', day: 'numeric', year: 'numeric' })}</div>
          <h1 className="page-title">{video?.title}</h1>
        </div>
      </div>

      <div className="submission-split">
        <div className="submission-left">
          {video?.video_url && <VideoEmbed url={video.video_url} title={video.title} />}
          <ScoreSummary submission={data} />
        </div>

        <div className="submission-right">
          <FeedbackCard submission={data} />
          <div className="card">
            <div className="section-label card-heading">Reference answer</div>
            <SentenceBlock label="How our editors described it" text={video?.description} accent="var(--muted)" />
            <SentenceBlock label="Tips" text={video?.additional_notes} accent="#555566" />
          </div>
          <div className="action-row">
            <Link to="/profile" className="btn-secondary">← Back to profile</Link>
            <Link to="/" className="btn-primary btn-auto">Today&apos;s scenes</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
