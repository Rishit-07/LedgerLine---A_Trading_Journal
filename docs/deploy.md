# Deploying Ledgerline

Three parts: the static frontend, the Node API, and Postgres. Secrets live only in each host's environment settings, never in the repo or the image.

## 1. Database: Neon
Create a production database (separate from development). Run migrations 031, 032, 040, 050, 051 and 052, or `npm run db:migrate` with `DATABASE_URL` pointing at it.

## 2. API: a container or a Node host
The root `Dockerfile` builds only the API (`docker build -t ledgerline-api .`). It runs as a non-root user, listens on `0.0.0.0:8787`, and has a health check on `/api/health`. It has not been built in this repo's CI yet, so run one build and one start before relying on it. Hosts that build Node directly (Render, Railway) can skip Docker: build command `npm ci --omit=dev -w @ledgerline/backend`, start command `node backend/src/server.js`.

Run **one instance only**. The AI run lock, rate-limit fallback and notification streams are held in memory. Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` to share rate limits if you ever add a second one.

Required environment: `DATABASE_URL`, `FIREBASE_PROJECT_ID` (plus the Firebase admin credentials you already use locally), `APP_URL`, `PUBLIC_APP_URL`, `FIELD_ENCRYPTION_KEY`, `NEWSLETTER_SECRET`, `MENTOR_IP_HASH_KEY`, `REVIEWER_EMAIL`, an email sender (`RESEND_API_KEY` and `EMAIL_FROM` on your own domain), an AI key (`GROQ_API_KEY` or `OPENAI_API_KEY`), and the `COINPAYMENTS_*` values. Set `TRUST_PROXY=true` only when the API sits behind a proxy you control, and check that rate limits see real visitor addresses.

## 3. Frontend: Cloudflare Pages
Build `npm run build` with `SITE_URL=https://your-domain` (and `VITE_TURNSTILE_SITE_KEY` if you use Turnstile). Publish `frontend/dist`. It contains `_headers`, `_redirects` and `404.html`.

**/api must be forwarded to the API on the same address.** The browser calls `/api/...` on the site's own address, and the MetaTrader script and the CoinPayments webhook use that address too. Static Pages cannot forward to an outside server from `_redirects`, so add a small Pages Function (or Worker route) that passes `/api/*` to the API and forwards the visitor's address. This is not built yet.

## Free-tier note
A free host that sleeps (for example Render free) pauses the 5-minute maintenance (billing sweep, reminders, emails) while asleep. Payments still settle when it wakes. Move to an always-on host once money is coming in.

## Cloudflare bot checks
- **Turnstile** (code is in): create a widget in Cloudflare, put the site key in the frontend build as `VITE_TURNSTILE_SITE_KEY` and the secret on the API as `TURNSTILE_SECRET_KEY`. It protects the support and newsletter forms. Sign-up is handled by Firebase directly, so protect it with App Check (`APP_CHECK_ENFORCE`). If Cloudflare is unreachable the forms let people through.
- **Bot Fight Mode, WAF and rate-limit rules** are dashboard settings, available once the domain is proxied by Cloudflare. Do them after the first deploy.
