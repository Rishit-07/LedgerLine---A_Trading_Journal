CREATE TABLE IF NOT EXISTS ledgerline_accounts (
  firebase_uid text PRIMARY KEY CHECK (char_length(firebase_uid) BETWEEN 1 AND 128),
  created_at timestamptz NOT NULL DEFAULT now()
);
