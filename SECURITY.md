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

### Two-step sign-in (2FA) with an authenticator app
**In the app:** Settings has a new "Two-step sign-in" section. People turn it on, scan a QR code with Google Authenticator, Authy or 1Password, and confirm one code. Sign-in then asks for a 6-digit code. Accounts without it sign in as before.

**One-time Firebase setup (you do this):**
1. Firebase console > Authentication > Settings > **Upgrade to Identity Platform** (needed for multi-factor; it has a free tier, billing must be enabled on the project).
2. Authentication > Sign-in method > **Multi-factor authentication** > enable, then enable **TOTP**.
3. Make sure your site's domain is under Authentication > Settings > Authorized domains.

**Force it for the reviewer:** set `REQUIRE_REVIEWER_MFA=true` on the backend, but only after the reviewer account has turned 2FA on, otherwise it is locked out of reviews. The check reads Firebase's `sign_in_second_factor` claim, so a password-only session cannot approve mentors.

Notes: enrolling needs a recent sign-in (the app says so if not), a verified email, and people should save the setup key somewhere safe because losing the phone otherwise needs you to remove the factor in the Firebase console.

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
