-- Where and when notifications reach a person, plus the devices that can receive push.
CREATE TABLE IF NOT EXISTS notification_settings (
  user_id text PRIMARY KEY REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  email text CHECK (email IS NULL OR char_length(email) <= 254),
  quiet text NOT NULL DEFAULT '22-07' CHECK (quiet IN ('off','22-07','23-06')),
  delivery text NOT NULL DEFAULT 'instant' CHECK (delivery IN ('instant','daily')),
  tz text NOT NULL DEFAULT 'Asia/Kolkata' CHECK (char_length(tz) <= 80),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS push_tokens (
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  device_id text NOT NULL CHECK (char_length(device_id) BETWEEN 8 AND 80),
  token text NOT NULL CHECK (char_length(token) <= 4096),
  last_seen timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, device_id)
);
-- Rows waiting for quiet hours or the daily summary to end.
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS email_pending boolean NOT NULL DEFAULT false;
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS push_pending boolean NOT NULL DEFAULT false;
CREATE INDEX IF NOT EXISTS notifications_pending_idx ON notifications (user_id) WHERE email_pending OR push_pending;
