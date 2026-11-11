# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev                  # nodemon :3001
npm start                    # plain node
npm test                     # Jest + Supertest (runInBand) against TEST_DATABASE_URL
docker compose up --build    # API + Postgres
```

Tests (`tests/*.test.js`) recreate the schema with `sync({ force: true })` on a dedicated test database — never point `TEST_DATABASE_URL` at real data. `tests/env.js` forces `NODE_ENV=test` (rate limits off, no AI key, OTP emails silent). Add a test for every bug you fix.

## Configuration

All behaviour-affecting env vars are read in `src/config/env.js`; `validateEnv()` runs before anything else in `src/index.js` and **refuses to start** in production with a weak `JWT_SECRET`, no `CORS_ORIGIN`, or demo accounts on. Full list with comments: `.env.example`.

- `SEED_DEMO_ACCOUNTS` (default on outside production): `xyz@gmail.com / xyz@12345` (admin) and `abc@gmail.com / abc@12345`, passwords reset every boot.
- `ADMIN_EMAIL` / `ADMIN_PASSWORD`: real admin, created once and promoted every boot (password never reset).
- `APP_TIMEZONE`: the calendar day for "today" and streaks (`utils/date.js`). `process.env.TZ` is still forced to UTC.
- No `OPENAI_API_KEY` is fine (see AI below).

## Architecture

`src/index.js` (boot: validate env → sync DB → seed → listen, graceful SIGTERM) → `src/app.js` (`createApp()`: helmet, CORS allowlist, JSON, rate limits, routes, 404 + error handler). Tests import `createApp()` directly.

```
routes/          auth · dashboard · profile · admin · analyse · debate   (+ serializers.js for shared shapes)
middleware/      auth (authenticate, requireAdmin) · rateLimit · errors
services/        ai (lazy OpenAI client, AiUnavailableError) · sentenceAnalysis · debate · heuristics
                 streak · tokens · googleAuth · email · seed
utils/           http (ok/fail/asyncHandler/isUuid/requireUuidParam/isDateString) · date
data/            debateTopics.js
```

Write handlers with `asyncHandler` and return via `ok()` / `fail()`; thrown errors become the JSON envelope in `middleware/errors.js`. Guard `:id` params with `requireUuidParam` so malformed ids are 404s.

## Key patterns and gotchas

**AI results.** `analyseSentence()` and `evaluateDebate()` return `source: 'ai' | 'estimate'`. No key → `services/heuristics.js` estimate. Key set but call fails → `AiUnavailableError`; routes respond `503 AI_UNAVAILABLE` and must not persist a score (`/dashboard/submit` marks the claim `failed` so the learner can retry). Overall scores are recomputed server-side from the category weights.

**One graded attempt per scene.** `/dashboard/submit` claims the (user, scene) slot inside a transaction that row-locks the user, then calls the AI *outside* the transaction, then finalises + updates the streak in a second short transaction. Don't hold a DB transaction across an AI call (pool size is small).

**Answer key.** `Scene.description` is the reference answer: `/dashboard/today` returns it as `null` until the learner has submitted.

**Streaks.** Stored `curr_streak` only changes on submission; read it through `effectiveStreak()` (returns 0 after a missed day).

**Two-step registration.** `POST /auth/register` creates a pending user (`is_registered: false`, null username/password). OTPs carry `otp_purpose` (`register` | `reset`) and `otp_attempts` (5 max). Look users up by email with the case-insensitive `byEmail()` helper — legacy rows may have mixed case. Google-only users have no `password_hash`.

**Password hashing.** The `User` `beforeCreate` hook hashes `password_hash` if set; whenever you set an already-hashed value pass `{ hooks: false }`.

**Debates.** Turn order: FOR opens every round (`services/debate.js` `turnPlan`). `POST /debate/:id/turns` takes `turn_index` to reject double submits; the AI reply is appended in a separate transaction that re-checks the turn count. AI turns are capped by word budget so TTS fits in 40s.

**Google sign-in.** `routes/auth.js` `/google` is complete except `services/googleAuth.js#verifyGoogleIdToken`, which currently throws `501 GOOGLE_AUTH_NOT_CONFIGURED`. Its docblock has the implementation.

**Admin delete.** Refused (`409 SCENE_HAS_SUBMISSIONS`) once anyone has answered the scene — deleting would erase history.

**Schema.** `sequelize.sync({ alter: DB_SYNC_ALTER })` on boot; no migrations yet.

**Response envelope:** `{ success: true, data, meta? }` / `{ success: false, error: { code, message, details? } }`. Keep it.
