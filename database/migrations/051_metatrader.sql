-- MetaTrader (MT4/MT5) import and optional live sync.
-- mt_links: one row per installed bridge. Only a SHA-256 hash of the token is stored; the token is shown once.
-- mt_imported: one row per MetaTrader trade brought in. The primary key de-duplicates, and the month's count drives the Free limit.
CREATE TABLE IF NOT EXISTS mt_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  label text NOT NULL CHECK (char_length(label) BETWEEN 1 AND 40),
  platform text NOT NULL CHECK (platform IN ('mt4','mt5')),
  token_hash text NOT NULL UNIQUE CHECK (token_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz,
  revoked_at timestamptz
);
CREATE INDEX IF NOT EXISTS mt_links_user ON mt_links (user_id) WHERE revoked_at IS NULL;

CREATE TABLE IF NOT EXISTS mt_imported (
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  ref text NOT NULL CHECK (char_length(ref) BETWEEN 3 AND 80),
  trade_id bigint,
  source text NOT NULL CHECK (source IN ('report','live')),
  imported_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, ref)
);
CREATE INDEX IF NOT EXISTS mt_imported_month ON mt_imported (user_id, imported_at);
