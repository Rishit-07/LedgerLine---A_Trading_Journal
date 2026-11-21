CREATE TABLE IF NOT EXISTS coach_chats (
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, id)
);

ALTER TABLE coach_messages ADD COLUMN IF NOT EXISTS chat_id uuid;

WITH legacy_chats AS (
  INSERT INTO coach_chats (user_id, title, updated_at)
  SELECT user_id, 'Previous chats', max(created_at)
  FROM coach_messages WHERE chat_id IS NULL GROUP BY user_id
  RETURNING user_id, id
)
UPDATE coach_messages m SET chat_id = c.id
FROM legacy_chats c WHERE m.user_id = c.user_id AND m.chat_id IS NULL;

ALTER TABLE coach_messages ALTER COLUMN chat_id SET NOT NULL;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='coach_messages'::regclass AND conname='coach_messages_chat_fk') THEN
    ALTER TABLE coach_messages ADD CONSTRAINT coach_messages_chat_fk
      FOREIGN KEY (user_id, chat_id) REFERENCES coach_chats(user_id, id) ON DELETE CASCADE;
  END IF;
END $$;
CREATE INDEX IF NOT EXISTS coach_messages_chat_id ON coach_messages (user_id, chat_id, id);
