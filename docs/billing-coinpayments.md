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
6. Run migrations up to 040.

## Not built
Refunds, chargebacks and partial-payment top-ups (these go to needs review and are settled by hand), coupons (none by design), a mentor payout system (mentors are not paid through Ledgerline).
