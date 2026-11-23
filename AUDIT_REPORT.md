# Launch audit: BreakingBreach checklists

Checked the whole repository against the five guides: Pre-Launch AI Security, Build Apps That Don't Break, Protect Your App From Data Loss, App Performance Toolkit and App Launch Checklist. "Fixed" means changed in this branch. "You do" means it needs a decision or an account setting that code cannot make. Legal items are general information, not legal advice: have a lawyer review them.

## Fixed in this branch

| Guide | Finding | Change |
|---|---|---|
| Build apps that don't break 04/12 | No rate limits on any route, including newsletter, support and AI | `backend/src/guard.js`: per-IP limits (5/min open forms, 20/min costly, 240/min general), `429` with `Retry-After`. Proxy headers are only trusted when `TRUST_PROXY=true`. |
| Build apps that don't break 06/07 | API replies had no security headers | `nosniff`, `X-Frame-Options: DENY`, `no-referrer`, `default-src 'none'` CSP, same-origin resource policy. |
| Build apps that don't break 09/10 | A thrown error in any handler could become an unhandled rejection | Every route runs inside `safely()`: 500 with no internals, code-only log line. Process-level handlers added. |
| Build apps that don't break 10/12 | No health check, no graceful shutdown, no timeouts | `GET /api/health` (checks the database), SIGTERM/SIGINT drain requests then close the pool, request and header timeouts. |
| Build apps that don't break 12 / Performance | Unbounded DB pool; a stuck query held a connection forever | Pool `max` 10, `statement_timeout` 15s, idle-in-transaction timeout 30s. |
| Launch 13, 04 | No way to export or delete an account | `GET /api/account/export` (JSON of every table keyed to the account, images omitted) and `DELETE /api/account` (typed `DELETE`, sign-in within 10 minutes, one transaction, then removes the Firebase user). Buttons in Settings, Data and privacy. Tables are found from the catalogue so future tables are covered. Tested on a real Postgres engine: other users' rows stay. |
| Data loss 18 | No record that deletions happened | `account_deletions` stores only a one-way hash and a row count. |
| Launch 03, 04 | Terms checkbox existed but acceptance was not recorded | Migration `024`: append-only `terms_acceptances` (document, version, method, server time). Sign-up sends the ticked version once; the server records terms and privacy. |
| Launch 21 | No skip link | "Skip to main content" link, visible on keyboard focus. |
| Data loss 13 | No rollback for the new migration | `database/rollback/024_terms_and_deletion_log.sql`. |
| Pre-launch AI 25 | No automated tests for the new guards | `backend/test/guard.test.js` (5 tests). `npm test --workspace @ledgerline/backend` now runs all backend tests (32 pass, 8 skip without a test database). |

## Already good (no change)

- AI keys are server side only. Coach has a scope check, a token budget, output caps (`max_tokens`), 30s timeout, and refuses code in replies.
- Razorpay webhook uses HMAC and constant-time compare. All outbound fetches (email, calendar) have timeouts; calendar refuses redirects.
- Queries are parameterised. The few `${}` in SQL are internal table names, never request data.
- Browser code builds HTML only from fixed strings; user text goes through `textContent`. No XSS path found.
- Logs print error codes only, never messages, tokens or bodies.
- Bearer token plus verified email on every private route. Uploads have size limits (`readJson` byte cap, 24 KB avatar check).
- `.env*` is git-ignored; only `.env.example` is committed. All images have `alt`.

## You do (cannot be done in code)

1. **Database backups (Data loss 14, 15, 16, 19, 20).** In Neon: confirm the plan's point-in-time restore window, restore into a branch and run the app against it once, and write down the steps. Keep a periodic export somewhere the app's credentials cannot delete.
2. **Separate test and production databases (Data loss 01, 02, 04).** Use a Neon branch for development with its own `DATABASE_URL` and keep the production URL only in the host's secret store. Run `npm run db:migrate` against a branch copy before production.
3. **Firebase web API key** in `frontend/src/firebase-config.js` is public by design. In Google Cloud, restrict it to your domains.
4. **Security headers for the website** (not the API): set a Content-Security-Policy, `X-Content-Type-Options`, `Referrer-Policy` and HSTS at your host. The API already sends its own.
5. **Set `TRUST_PROXY=true`** on the backend if it runs behind a proxy, so limits use the real client address. Add the host's rate limiting if you run more than one server process (limits here are per process).
6. **Legal pages (Launch 01, 02, 05, 06, 12, 17, 18).** Check that the privacy policy names real data flows (Firebase, Neon, Resend or Gmail, Razorpay, the AI provider), retention periods, deletion and export, and a contact address. Add a refund policy, business contact details, and a subprocessor list. Sign or accept each vendor's data processing agreement. Needs a lawyer.
7. **Retention decision:** deleting an account also deletes its billing invoices (they cascade). If Indian tax rules require keeping invoices, change those foreign keys to keep an anonymised copy before launch.
8. **Marketing consent (Launch 09, 10):** the newsletter form is a separate, unticked opt-in. Add an unsubscribe link and your postal address when you start sending marketing email.
9. **Cookie banner (Launch 07, 08):** the app stores only theme and the one-time terms flag in local storage and loads no analytics or ad trackers, so no banner is needed today. Add one before adding analytics.
10. **AI data use (Launch 15):** the AI Coach sends journal context to OpenRouter, Groq or OpenAI after opt-in. Turn off provider-side training on your account and say so in the privacy policy.

## Not done and why

- Row-level security, a database role per feature, and canary strings (AI guide C, B08): the Coach has no tools and no retrieval across users, so the highest-risk paths do not exist. Revisit if you add tools or shared search.
- Performance toolkit items (skeleton screens, image formats, request deduplication): no user-facing speed problem was measured, and I did not want to change layouts blind. Run Lighthouse on `/dashboard` and `/history` and send me the numbers.
- Keyboard and contrast checks beyond the earlier UI pass were not repeated.
