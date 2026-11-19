CREATE TABLE IF NOT EXISTS ledgerline_newsletter_subscriptions (
  email text PRIMARY KEY CHECK (char_length(email) BETWEEN 3 AND 254 AND email = lower(email)),
  subscribed_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS ledgerline_welcome_emails (
  firebase_uid text PRIMARY KEY REFERENCES ledgerline_accounts (firebase_uid) ON DELETE CASCADE,
  payload jsonb,
  next_attempt_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '23 hours'),
  sent_at timestamptz
);

CREATE INDEX IF NOT EXISTS ledgerline_welcome_emails_pending
  ON ledgerline_welcome_emails (next_attempt_at) WHERE payload IS NOT NULL;
