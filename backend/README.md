# SceneScribe API

Node 22 · Express 4 · Sequelize 6 · Postgres 16 · OpenAI (optional)

```bash
cp .env.example .env          # set DATABASE_URL + JWT_SECRET at minimum
npm install
npm run dev                   # :3001, auto-restart
npm test                      # Jest + Supertest against TEST_DATABASE_URL
docker compose up --build     # API + Postgres together
```

Without `OPENAI_API_KEY` everything still works: scene scores and debate reports are produced by offline heuristics and returned with `source: "estimate"`, which the UI labels clearly. With a key, if an AI call fails the request returns `503 AI_UNAVAILABLE` and **nothing is recorded**, so learners can retry without losing their attempt.

Deployment: see [`../DEPLOYMENT.md`](../DEPLOYMENT.md). Every variable is documented in [`.env.example`](.env.example).

## Conventions

- All routes under `/api`. Every response is `{ success: true, data, meta? }` or `{ success: false, error: { code, message, details? } }`.
- Auth: `Authorization: Bearer <jwt>` (7 days). Admin routes also require `is_admin`.
- Malformed UUIDs in paths → `404`, never `500`. Rate limits → `429 RATE_LIMITED`.
- The HTTP layer calls a scene a **video** (`video_id`, `video_url`); the database calls it a **Scene**.

## Endpoints

### Auth — `/api/auth`
| Method | Path | Body | Notes |
|---|---|---|---|
| POST | `/register` | `{ email }` | Sends a 6-digit code (10 min). Re-call to resend. `409 EMAIL_IN_USE` |
| POST | `/verify` | `{ email, otp, user_name, password, full_name? }` | Completes signup → `{ token, user }`. 5 wrong codes → `OTP_LOCKED` |
| POST | `/login` | `{ email, password }` | → `{ token, user }`. `USE_GOOGLE` for Google-only accounts |
| POST | `/forgot` | `{ email }` | Always 200 (no account enumeration) |
| POST | `/reset` | `{ email, otp, password }` | → `{ token, user }` |
| POST | `/google` | `{ credential }` | Google ID token → `{ token, user }`. Signs in by Google ID, links a verified matching email, or creates the account. `401 GOOGLE_TOKEN_INVALID`, `403 GOOGLE_EMAIL_UNVERIFIED`, `501` without `GOOGLE_CLIENT_ID` |
| POST | `/unsubscribe` | Public. `{ token }` from a reminder email → turns `email_reminders` off. `400 INVALID_TOKEN` |
| GET | `/me` | — | Current user |

`user = { id, user_name, full_name, email, avatar_url, is_admin }`. Emails are case-insensitive; passwords 8–128 chars; usernames `[A-Za-z0-9_.]{3,30}`.

### Daily scenes — `/api/dashboard`
| Method | Path | Notes |
|---|---|---|
| GET | `/today` | `{ date, scenes: [{ status: 'pending'\|'submitted', video, submission? }] }`. `video.description` (the reference answer) is `null` until submitted. `404 NO_SCENE` when nothing is scheduled |
| POST | `/submit` | `{ video_id, response_text (10–2000), input_type: 'keyboard'\|'microphone' }` → submission + `reference_description` + `new_streak`. One graded attempt per scene (`409 ALREADY_SUBMITTED`) |
| GET | `/result/:submissionId` | Full submission with scene |

Submission: `{ submission_id, response_text, input_type, score, breakdown: { grammar, vocabulary, clarity }, feedback: { issues[], suggestions[], source }, improved_ai_response, ideal_sentence, date }` (scores 1–10).

### Profile — `/api/profile`
| Method | Path | Notes |
|---|---|---|
| GET | `/me` | `{ user, stats: { avg_score, highest_score, current_streak, longest_streak, total_completed, recent_scores[], debates_completed, debate_avg_score, debate_best_score } }` |
| PATCH | `/settings` | `{ email_reminders: bool }` → `{ user }` |
| POST | `/delete-account` | `{ confirm: "DELETE", password? }` (password required if the account has one). Deletes user, submissions, debates; cancels an active Razorpay subscription first. `403` for admins |
| GET | `/history?page=` | 10 per page, `meta: { total, page, pages }` |
| GET | `/history/:id` | Same shape as `/dashboard/result/:id` |

