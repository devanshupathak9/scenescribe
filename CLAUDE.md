# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository layout

Three independent top-level projects, no root-level tooling, no workspace/monorepo manager. Run every command from inside the relevant directory.

| Dir | What | Notes |
|---|---|---|
| `backend/` | Node/Express + Sequelize + Postgres REST API | Has its own `CLAUDE.md` — **read it before touching backend code** |
| `web/` | React 18 + Vite 6 SPA | The only shipped client. `web/README.md` documents structure and the debate state machine |
| `android/` | Native Android app | **Empty** — only a `.gitkeep` and an empty README |

`backend/SCENESCRIBE.md` is the original product spec. `backend/README.md` is the current API reference (kept in sync with the code). `DEPLOYMENT.md` covers Vercel + Railway.

## Commands

```bash
# Whole stack — web + API + Postgres (from the repo root)
docker compose up --build    # web :5173, API :3001; WEB_PORT/API_PORT override

# Backend (from backend/)
npm run dev                  # nodemon on :3001
npm test                     # Jest + Supertest; needs Postgres (TEST_DATABASE_URL, default scenescribe_test on localhost)

# Web (from web/)
npm run dev                  # Vite on :5173
npm run build                # → dist/ (CI runs this; there is no web test suite or linter)
```

CI (`.github/workflows/ci.yml`): backend tests against a Postgres service, web build, backend Docker build.

## Architecture

```
web (React SPA)
  └─ src/api.js ──HTTP──▶ backend Express (all routes under /api)
                            ├─ middleware/ (auth, rateLimit, errors)
                            ├─ routes/*.js (auth, dashboard, profile, admin, analyse, debate)
                            ├─ services/ (sentenceAnalysis, debate, ai, heuristics, streak, googleAuth…)
                            └─ models/ (Sequelize → Postgres, UUID PKs)
```

Web → Vercel (Root Directory `web`); backend → Railway (Root Directory `backend`, `railway.json`). The HTTP contract in `backend/README.md` is the integration boundary — there is no shared code or type checking across it, so a field rename in a route response silently breaks the matching page.

### The cross-cutting contract

1. **Response envelope.** `{ success: true, data, meta? }` or `{ success: false, error: { code, message, details? } }`. `web/src/api.js` throws `ApiError` with `.status` and `.code`; pages branch on `code` (e.g. `NO_SCENE`, `ALREADY_SUBMITTED`, `AI_UNAVAILABLE`).
2. **Auth.** JWT (7-day) issued only by `backend/src/services/tokens.js`. On the web, `auth/session.js` is the only code touching localStorage; `authService` methods all resolve to `{ user, token }`. Any 401 dispatches `AUTH_EXPIRED_EVENT` and `App.jsx` signs out.
3. **AI is optional.** No `OPENAI_API_KEY` → offline heuristic results with `source: 'estimate'`, labelled in the UI. Key set but call fails → `503 AI_UNAVAILABLE` and nothing is persisted. Never store placeholder scores.
4. **`VITE_API_URL` is an origin**, not a base path; inlined at build time.
5. **Postgres SSL** is auto-detected from the `DATABASE_URL` host (`DATABASE_SSL` overrides).

### Naming mismatch: `video_*` (API) vs `scene_*` (DB)

Routes expose a Scene as a **video** (`video_id`, `video_url`, `POST /dashboard/submit { video_id }`). Follow the convention of the layer you're in.

### `Scene.description` is the answer key

It is the AI's ground truth (`buildPrompt()` in `sentenceAnalysis.js`) and is **hidden from learners until they submit** for that scene. Learner-facing hints go in `additional_notes`, `vocabularies`, `grammars`.

### Multiple scenes per day

Up to 4 (`MAX_SCENES_PER_DAY` in `routes/admin.js`). `GET /dashboard/today` returns an array; keep it array-shaped. "Today" is computed in `APP_TIMEZONE`.

## Web gotchas

- Styling: tokens in `styles/global.css` `:root`; new work goes in `styles/app.css`. Auth page uses the `ap-*` prefix. Never put the `padding` shorthand on `.page` — it shares the element with `.container`.
- Mobile (≤640px) uses a bottom tab bar; inputs must stay ≥16px.
- Voice input uses the browser Web Speech API (Chrome/Edge/Safari) via `lib/speech.js`; there's always a typing fallback.
- `DebateArena.jsx` mirrors state in refs for timer/speech callbacks — update the ref synchronously when you change `phase`, `played` or `debate`.
