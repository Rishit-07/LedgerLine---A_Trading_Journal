ALTER TABLE clubs ADD COLUMN IF NOT EXISTS kind text NOT NULL DEFAULT 'club' CHECK (kind IN ('club','space'));
CREATE INDEX IF NOT EXISTS community_memberships_by_group ON club_members(club_id,joined_at);
CREATE TABLE IF NOT EXISTS community_topics (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  author_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('discussion','goal')),
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 600),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS community_topics_group ON community_topics(club_id,id DESC);
CREATE TABLE IF NOT EXISTS community_checkins (
  topic_id bigint NOT NULL REFERENCES community_topics(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  PRIMARY KEY(topic_id,user_id)
);
CREATE TABLE IF NOT EXISTS community_replies (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  topic_id bigint NOT NULL REFERENCES community_topics(id) ON DELETE CASCADE,
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  body text NOT NULL CHECK (length(trim(body)) BETWEEN 1 AND 600),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS community_replies_topic ON community_replies(topic_id,id);
