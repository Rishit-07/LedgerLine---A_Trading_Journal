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
