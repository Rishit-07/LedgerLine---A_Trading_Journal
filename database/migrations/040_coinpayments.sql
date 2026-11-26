-- Billing moves to crypto only (CoinPayments). Prices are in US dollars, stored as cents.
ALTER TABLE report_checkouts
  ADD COLUMN IF NOT EXISTS price_usd_cents integer CHECK (price_usd_cents > 0),
  ADD COLUMN IF NOT EXISTS intro_months integer NOT NULL DEFAULT 0 CHECK (intro_months BETWEEN 0 AND 2),
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS needs_review boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS review_note text,
  ADD COLUMN IF NOT EXISTS reminder_7d_at timestamptz,
  ADD COLUMN IF NOT EXISTS reminder_1d_at timestamptz;
CREATE INDEX IF NOT EXISTS report_checkouts_review ON report_checkouts (created_at) WHERE needs_review;

-- amount_paise holds the smallest unit of `currency` (paise for INR, cents for USD).
ALTER TABLE billing_invoices ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'INR';

CREATE TABLE IF NOT EXISTS webhook_events (
  provider text NOT NULL,
  event_id text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (provider, event_id)
);

-- The introductory price is for the first 2 monthly periods of a plan, once per account.
CREATE TABLE IF NOT EXISTS intro_usage (
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  plan text NOT NULL CHECK (plan IN ('pro','mentor')),
  months_used integer NOT NULL DEFAULT 0 CHECK (months_used BETWEEN 0 AND 2),
  PRIMARY KEY (user_id, plan)
);
REVOKE ALL ON webhook_events, intro_usage FROM PUBLIC;

-- One invoice per paid order, and a paid order always has an end date.
CREATE UNIQUE INDEX IF NOT EXISTS billing_invoices_one_per_order ON billing_invoices (checkout_id);
ALTER TABLE report_checkouts ADD CONSTRAINT report_checkouts_state_known CHECK (payment_state IN ('waiting','confirming','paid','underpaid','overpaid','expired','failed','cancelled','needs_review'));
ALTER TABLE report_checkouts ADD CONSTRAINT report_checkouts_paid_has_end CHECK (payment_state <> 'paid' OR paid_until IS NOT NULL);

-- Every change to an order's state, who made it and why. Append only.
CREATE TABLE IF NOT EXISTS payment_events (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  checkout_id uuid NOT NULL REFERENCES report_checkouts ON DELETE CASCADE,
  at timestamptz NOT NULL DEFAULT now(),
  source text NOT NULL CHECK (source IN ('checkout','webhook','sweep','reviewer')),
  state text NOT NULL,
  note text
);
CREATE INDEX IF NOT EXISTS payment_events_order ON payment_events (checkout_id, at);
REVOKE ALL ON payment_events FROM PUBLIC;
