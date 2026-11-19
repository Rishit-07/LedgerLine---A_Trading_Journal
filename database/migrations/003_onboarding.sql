CREATE TABLE IF NOT EXISTS user_profile (
  user_id text PRIMARY KEY REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  display_name text CHECK (char_length(display_name) BETWEEN 1 AND 100),
  markets text[] NOT NULL DEFAULT '{}',
  risk_per_trade_pct numeric(4,2),
  daily_loss_limit_r smallint,
  daily_loss_limit_pct numeric(5,2) GENERATED ALWAYS AS (risk_per_trade_pct * daily_loss_limit_r) STORED,
  max_trades_per_day smallint,
  broker text,
  onboarding_step smallint NOT NULL DEFAULT 1 CHECK (onboarding_step BETWEEN 1 AND 4),
  onboarded_at timestamptz
);

CREATE TABLE IF NOT EXISTS rules (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  rule_key text NOT NULL,
  text text NOT NULL,
  hard boolean NOT NULL,
  position smallint NOT NULL,
  active boolean NOT NULL DEFAULT true,
  UNIQUE (user_id, rule_key)
);

CREATE TABLE IF NOT EXISTS broker_links (
  user_id text PRIMARY KEY REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  broker text NOT NULL,
  status text NOT NULL DEFAULT 'not_connected',
  linked_at timestamptz
);
