-- Refunds are recorded here. Crypto payments cannot be reversed by the app, so a refund is "owed" until the
-- operator sends the coins from their own wallet and records the transaction reference.
CREATE TABLE IF NOT EXISTS billing_refunds (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checkout_id uuid NOT NULL REFERENCES report_checkouts ON DELETE RESTRICT,
  user_id text NOT NULL,
  request_id text NOT NULL,
  amount_usd_cents integer NOT NULL CHECK (amount_usd_cents > 0),
  reason text NOT NULL CHECK (reason IN ('duplicate_payment','wrong_amount','service_problem','goodwill','other')),
  note text CHECK (char_length(note) <= 500),
  ends_access boolean NOT NULL DEFAULT false,
  refund_to text CHECK (char_length(refund_to) <= 200),      -- a public wallet address the customer gave us, never a key or phrase
  status text NOT NULL DEFAULT 'owed' CHECK (status IN ('owed','sent','cancelled')),
  tx_ref text CHECK (char_length(tx_ref) <= 200),
  created_by text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  UNIQUE (checkout_id, request_id),
  CHECK (status <> 'sent' OR (tx_ref IS NOT NULL AND sent_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS billing_refunds_open ON billing_refunds (created_at) WHERE status = 'owed';
CREATE INDEX IF NOT EXISTS billing_refunds_checkout ON billing_refunds (checkout_id);
REVOKE ALL ON billing_refunds FROM PUBLIC;
