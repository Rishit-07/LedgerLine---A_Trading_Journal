# Security review and how to strengthen it

Second pass after `AUDIT_REPORT.md`. This one looked at who can reach what, not only at settings.

## Checked and found sound
- **Access control:** every query that reads or changes a trade, screenshot, plan or group is scoped by the signed-in `uid`. I found no query by id alone. Reviewer actions require a verified email, the reviewer address and a server-held claim.
- **Uploads:** images are decoded and re-encoded server side (`sharp`, pixel limit, format check), so a disguised file is not stored as sent.
- **Money:** payment webhooks verify a signature and record each event id once, so replays do nothing. Checkout links must start with `https://`.
- **Links and HTML:** links from other people are only shown when they pass `validLink`. The portfolio has no user-supplied link fields. Page code builds HTML only from fixed strings.
- **Email:** support form rejects line breaks in the subject, so headers cannot be injected.
- **CORS:** none is sent; the API only answers the same origin.

## Fixed in this branch
- Sign-ins are now checked for **revocation** on every change and on data export, so a stolen or deleted session stops working at once. Plain reads skip the extra check for speed.
- The reviewer address can be set with `REVIEWER_EMAIL` instead of editing source (same default as before).
- Sign-up now asks for passwords of **10+ characters** (was 6). Firebase still enforces its own minimum; raise it in the console too.
- `.env.example` documents `REVIEWER_EMAIL` and `TRUST_PROXY`.

## Known and left as is
- `npm audit` reports 12 findings, all in Firestore, Cloud Storage and gRPC code that the app does not use (it uses Firebase Auth only). Pinning newer versions with `overrides` did not resolve cleanly here, so I reverted it. Fix by upgrading `firebase` and `firebase-admin` to their next major versions in a branch and running the tests.

