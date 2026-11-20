CREATE UNIQUE INDEX IF NOT EXISTS rules_user_id_id ON rules (user_id, id);

CREATE TABLE IF NOT EXISTS plans (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  date date NOT NULL,
  bias text,
  levels jsonb NOT NULL DEFAULT '{}',
  rules_snapshot jsonb NOT NULL DEFAULT '[]',
  locked_at timestamptz,
  UNIQUE (user_id, date)
);

CREATE TABLE IF NOT EXISTS trades (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  opened_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  market text NOT NULL CHECK (market IN ('stocks', 'options', 'futures', 'forex', 'crypto')),
  symbol text NOT NULL CHECK (char_length(symbol) BETWEEN 1 AND 48),
  side text NOT NULL CHECK (side IN ('long', 'short')),
  qty numeric(22,8),
  entry numeric(22,8),
  exit numeric(22,8),
  stop numeric(22,8),
  target numeric(22,8),
  fees numeric(22,8),
  r_multiple numeric(10,4),
  setup text,
  status text GENERATED ALWAYS AS (CASE WHEN closed_at IS NULL THEN 'open' ELSE 'closed' END) STORED,
  broker_ref text,
  client_request_id uuid,
  UNIQUE (user_id, id),
  UNIQUE (user_id, client_request_id),
  CHECK ((closed_at IS NULL) = (r_multiple IS NULL)),
  CHECK (closed_at IS NULL OR closed_at >= opened_at)
);
CREATE INDEX IF NOT EXISTS trades_user_opened ON trades (user_id, opened_at DESC);
CREATE INDEX IF NOT EXISTS trades_user_closed ON trades (user_id, closed_at) WHERE closed_at IS NOT NULL;

CREATE TABLE IF NOT EXISTS trade_checks (
  user_id text NOT NULL,
  trade_id bigint NOT NULL,
  rule_id bigint NOT NULL,
  kept boolean NOT NULL,
  PRIMARY KEY (user_id, trade_id, rule_id),
  FOREIGN KEY (user_id, trade_id) REFERENCES trades(user_id, id) ON DELETE CASCADE,
  FOREIGN KEY (user_id, rule_id) REFERENCES rules(user_id, id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS journal_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  trade_id bigint,
  date date NOT NULL,
  note text NOT NULL,
  mood text,
  tags text[] NOT NULL DEFAULT '{}',
  FOREIGN KEY (user_id, trade_id) REFERENCES trades(user_id, id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS journal_entries_user_date ON journal_entries (user_id, date DESC);
