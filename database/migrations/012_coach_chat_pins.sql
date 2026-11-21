ALTER TABLE coach_chats ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

-- Keep the rolling quota independent of a user's decision to delete a conversation.
CREATE TABLE IF NOT EXISTS coach_requests (
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  legacy_message_id bigint UNIQUE
);
CREATE INDEX IF NOT EXISTS coach_requests_by_user_time ON coach_requests(user_id, created_at);
INSERT INTO coach_requests(user_id, created_at, legacy_message_id)
SELECT user_id, created_at, id FROM coach_messages
WHERE created_at > now() - interval '1 day'
AND NOT EXISTS (SELECT 1 FROM coach_requests WHERE user_id=coach_messages.user_id AND created_at=coach_messages.created_at)
ON CONFLICT DO NOTHING;