## How to strengthen it, in order of value
1. **Two-step sign-in for the reviewer account.** One email controls mentor approvals. Turn on Firebase multi-factor sign-in (authenticator app) and require it for that account.
2. **Firebase App Check** with reCAPTCHA, to stop bots creating accounts and calling the API. Also turn on email enumeration protection and a password policy in Firebase Authentication settings.
3. **A database role with fewer rights.** The app should connect as a role that can read and write rows but not drop or alter tables. Use a separate role for migrations. Restrict Neon access to your host's addresses.
4. **Website headers at your host:** Content-Security-Policy, Strict-Transport-Security, Permissions-Policy, Referrer-Policy. A Cloudflare-style layer in front also gives bot filtering and shared rate limits across servers.
5. **Rate limits that survive restarts and several servers** (Redis or your host's limiter). The built-in limiter is per process.
6. **Watch it.** Add error tracking (Sentry) and alerts for spikes in 429, 401 and 5xx. Log reviewer actions to a table.
7. **Defence in depth in Postgres:** row-level security on user tables, and column encryption for billing addresses and GSTIN numbers.
8. **Automate the checks:** Dependabot or Renovate, `npm audit` and secret scanning (gitleaks) in CI, CodeQL, and required reviews on `main`.
9. **Secrets:** a different key set for development and production, stored in the host's secret manager, rotated on a schedule and whenever someone leaves.
10. **A short incident plan:** who to call, how to revoke all sessions (`auth.revokeRefreshTokens`), how to rotate keys, how to restore from backup, and what to tell users within 72 hours if personal data leaks.

## Added afterwards (branch `security-hardening-3`)
- **Reviewer audit log:** every mentor decision is written to `admin_audit_log` (migration `025`), which cannot be edited or deleted.
- **Least-privilege database role:** `database/roles.sql` creates `ledgerline_app` (read and write rows only). Run it once, then point `DATABASE_URL` at that role. Migrations keep using the owner.
- **Sign someone out everywhere:** `npm run revoke-sessions --workspace @ledgerline/backend -- <uid or email>`. Needs a Firebase service account (`FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`) or Google application default credentials.
- **Automatic checks:** `.github/workflows/ci.yml` runs tests, the build, a dependency audit and secret scanning on every pull request. `codeql.yml` scans the code weekly. `dependabot.yml` opens update pull requests.
- **Incident plan:** `INCIDENT_PLAN.md`.

Still needs an account or console setting from you: two-step sign-in and App Check in Firebase, website security headers at your host, a shared rate-limit store, error tracking, and column encryption.

## Added in `security-hardening-4`: the rest of the list, code side

All of these are off or harmless until you set the matching switch, so merging does not change behaviour by itself.

### Two-step sign-in (2FA) with an authenticator app, free, for everyone
Checked by our own server, so it needs **no Firebase upgrade, no billing and no domain**.

**For people using the app:** Settings has a "Two-step sign-in" section. They scan a QR code with Google Authenticator, Authy or 1Password, confirm one code, and are shown 8 one-time recovery codes. After that, each new sign-in asks for a code before anything loads. It works for password and Google sign-in alike.

**How it is enforced:** every API request from an account with 2FA on must carry a signed "code entered for this sign-in" token. It is tied to the person and to the Firebase sign-in time, lasts 12 hours, and a fresh sign-in asks again. Without it the API answers 401 and the app shows the code dialog.

**Protections:** each code works once (replays are refused), five wrong tries lock the account for 15 minutes (the lock survives restarts), recovery codes are stored only as hashes and work once, secrets are stored encrypted, and the secrets and recovery hashes are never included in "download my data". Turning 2FA off needs a valid code.

**To switch it on (you do this):**
1. Set `FIELD_ENCRYPTION_KEY` on the backend (generate with the command in `.env.example`). Without it the 2FA settings show "not switched on for this server yet" and nothing is enforced.
2. Run `npm run db:migrate` (adds migration `026`).
3. Optionally set `REQUIRE_REVIEWER_MFA=true`, but only after the reviewer account has turned 2FA on.

**If someone loses their phone and recovery codes:** an admin can run `DELETE FROM user_totp WHERE user_id = '<uid>'` in the database after confirming who they are.

### Firebase App Check
Frontend: set `VITE_APPCHECK_SITE_KEY` (a reCAPTCHA Enterprise key registered under Firebase > App Check). Every `/api` call then carries a token. Backend: after you see tokens arriving (App Check > Metrics), set `APP_CHECK_ENFORCE=true`. Webhooks and `/api/health` are exempt.

### Website security headers
`npm run build` now also writes `frontend/dist/_headers` (Netlify and Cloudflare Pages use it automatically): HSTS, nosniff, referrer and permissions policies, and a Content-Security-Policy that hashes the one inline script. It ships as **Report-Only**. Open the site, check the browser console for "Content Security Policy" reports, then build with `CSP_MODE=enforce`. I tested the enforced policy on the home, About, sign-in, Support and dashboard pages with no violations; Razorpay checkout and Google sign-in pop-ups were not exercised. Other hosts: copy the header lines into the host's settings.

### Shared rate limits
Set `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` (a free Upstash Redis database). Limits then hold across restarts and several servers; if Redis is unreachable it falls back to per-process limits.

### Error tracking
Set `SENTRY_DSN`. Reports carry only the error name, code and top stack frames: no request data, emails or message text (tested). No package added.

### Column encryption
Set `FIELD_ENCRYPTION_KEY` (generate with the command in `.env.example`), then run `npm run encrypt-existing --workspace @ledgerline/backend` once to protect addresses and GST numbers already saved. New values are encrypted automatically; invoices and "download my data" decrypt them for the owner. **Back the key up separately from the database**: without it those fields cannot be recovered. Deleting an account removes them as before.

## Support tickets

- `POST /api/support` opens a ticket (visitors allowed; signed-in users are linked to their account and their email is taken from the verified token, not the form). `GET/POST /api/tickets` is the user's own tickets only. `GET/POST /api/ticket-admin` needs the reviewer/admin account (same check, and MFA when `REQUIRE_REVIEWER_MFA=true`). Every admin reply or status change is written to `admin_audit_log`.
- Technical details (browser, device, screen, page, language, time zone, last 5 page errors) are sent only if the user leaves the box ticked; the server keeps a fixed whitelist of short text fields. No IP address, token, journal or trade data is stored.
- Tickets linked to an account are exported and deleted with it. Visitor tickets (email only) are not linked to an account; delete them by email on request.
- Run `npm run db:migrate` to apply `027_support_tickets.sql`.

## Audit of the MetaTrader, AI and limits work (`metatrader` branch)
Fixed
- MetaTrader report parser: a crafted file could make a pattern run for a very long time (denial of service). The account-number pattern is replaced with a bounded one, oversized table rows are skipped, and a test feeds it hostile files and requires a quick finish.
- Replay candles: the paid market-data call ran before the plan limit was checked, so a free user over the limit could still cost upstream calls. The limit is checked first.
- Live notification stream: no cap on open streams per user. Capped at 5.
- MetaTrader ingest and import are on the strict "costly" rate limit.
- AI tools: output is stripped of currency amounts and code blocks, user text is passed as data with an instruction to ignore requests inside it, one AI run at a time per user, and a failed AI call is never charged.

Checked and found sound
- HTML sinks: every dynamic `innerHTML` uses constants or server-escaped Markdown (links limited to http, https and mailto).
- SQL: every interpolated name is a server constant or whitelisted; all values are parameters.
- Uploads are re-encoded and size-checked; the live-sync token is 256-bit, stored only as a SHA-256 hash, shown once, and revocable; every trade, mistake and replay lookup is scoped to the signed-in user.

Left for the owner
- `npm audit` reports high and moderate issues inside the Firebase packages' own dependencies (`@grpc/grpc-js`, `uuid`). Fixing them needs a major Firebase upgrade; do it on its own branch and retest sign-in.
- The reviewer address falls back to a hard-coded default in `mentor-verification.js` when `REVIEWER_EMAIL` is not set. Set `REVIEWER_EMAIL` in production.
