// Google Identity Services (GIS) loader.
//
// Set VITE_GOOGLE_CLIENT_ID (a "Web application" OAuth client ID from Google
// Cloud Console, with your Vercel domain and http://localhost:5173 as
// Authorised JavaScript origins). Without it, the Google button is hidden.
//
// Flow: GIS renders the button → user picks an account → GIS calls back with an
// ID token (`credential`) → authService.loginWithGoogle(credential) → backend
// verifies it and returns our own session { user, token }.

export const GOOGLE_CLIENT_ID = (import.meta.env.VITE_GOOGLE_CLIENT_ID || '').trim()
export const isGoogleConfigured = () => Boolean(GOOGLE_CLIENT_ID)

const SRC = 'https://accounts.google.com/gsi/client'
let loader = null

export function loadGoogleIdentity() {
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id)
  if (loader) return loader
  loader = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src = SRC
    script.async = true
    script.defer = true
    script.onload = () => window.google?.accounts?.id
      ? resolve(window.google.accounts.id)
      : reject(new Error('Google sign-in failed to initialise'))
    script.onerror = () => {
      loader = null
      reject(new Error("Couldn't load Google sign-in. Check your connection or ad blocker."))
    }
    document.head.appendChild(script)
  })
  return loader
}

let initialisedWith = null
let currentHandler = null

// GIS only allows one initialize() per page; route callbacks through a handler
// that the mounted button can swap.
export async function initGoogle(onCredential) {
  const gis = await loadGoogleIdentity()
  currentHandler = onCredential
  if (initialisedWith !== GOOGLE_CLIENT_ID) {
    gis.initialize({
      client_id: GOOGLE_CLIENT_ID,
      callback: (resp) => currentHandler?.(resp.credential),
      ux_mode: 'popup',
      auto_select: false,
      cancel_on_tap_outside: true,
      itp_support: true,
    })
    initialisedWith = GOOGLE_CLIENT_ID
  }
  return gis
}

export function disableGoogleAutoSelect() {
  try { window.google?.accounts?.id?.disableAutoSelect() } catch { /* not loaded */ }
}
