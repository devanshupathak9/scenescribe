import { NavLink, useNavigate } from 'react-router-dom'
import { LogoMark, Wordmark } from './Logo.jsx'

const Icon = {
  today: <path d="M4 5h16v14H4zM4 9h16M9 3v4M15 3v4" />,
  debate: <><path d="M4 5h11v8H8l-4 3z" /><path d="M15 9h5v8l-3-2h-6v-2" /></>,
  profile: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  admin: <><path d="M12 3l8 4v5c0 5-3.5 8-8 9-4.5-1-8-4-8-9V7z" /></>,
  logout: <><path d="M15 4h4v16h-4" /><path d="M10 16l-4-4 4-4M6 12h10" /></>,
}

function NavIcon({ name }) {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{Icon[name]}</svg>
  )
}

export default function Navbar({ user, onLogout }) {
  const navigate = useNavigate()

  function handleLogout() {
    onLogout()
    navigate('/login')
  }

  const links = [
    { to: '/', label: 'Today', icon: 'today', end: true },
    { to: '/debate', label: 'Debate', icon: 'debate' },
    { to: '/profile', label: 'Profile', icon: 'profile' },
    ...(user?.is_admin ? [{ to: '/admin', label: 'Admin', icon: 'admin' }] : []),
  ]
  const cls = ({ isActive }) => `nav-pill${isActive ? ' nav-pill--active' : ''}`

  return (
    <>
      <header className="navbar">
        <div className="navbar-inner">
          <NavLink to="/" className="navbar-logo" aria-label="SceneScribe home">
            <LogoMark size={30} />
            <Wordmark />
          </NavLink>

          <nav className="navbar-links" aria-label="Main">
            {links.map(l => <NavLink key={l.to} to={l.to} end={l.end} className={cls}>{l.label}</NavLink>)}
          </nav>

          {user?.plan?.premium_enabled && (user.plan.pro
            ? <NavLink to="/pricing" className="pro-chip pro-chip--on" aria-label="Your Pro plan">PRO</NavLink>
            : <NavLink to="/pricing" className="pro-chip">Go Pro</NavLink>)}

          <button type="button" className="btn-logout" onClick={handleLogout} aria-label="Sign out">
            <span className="btn-logout-text">Sign out</span>
            <span className="btn-logout-icon"><NavIcon name="logout" /></span>
          </button>
        </div>
      </header>

      {/* Mobile: thumb-reachable tab bar */}
      <nav className="tabbar" aria-label="Main">
        {links.map(l => (
          <NavLink key={l.to} to={l.to} end={l.end} className={({ isActive }) => `tabbar-item${isActive ? ' tabbar-item--active' : ''}`}>
            <NavIcon name={l.icon} />
            <span>{l.label}</span>
          </NavLink>
        ))}
      </nav>
    </>
  )
}
