-- Two-step sign-in with an authenticator app, checked by our own server (no paid identity add-on needed).
CREATE TABLE IF NOT EXISTS user_totp (
  user_id text PRIMARY KEY REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  secret text NOT NULL,                       -- encrypted with FIELD_ENCRYPTION_KEY
  enabled_at timestamptz,                     -- null while setup is not confirmed yet
  last_step bigint NOT NULL DEFAULT 0,        -- newest 30-second step already used, so a code works once
  failed_attempts integer NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS totp_recovery_codes (
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  code_hash text NOT NULL,                    -- sha256 of the code; the code itself is shown once
  used_at timestamptz,
  PRIMARY KEY (user_id, code_hash)
);
