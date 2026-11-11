# SceneScribe — Web App

React 18 · Vite 6 · React Router 6 · plain CSS. Deploys to Vercel (Root Directory = `web`).

```bash
cp .env.example .env     # VITE_API_URL (or leave unset to use the dev proxy)
npm install
npm run dev              # :5173, proxies /api → VITE_PROXY_TARGET || VITE_API_URL || :3001
npm run build            # → dist/
```

| Variable | Purpose |
|---|---|
| `VITE_API_URL` | Backend **origin** — no trailing slash, no `/api`. Inlined at build time |
| `VITE_GOOGLE_CLIENT_ID` | Shows "Continue with Google". Empty = button hidden |
| `VITE_PROXY_TARGET` | Dev only: proxy target when it differs from `VITE_API_URL` (Docker) |

## Structure

```
src/
  api.js                 fetch wrapper: envelope parsing, ApiError {status, code}, timeouts,
                         fires AUTH_EXPIRED_EVENT on 401 (App signs out)
  auth/
    session.js           token + user persistence (the only localStorage access)
    authService.js       login / signup / reset / Google — all resolve to { user, token }
    google.js            Google Identity Services loader
  components/
    ui.jsx               ScoreRing, ScoreSummary, FeedbackCard, VideoEmbed, Loading/Error/Empty states…
    Navbar.jsx           top nav (desktop) + bottom tab bar (≤640px)
    GoogleSignInButton.jsx
    ErrorBoundary.jsx
  lib/
    speech.js            Web Speech API wrapper (auto-restart, pace/pause/confidence metrics)
    tts.js               speechSynthesis wrapper (sentence chunking, voice choice)
    youtube.js format.js usePageTitle.js
  pages/
    AuthPage.jsx         register → verify → done · sign in · forgot password
    Home.jsx             today's scenes, learning aids, submit, results
    Feedback.jsx         one past submission
    Profile.jsx          stats, sparkline, history
    Admin.jsx            schedule scenes (vocab + grammar editors), analytics
    debate/DebateHub.jsx      setup + past debates
    debate/DebateArena.jsx    live debate state machine
    debate/DebateReport.jsx   speaking report
  styles/global.css      design tokens (:root) + original components
  styles/app.css         utilities, responsive shell, new components, debate
```

## Routes

| Path | Page |
|---|---|
| `/` | Auth (signed out) or today's scenes |
| `/login`, `/register` | Auth on a specific tab |
| `/debate` | Debate setup + history |
| `/debate/:id/live` | Live debate |
| `/debate/:id` | Debate report |
| `/profile`, `/feedback/:id` | Stats, history, past feedback |
| `/admin` | Admin only |

Pages other than Home and Auth are lazy-loaded.

## Debate flow (`DebateArena.jsx`)

`intro → [transition 10s → user 40s | ai 40s]* → finishing → /debate/:id`

- The learner's turn is POSTed as soon as it ends; the AI reply is generated **during** the 10-second transition, hiding latency. If it isn't back yet the stage shows "thinking…".
- Speech: `lib/speech.js` (Chrome/Edge/Safari). Mic blocked or unsupported → typing fallback for that turn.
- AI voice: `lib/tts.js`; can be muted (then the AI turn is read on screen).
- Refs mirror state (`phaseRef`, `playedRef`, `debateRef`) because timer and speech callbacks fire outside React's render cycle — update the ref synchronously whenever you change one of these.

## Conventions

- Every page handles loading, error (with retry) and empty states using the `ui.jsx` components.
- Styling: change tokens in `:root` first. The auth page is isolated under `ap-*`.
- Mobile: ≤640px uses the bottom tab bar; inputs are 16px to stop iOS zooming in.
- `vercel.json` rewrites every path to `index.html` — required for deep links like `/feedback/:id`.
