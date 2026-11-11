import { useEffect, useRef, useState } from 'react'
import { initGoogle, isGoogleConfigured } from '../auth/google.js'
import { authService } from '../auth/authService.js'

/**
 * "Continue with Google" button. Renders nothing when VITE_GOOGLE_CLIENT_ID is
 * not set, so it can ship before the backend half is ready.
 *
 * Props:
 *   onSuccess({ user, token })  — same shape as every other sign-in path
 *   onError(message)
 *   text — 'continue_with' | 'signin_with' | 'signup_with'
 */
export default function GoogleSignInButton({ onSuccess, onError, text = 'continue_with' }) {
  const ref = useRef(null)
  const [state, setState] = useState('loading') // loading | ready | busy | failed
  const handlers = useRef({ onSuccess, onError })
  handlers.current = { onSuccess, onError }

  useEffect(() => {
    if (!isGoogleConfigured()) return
    let cancelled = false

    async function handleCredential(credential) {
      setState('busy')
      try {
        const session = await authService.loginWithGoogle(credential)
        if (!cancelled) handlers.current.onSuccess?.(session)
      } catch (err) {
        if (!cancelled) {
          setState('ready')
          handlers.current.onError?.(err.message)
        }
      }
    }

    initGoogle(handleCredential)
      .then((gis) => {
        if (cancelled || !ref.current) return
        const width = Math.min(400, Math.max(200, ref.current.offsetWidth || 320))
        gis.renderButton(ref.current, {
          type: 'standard', theme: 'filled_black', size: 'large', shape: 'pill',
          text, logo_alignment: 'center', width,
        })
        setState('ready')
      })
      .catch((err) => {
        if (cancelled) return
        setState('failed')
        handlers.current.onError?.(err.message)
      })

    return () => { cancelled = true }
  }, [text])

  if (!isGoogleConfigured()) return null

  return (
    <div className="google-signin" aria-busy={state === 'busy'}>
      <div ref={ref} className="google-signin-slot" hidden={state === 'failed'} />
      {state === 'loading' && <div className="google-signin-placeholder" aria-hidden="true" />}
      {state === 'busy' && (
        <div className="google-signin-busy" role="status"><span className="spinner" /> Signing in with Google…</div>
      )}
      <div className="ap-divider" role="separator"><span>or use email</span></div>
    </div>
  )
}
