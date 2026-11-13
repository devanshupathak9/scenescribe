import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { useState, useEffect, useCallback, lazy, Suspense } from 'react'
import AuthPage from './pages/AuthPage.jsx'
import Home from './pages/Home.jsx'
import Navbar from './components/Navbar.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import { LoadingState } from './components/ui.jsx'
import { AUTH_EXPIRED_EVENT } from './api.js'
import { authService } from './auth/authService.js'
import { loadSession, saveSession, clearSession } from './auth/session.js'
import { disableGoogleAutoSelect } from './auth/google.js'

// Route-level code splitting: the debate engine and admin panel aren't needed
// for the first paint of the daily scene.
const Feedback = lazy(() => import('./pages/Feedback.jsx'))
const Pricing = lazy(() => import('./pages/Pricing.jsx'))
const ScenePage = lazy(() => import('./pages/ScenePage.jsx'))
const Profile = lazy(() => import('./pages/Profile.jsx'))
const Admin = lazy(() => import('./pages/Admin.jsx'))
const DebateHub = lazy(() => import('./pages/debate/DebateHub.jsx'))
const DebateArena = lazy(() => import('./pages/debate/DebateArena.jsx'))
const DebateReport = lazy(() => import('./pages/debate/DebateReport.jsx'))
const Privacy = lazy(() => import('./pages/Legal.jsx').then(m => ({ default: m.Privacy })))
const Terms = lazy(() => import('./pages/Legal.jsx').then(m => ({ default: m.Terms })))

function RequireAuth({ user, admin = false, children }) {
  const location = useLocation()
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (admin && !user.is_admin) return <Navigate to="/" replace />
  return children
}

function ScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])
  return null
}

export default function App() {
  const [user, setUser] = useState(() => loadSession()?.user || null)

  const login = useCallback((userData, token) => {
    saveSession(userData, token)
    setUser(userData)
  }, [])

  const logout = useCallback(() => {
    clearSession()
    disableGoogleAutoSelect()
    setUser(null)
  }, [])

  const refreshUser = useCallback(() => authService.me().then(fresh => { saveSession(fresh); setUser(fresh); return fresh }), [])

  // Any 401 from the API means the stored session is no longer valid.
  useEffect(() => {
    const onExpired = () => logout()
    window.addEventListener(AUTH_EXPIRED_EVENT, onExpired)
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, onExpired)
  }, [logout])

  // Refresh the cached user once per load (role or name may have changed).
  const signedIn = Boolean(user)
  useEffect(() => {
    if (!signedIn) return
    authService.me()
      .then(fresh => { saveSession(fresh); setUser(fresh) })
      .catch(() => { /* 401 handled by the event; offline keeps the cached user */ })
  }, [signedIn])

  return (
    <BrowserRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <ScrollToTop />
      <a href="#main" className="skip-link">Skip to content</a>
      {user && <Navbar user={user} onLogout={logout} />}
      <div id="main" className={user ? 'main-content' : ''}>
        <ErrorBoundary>
          <Suspense fallback={<LoadingState />}>
            <Routes>
              <Route path="/" element={user ? <Home user={user} /> : <AuthPage onLogin={login} initialTab="register" />} />
              <Route path="/login" element={user ? <Navigate to="/" replace /> : <AuthPage onLogin={login} initialTab="signin" />} />
              <Route path="/register" element={user ? <Navigate to="/" replace /> : <AuthPage onLogin={login} initialTab="register" />} />

              <Route path="/scene/:id" element={<RequireAuth user={user}><ScenePage /></RequireAuth>} />
              <Route path="/feedback/:id" element={<RequireAuth user={user}><Feedback /></RequireAuth>} />
              <Route path="/profile" element={<RequireAuth user={user}><Profile user={user} /></RequireAuth>} />
              <Route path="/debate" element={<RequireAuth user={user}><DebateHub /></RequireAuth>} />
              <Route path="/debate/:id/live" element={<RequireAuth user={user}><DebateArena /></RequireAuth>} />
              <Route path="/debate/:id" element={<RequireAuth user={user}><DebateReport /></RequireAuth>} />
              <Route path="/pricing" element={<RequireAuth user={user}><Pricing user={user} onUserUpdate={refreshUser} /></RequireAuth>} />
              <Route path="/admin" element={<RequireAuth user={user} admin><Admin /></RequireAuth>} />
              <Route path="/privacy" element={<Privacy />} />
              <Route path="/terms" element={<Terms />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Suspense>
        </ErrorBoundary>
      </div>
    </BrowserRouter>
  )
}
