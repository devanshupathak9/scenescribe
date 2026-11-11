// Session persistence. The only module that touches the stored token/user, so
// moving to cookies or a provider SDK later is a change here and in api.js.

const TOKEN_KEY = 'token'
const USER_KEY = 'user'

export function loadSession() {
  try {
    const token = localStorage.getItem(TOKEN_KEY)
    const user = JSON.parse(localStorage.getItem(USER_KEY) || 'null')
    return token && user ? { token, user } : null
  } catch {
    return null
  }
}

export function saveSession(user, token) {
  try {
    if (token) localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(USER_KEY, JSON.stringify(user))
  } catch {
    // Private mode / storage disabled: the session lasts for this tab only.
  }
}

export function clearSession() {
  try {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(USER_KEY)
  } catch { /* ignore */ }
}
