# If something goes wrong

Keep this short and follow it in order. Write down times as you go.

## 1. Contain (first 30 minutes)
- **Account takeover or stolen token:** `npm run revoke-sessions --workspace @ledgerline/backend -- <uid or email>` signs that person out everywhere. Changes from old sessions are refused immediately.
- **A leaked key or secret:** rotate it at the provider (Firebase service account, Neon password, Razorpay, NOWPayments, Resend or Gmail, AI keys), update the host's secret store, redeploy. Then look at the provider's usage log for the period it was exposed.
- **Abuse or attack:** lower `LIMITS` in `backend/src/guard.js` or block the address at your host or CDN. Check `GET /api/health`.
- **Bad deploy:** redeploy the previous version first, investigate second.

## 2. Find out what happened
- Host logs, Neon query history and the Firebase sign-in log. The reviewer audit trail is `SELECT * FROM admin_audit_log ORDER BY created_at DESC`.
- Decide: which people's data was exposed, which fields, and for how long.

## 3. Restore, if data was lost or damaged
- Neon: restore to a point in time into a new branch, check the data, then switch `DATABASE_URL` to it. Rollback scripts for each migration are in `database/rollback/`.

## 4. Tell people
- If personal data was exposed, notify the affected people and the authorities as the law requires. In India the DPDP Act and CERT-In rules set deadlines (CERT-In: report within 6 hours for listed incident types). Get legal advice before sending.
- Say what happened, what data, what you did, what they should do, and how to reach you. Do not guess; say what you do not yet know.

## 5. Afterwards
- Write down the cause, the fix and one change that stops it recurring. Add a test where one fits.
