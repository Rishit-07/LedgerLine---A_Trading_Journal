CREATE TABLE report_checkouts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
 term text NOT NULL CHECK(term IN ('monthly','yearly')), plan_ref text NOT NULL, provider_ref text UNIQUE,paid_until timestamptz,created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE report_payment_events(id text PRIMARY KEY,received_at timestamptz NOT NULL DEFAULT now());
