ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'Asia/Kolkata';
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS streak_exchanges text[];
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS streak_invite_code uuid NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS streak_reminder_time time;
ALTER TABLE user_profile ADD COLUMN IF NOT EXISTS streak_reminder_email text;
CREATE UNIQUE INDEX IF NOT EXISTS user_profile_streak_invite_code ON user_profile (streak_invite_code);
ALTER TABLE trades ADD COLUMN IF NOT EXISTS reviewed_at timestamptz;
ALTER TABLE journal_entries ADD COLUMN IF NOT EXISTS is_rest_day boolean NOT NULL DEFAULT false;
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_one_rest_day ON journal_entries (user_id, date) WHERE is_rest_day;

CREATE TABLE IF NOT EXISTS streak_days (
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  day date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('trade', 'review', 'rest', 'freeze')),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);

CREATE TABLE IF NOT EXISTS streak_state (
  user_id text PRIMARY KEY REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  current int NOT NULL DEFAULT 0 CHECK (current >= 0),
  best int NOT NULL DEFAULT 0 CHECK (best >= current),
  freezes_available int NOT NULL DEFAULT 1 CHECK (freezes_available BETWEEN 0 AND 2),
  last_counted_day date,
  level int NOT NULL DEFAULT 1 CHECK (level >= 1),
  xp int NOT NULL DEFAULT 0 CHECK (xp >= 0),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS exchange_holidays (
  exchange text NOT NULL CHECK (exchange IN ('NSE', 'BSE')),
  day date NOT NULL,
  closed boolean NOT NULL DEFAULT true,
  source text NOT NULL,
  PRIMARY KEY (exchange, day)
);

CREATE TABLE IF NOT EXISTS streak_friends (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  friend_user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('pending', 'active', 'ended')),
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (user_id <> friend_user_id)
);
CREATE UNIQUE INDEX IF NOT EXISTS streak_friends_live_pair ON streak_friends
  (least(user_id, friend_user_id), greatest(user_id, friend_user_id)) WHERE status <> 'ended';
CREATE INDEX IF NOT EXISTS streak_friends_receiver ON streak_friends (friend_user_id, status);
CREATE INDEX IF NOT EXISTS streak_friends_sender ON streak_friends (user_id, status);

CREATE TABLE IF NOT EXISTS streak_battles (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  challenger_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  opponent_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  length_days smallint NOT NULL CHECK (length_days IN (3, 7, 14)),
  started_on date NOT NULL,
  status text NOT NULL CHECK (status IN ('active', 'completed', 'ended')),
  winner_id text REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  CHECK (challenger_id <> opponent_id),
  CHECK (winner_id IS NULL OR (status = 'completed' AND winner_id IN (challenger_id, opponent_id)))
);
CREATE UNIQUE INDEX IF NOT EXISTS streak_battles_live_pair ON streak_battles
  (least(challenger_id, opponent_id), greatest(challenger_id, opponent_id)) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS streak_battles_challenger ON streak_battles (challenger_id, status);
CREATE INDEX IF NOT EXISTS streak_battles_opponent ON streak_battles (opponent_id, status);

CREATE TABLE IF NOT EXISTS badges_earned (
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  badge_key text NOT NULL,
  earned_at timestamptz NOT NULL DEFAULT now(),
  seen_at timestamptz,
  PRIMARY KEY (user_id, badge_key)
);

CREATE TABLE IF NOT EXISTS streak_reminders_sent (
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  day date NOT NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, day)
);
