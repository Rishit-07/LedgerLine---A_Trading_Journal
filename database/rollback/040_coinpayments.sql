DROP TABLE IF EXISTS intro_usage, webhook_events;
ALTER TABLE billing_invoices DROP COLUMN IF EXISTS currency;
DROP INDEX IF EXISTS report_checkouts_review;
ALTER TABLE report_checkouts DROP COLUMN IF EXISTS price_usd_cents, DROP COLUMN IF EXISTS intro_months, DROP COLUMN IF EXISTS expires_at, DROP COLUMN IF EXISTS needs_review, DROP COLUMN IF EXISTS review_note, DROP COLUMN IF EXISTS reminder_7d_at, DROP COLUMN IF EXISTS reminder_1d_at;
DROP TABLE IF EXISTS payment_events;
ALTER TABLE report_checkouts DROP CONSTRAINT IF EXISTS report_checkouts_paid_has_end, DROP CONSTRAINT IF EXISTS report_checkouts_state_known;
DROP INDEX IF EXISTS billing_invoices_one_per_order;