### Debate with AI — `/api/debate`
| Method | Path | Notes |
|---|---|---|
| GET | `/topics` | `{ topics: [{ id, motion, category, level, points_for[], points_against[] }], source: 'custom'\|'default', config }`. Admin topics when any are active, else the built-in list. `config: { turn_seconds: 40, transition_seconds: 10, min_rounds: 2, max_rounds: 5 }` |
| POST | `/` | `{ topic, side: 'for'\|'against', rounds, level }` → debate. FOR opens each round; if the AI is FOR its opening is included |
| GET | `/` | Completed debates (paginated) |
| GET | `/:id` | Debate with `turns[]`, `next_turn`, `report` |
| POST | `/:id/turns` | `{ turn_index, text, duration_s, input_type, metrics: { avg_confidence, long_pauses, low_confidence_words[] } }` → debate with the AI's reply appended. `ai_error` set if the AI failed (retry below) |
| POST | `/:id/ai-turn` | Retry the AI's turn |
| POST | `/:id/finish` | Evaluate → `report` (can end early once the learner has spoken) |

Report: `{ overall_score (0–100), cefr_level, summary, scores: { grammar, vocabulary, fluency, pronunciation, confidence } (each { score, comment }), strengths[], improvements[], mistakes[{ original, correction, explanation, category }], vocabulary_upgrades[], useful_phrases[], best_moment, next_steps[], metrics, source, ended_early }`.

Pronunciation is inferred from browser speech-recognition confidence — a proxy, not acoustic analysis.

### Admin — `/api/admin` (admin only)
| Method | Path | Notes |
|---|---|---|
| POST | `/schedule` | `{ date, title, video_url (YouTube), description, difficulty?, additional_notes?, vocabularies?[], grammars?[] }`. Max 4 per date |
| GET | `/schedule` · `/schedule/:date` | Scenes with vocabulary + grammar |
| PATCH | `/schedule/:id` | Any field above; passing `vocabularies`/`grammars` replaces the list |
| DELETE | `/schedule/:id` | `409 SCENE_HAS_SUBMISSIONS` once learners have answered it |
| GET | `/analytics` | `today`, totals, `active_today`/`active_7d`, `new_users_7d`, 14-day `activity[]`, 14-day `runway[]` + `first_gap`, `recent_activity[]` (scenes + debates), `system { ai_enabled, email_enabled, timezone }` |
| GET | `/topics` | `{ topics[] (with is_active), defaults[], using_defaults }` |
| POST | `/topics` | `{ motion (8–200), category?, level?, points_for?[], points_against?[] }` (≤6 points/side). `409 DUPLICATE_TOPIC` |
| POST | `/topics/import-defaults` | Copies the built-in list in (skips existing) → `{ imported }` |
| PATCH · DELETE | `/topics/:id` | Any create field plus `is_active`. Hide all → learners get the built-in list |
| GET | `/learners?q=&page=` | Registered learners (20/page, newest first), searchable by name, username or email; streak, scenes, debates, last practice |

### Billing — `/api/billing`
| Method | Path | Notes |
|---|---|---|
| GET | `/plans` | Public. `premium_enabled`, `checkout_enabled`, prices (INR), free limits |
| GET | `/me` | The caller's `plan` (also on every `user` payload) |
| POST | `/subscribe` | `{ plan: 'monthly' \| 'yearly' }` → `{ subscription_id, key_id, amount, prefill }` for Razorpay Checkout. `503 BILLING_DISABLED`, `409 ALREADY_PRO` |
| POST | `/verify` | Checkout response `{ razorpay_payment_id, razorpay_subscription_id, razorpay_signature }`; checked against the subscription stored for this user → Pro |
| POST | `/cancel` | Stops renewal; Pro lasts to the end of the paid period |
| POST | `/webhook` | Razorpay → us. Raw body, `X-Razorpay-Signature`. `subscription.activated/charged/resumed` extend `pro_until`; `cancelled/halted/completed/paused` record status |

`user.plan = { pro, source: 'beta'|'razorpay'|'admin'|'staff'|null, pro_until, plan, renews, premium_enabled }`. With `PREMIUM_ENABLED` off everyone is `pro: true, source: 'beta'`. Admins are always Pro. Free learners get `FREE_DEBATES_PER_WEEK` debates per rolling 7 days; past that `POST /debate` → `402 PRO_REQUIRED` with `details { feature, used, limit, resets_at }`.

Admin: `POST /admin/learners/:id/pro { days }` (0 revokes a granted plan) · `PATCH /admin/learners/:id { is_admin }` (can't demote yourself or the `ADMIN_EMAIL` owner).

### Other
- `POST /api/analyse/sentence` `{ sentence, video_id }` — practice scoring; nothing is saved.
- `GET /api/health` — liveness + DB check (Railway healthcheck).
