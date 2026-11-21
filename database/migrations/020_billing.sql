ALTER TABLE report_checkouts
 ADD COLUMN plan text NOT NULL DEFAULT 'pro' CHECK(plan IN ('pro','mentor')),
 ADD COLUMN method text NOT NULL DEFAULT 'Card',
 ADD COLUMN months integer CHECK(months IN (1,3,12)),
 ADD COLUMN quote jsonb, ADD COLUMN recipient text,
 ADD COLUMN grace_until timestamptz, ADD COLUMN renewal_action text;
UPDATE report_checkouts SET method='Crypto' WHERE plan_ref='crypto-pro';
CREATE TABLE billing_invoices (
 id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY, checkout_id uuid NOT NULL REFERENCES report_checkouts ON DELETE CASCADE,
 transaction_id text NOT NULL UNIQUE, amount_paise bigint NOT NULL, details jsonb NOT NULL, credit numeric NOT NULL DEFAULT 0,
 created_at timestamptz NOT NULL DEFAULT now(), mailed_at timestamptz, retry_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE report_checkouts ADD COLUMN reminder_sent boolean NOT NULL DEFAULT false;
CREATE TABLE billing_replay_usage(user_id text REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE, used_at timestamptz NOT NULL DEFAULT now());