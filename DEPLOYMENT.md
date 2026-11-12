# Deploying SceneScribe

Web → **Vercel** · API + Postgres → **Railway**. Deploy the backend first: the web build needs its URL.

## 1. Backend on Railway

1. **New project → Deploy from GitHub repo** → pick this repo.
2. In the service **Settings → Source**, set **Root Directory = `backend`**. Railway picks up `backend/railway.json` (Dockerfile build, `/api/health` healthcheck).
3. **New → Database → PostgreSQL** in the same project.
4. In the API service **Variables**, add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference variable) |
| `NODE_ENV` | `production` |
| `JWT_SECRET` | 32+ random chars — `node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"` |
| `CORS_ORIGIN` | your Vercel URL(s), e.g. `https://scenescribe.vercel.app,https://scenescribe-*-yourteam.vercel.app` |
| `ADMIN_EMAIL` / `ADMIN_PASSWORD` | your admin login (password 12+ chars; only used to create the account). Forgot it? Set `ADMIN_RESET_PASSWORD=true` for one deploy, then remove it |
| `OPENAI_API_KEY` | enables real AI scoring, the AI debate opponent and debate reports |
| `APP_TIMEZONE` | `Asia/Kolkata` (when "today" rolls over for scenes and streaks) |
| `SMTP_HOST` `SMTP_PORT` `SMTP_USER` `SMTP_PASS` `EMAIL_FROM` | real OTP emails (without them, codes only appear in the Railway logs) |

5. **Settings → Networking → Generate Domain**. Check `https://<domain>/api/health` returns `{"success":true,...}`.

The server **refuses to start** in production with a weak `JWT_SECRET`, without `CORS_ORIGIN`, or with demo accounts enabled — check the deploy logs if the healthcheck fails.

## 2. Web on Vercel

1. **Add New → Project** → import the repo.
2. **Root Directory = `web`** (framework: Vite — `web/vercel.json` handles SPA rewrites, caching and security headers).
3. Environment variables (Production + Preview):

| Variable | Value |
|---|---|
| `VITE_API_URL` | Railway origin, e.g. `https://scenescribe-api.up.railway.app` — **no trailing slash, no `/api`** |
| `VITE_GOOGLE_CLIENT_ID` | optional; shows "Continue with Google" (see below) |

4. Deploy. `VITE_*` values are baked in at build time — **redeploy after changing them**.
5. Add the Vercel URL to Railway's `CORS_ORIGIN` if you hadn't yet.

## 3. Google sign-in (optional)

The frontend is complete; the backend has one function left to write.

1. Google Cloud Console → **APIs & Services → Credentials → Create OAuth client ID → Web application**.
2. **Authorised JavaScript origins**: your Vercel domain(s) and `http://localhost:5173`. (No redirect URI needed — popup mode.)
3. Set `VITE_GOOGLE_CLIENT_ID` on Vercel and `GOOGLE_CLIENT_ID` on Railway (same value).
4. Implement `verifyGoogleIdToken()` in `backend/src/services/googleAuth.js` — the file contains the exact code. Until then the button shows and `POST /api/auth/google` answers `501 GOOGLE_AUTH_NOT_CONFIGURED` with a friendly message.

## 4. After each deploy

- `GET /api/health` → `ai: true` once `OPENAI_API_KEY` is set.
- Sign in as the admin → **Admin** shows an "AI is off" banner if the key is missing.
- Schedule a scene for today, answer it as a normal user, run a 2-round debate.

## Notes

- **Schema changes** apply automatically on boot (`sequelize.sync({ alter: true })`). Once you introduce migrations, set `DB_SYNC_ALTER=false`.
- **Rate limits** are in-memory — correct for one Railway replica. Use a shared store before scaling out.
- **Speech** runs in the browser (Web Speech API): Chrome/Edge on desktop & Android, Safari on iOS. Other browsers fall back to typing.
- **CI** (`.github/workflows/ci.yml`) runs the backend tests against Postgres, builds the web app and the API image on every PR.

## Turning on Pro (Razorpay)

1. Razorpay dashboard → Subscriptions → Plans: create a monthly plan (₹149) and a yearly plan (₹999). Note both `plan_…` ids.
2. Account & Settings → API keys: generate a key pair (test mode first).
3. Webhooks → add `https://<your-api>/api/billing/webhook`, choose all `subscription.*` events, set a secret.
4. In Railway set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`, `RAZORPAY_PLAN_MONTHLY`, `RAZORPAY_PLAN_YEARLY`.
5. Test with a test-mode key, then switch to live keys and set `PREMIUM_ENABLED=true`. Until then every learner keeps full access.
