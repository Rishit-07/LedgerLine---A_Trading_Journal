# Billing: CoinPayments (crypto only)

Prices are in US dollars and live in `backend/src/billing-config.js`. The landing page copy is in `frontend/src/landing-pricing.js`; a test keeps the two equal.

| Plan | Monthly | Yearly | Intro (first 2 months, once per account) |
|---|---|---|---|
| Pro | $5.99 | $59 | $2.99 |
| Mentor | $17.99 | $179 | $8.99 |

The intro price applies only to one-month purchases, twice per account per plan. Three months and a year are always full price. Prepaid periods stack on what the account already has.

## How a payment works
1. The user picks a plan and period. The server picks the price, reserves the order, then creates a hosted CoinPayments invoice in USD. The user chooses the coin on the CoinPayments page; the price is locked for about 15 minutes.
2. CoinPayments calls `POST /api/billing/coinpayments/webhook`. The server checks the signature (HMAC-SHA256 over the raw body, the exact registered URL, the client id and a timestamp within 5 minutes). The webhook body is never trusted: the server then fetches the invoice from CoinPayments over its own signed request and credits access only when the state is `Completed` and the total equals the order.
3. A missed webhook is caught by a sweep that re-checks open orders every few minutes.
4. Anything unexpected (wrong total, overpaid, unknown state) is held as **needs review**. Nothing is credited. A reviewer sees the list at `GET /api/billing/needs-review` and can credit or dismiss, and the action is logged in `admin_audit_log`.

## Database guarantees
- **Atomic:** crediting (access, intro use, invoice, log row) is one transaction. A failure rolls everything back and the webhook returns 503 so CoinPayments retries. A delivery is marked handled only after it succeeded.
- **Consistent:** the database refuses unknown payment states and a paid order with no end date, allows one invoice per order, one webhook per provider and id, and one provider invoice per order.
- **Isolated:** each order is locked `FOR UPDATE`; each account takes an advisory lock when it picks a price or credits, so two tabs cannot both get an intro price, and two deliveries cannot both credit. No database lock is held while calling CoinPayments.
- **Durable:** state is in Postgres; `payment_events` records every change (checkout, webhook, sweep, reviewer).

## Plan lifecycle
- Reminders at 7 days and 1 day before the end, and a notice when the period ends (in-app, plus the existing email reminder).
- 3 days of grace after the end. After that the plan is Free. A mentor space turns read-only and its join links pause (the mentorship sweep handles it).
- Cancelling a mentor plan only stops reminders. Crypto payments are prepaid and cannot be reversed here, so there are no refunds.

## Owner steps
1. Create a CoinPayments account and an API integration. Set `COINPAYMENTS_CLIENT_ID`, `COINPAYMENTS_CLIENT_SECRET` and `PUBLIC_APP_URL` (public https).
2. In CoinPayments, register the webhook `<PUBLIC_APP_URL>/api/billing/coinpayments/webhook` and subscribe to the invoice events (Pending, Paid, Completed, Timed out, Cancelled).
3. Point payouts at your Trust Wallet (see `docs/payout-setup.md`).
4. **Run a sandbox test before launch.** The invoice request body follows CoinPayments' public docs as far as they could be read, but it has not been run against a real account. Make a test payment for each plan and confirm access, the invoice and the receipt email.
5. Confirm the prices, and have an accountant confirm how GST and invoices apply to USD crypto sales. Set `BILLING_*` variables only after that.
6. Run migrations 031, 032, 040, 050, 051, 052, 053 and 054 (in that order; rollbacks are in `database/rollback`).
7. Keep the API process running: expired and stuck checkouts are cleaned up by `sweep()` every 5 minutes inside the server. It is skipped when `STREAK_NEON_SCHEDULE=true`, so if you set that, run the maintenance from your own scheduler instead.
8. Set `REVIEWER_EMAIL` in production so the built-in fallback is not used.
9. After the first real payment, check the needs-review list and the webhook log before announcing the plans.

## Not built
Refunds, chargebacks and partial-payment top-ups (these go to needs review and are settled by hand), coupons (none by design), a mentor payout system (mentors are not paid through Ledgerline).

## Refunds and the billing admin panel
Crypto cannot be reversed from the app, so a refund is a record plus a manual payment from your own wallet.
- **Where:** open `/billing-admin` while signed in as the reviewer account (`REVIEWER_EMAIL`, with two-step sign-in if `REQUIRE_REVIEWER_MFA=true`). It shows paid orders, orders that need a look, and refunds you owe. Search by email, order id or account id.
- **Record a refund:** open an order, enter the amount (never more than was paid, in total), a reason, and the customer's public wallet address if you have it. Tick "End the access this payment gave" only for a full refund; it removes that period immediately, with no grace.
- **Send it yourself:** send the coins from your Trust Wallet to the customer's address, then paste the transaction hash and press "Mark as sent". The customer gets an in-app notice at each step.
- **Safety:** every action is one database transaction on the locked order, repeats of the same form are ignored, and each action is written to `payment_events` and `admin_audit_log`. A sent refund cannot be cancelled. The page never asks for or stores a recovery phrase or private key.
- **Same page:** orders flagged "needs review" (underpaid, overpaid, unknown) can be credited or dismissed there, which uses the existing review endpoint.
- **Not built:** credit-note PDFs for refunds, and a customer-facing "request a refund" button (customers contact support). Refund rows are stored in `billing_refunds` (migration 053).

## Admin console
The admin console is separate from the trading app, at `/admin` and below it: Home (what needs you now), Users, Mentor verification, Support tickets, Billing, Newsletter, Audit log. Only the account whose email is `REVIEWER_EMAIL` can open it. Anyone else, signed in or not, sees the ordinary 404 page. That account is sent to `/admin` when it signs in, and the trading app shows no admin links to anyone. Use a dedicated email for it, not your personal trading account. If `REQUIRE_REVIEWER_MFA=true` and you have not completed two-step sign-in, the console also shows the 404 page.

- **Users**: every registered account with name, email, plan, joined date, last sign-in. Filter Free, Pro, Mentor, search by name, email or account id. Open one to see usage, orders and notes, give a plan for 1 to 366 days, end a paid plan immediately (no grace, no refund; use Billing to refund), suspend or re-enable sign-in (done in Firebase, open sessions stop writing at once, an already-open page can still read for up to an hour), and keep private notes. Every change needs a written reason and is written to the audit log.
- **Mentor verification**: each applicant's live camera photo, profile photo, up to 3 documents, links, SEBI details and history, with approve, ask for more information, reject, renew and revoke. Opening a record writes `mentor_view_proof` to the audit log. Applicants must take the live photo with the camera (no gallery picker) and upload at least one document before they can submit. Images are stored encrypted when `FIELD_ENCRYPTION_KEY` is set. The review is by a person; there is no automatic face matching.
- **Audit log**: append-only list of admin actions, filter by users, mentors, tickets, billing, newsletter.

Run migration **054** (`admin_user_notes`, mentor live photo and documents) before using Users notes or mentor uploads.

## Support tickets (users)
My tickets has a New ticket form (topic, priority, subject, message) that creates the ticket for the signed-in account without the visitor bot check. The Help center form still works for visitors.
