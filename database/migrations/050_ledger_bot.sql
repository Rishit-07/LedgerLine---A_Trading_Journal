-- Per-user setting for the Ledger bot. Default on: it pops in and out. Off: it stays on screen, still.
CREATE TABLE IF NOT EXISTS ledger_bot_settings (
  user_id text PRIMARY KEY REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  pop boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON ledger_bot_settings FROM PUBLIC;
