import { Component } from 'react'

// Catches render errors so one broken page doesn't blank the whole app.
export default class ErrorBoundary extends Component {
  state = { error: null }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    console.error('[ui] render error', error, info?.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    // A failed lazy chunk usually means a new deploy went out — reload fixes it.
    const isChunk = /dynamically imported module|Loading chunk|Failed to fetch/i.test(String(this.state.error?.message))
    return (
      <div className="container page">
        <div className="empty-state" role="alert">
          <div className="empty-icon" aria-hidden="true">⚠️</div>
          <h3>{isChunk ? 'A new version is available' : 'Something went wrong on this page'}</h3>
          <p>{isChunk ? 'Reload to get the latest SceneScribe.' : 'Try reloading. If it keeps happening, go back home.'}</p>
          <div className="empty-actions">
            <button type="button" className="btn-primary btn-auto" onClick={() => window.location.reload()}>Reload</button>
            <a className="btn-secondary" href="/">Go home</a>
          </div>
        </div>
      </div>
    )
  }
}
