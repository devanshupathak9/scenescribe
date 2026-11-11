// VITE_API_URL is the backend origin (e.g. http://localhost:3001 in dev,
// https://your-backend.up.railway.app in production) — no trailing slash, no /api.
// Unset, requests go to a relative /api (Vite proxies it in dev).
const ORIGIN = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '').replace(/\/api$/, '')
const BASE = `${ORIGIN}/api`

const DEFAULT_TIMEOUT_MS = 30_000

// Never attach the auth token to these endpoints
const PUBLIC_PATHS = ['/auth/login', '/auth/register', '/auth/verify', '/auth/forgot', '/auth/reset', '/auth/google']

// Dispatched when the server rejects our session; App.jsx listens and signs out.
export const AUTH_EXPIRED_EVENT = 'scenescribe:auth-expired'

export class ApiError extends Error {
  constructor(message, { status = 0, code = 'NETWORK_ERROR', details } = {}) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

function getToken() {
  try { return localStorage.getItem('token') } catch { return null }
}

async function request(method, path, body, { timeout = DEFAULT_TIMEOUT_MS, signal } = {}) {
  const headers = { Accept: 'application/json' }
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getToken()
  const isPublic = PUBLIC_PATHS.includes(path)
  if (token && !isPublic) headers.Authorization = `Bearer ${token}`

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(new DOMException('Timeout', 'TimeoutError')), timeout)
  const onAbort = () => controller.abort(signal.reason)
  signal?.addEventListener('abort', onAbort, { once: true })

  let res
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: controller.signal,
    })
  } catch (err) {
    if (signal?.aborted) throw new ApiError('Request cancelled', { code: 'ABORTED' })
    if (controller.signal.aborted) {
      throw new ApiError('The server is taking too long to respond. Please try again.', { code: 'TIMEOUT' })
    }
    throw new ApiError(
      navigator.onLine === false ? "You're offline. Check your connection and try again." : "Can't reach SceneScribe right now. Please try again.",
      { code: 'NETWORK_ERROR' },
    )
  } finally {
    clearTimeout(timer)
    signal?.removeEventListener('abort', onAbort)
  }

  const text = await res.text()
  let data = {}
  try {
    data = text ? JSON.parse(text) : {}
  } catch {
    throw new ApiError(`Unexpected response from the server (${res.status}).`, { status: res.status, code: 'BAD_RESPONSE' })
  }

  if (!res.ok || data.success === false) {
    if (res.status === 401 && !isPublic) {
      window.dispatchEvent(new CustomEvent(AUTH_EXPIRED_EVENT))
    }
    const err = data.error || {}
    throw new ApiError(
      (typeof err === 'string' ? err : err.message) || `Request failed (${res.status})`,
      { status: res.status, code: err.code || `HTTP_${res.status}`, details: err.details },
    )
  }
  return data
}

export const api = {
  get:    (path, opts)       => request('GET',    path, undefined, opts),
  post:   (path, body, opts) => request('POST',   path, body ?? {}, opts),
  patch:  (path, body, opts) => request('PATCH',  path, body ?? {}, opts),
  delete: (path, opts)       => request('DELETE', path, undefined, opts),
}
