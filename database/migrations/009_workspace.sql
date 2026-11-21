CREATE TABLE IF NOT EXISTS trade_replays (
  user_id text NOT NULL,
  trade_id bigint NOT NULL,
  candles jsonb NOT NULL DEFAULT '[]',
  lesson text NOT NULL DEFAULT '',
  PRIMARY KEY (user_id, trade_id),
  FOREIGN KEY (user_id, trade_id) REFERENCES trades(user_id, id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_one_replay_lesson
  ON journal_entries (user_id, trade_id) WHERE tags @> ARRAY['replay']::text[];
CREATE UNIQUE INDEX IF NOT EXISTS journal_entries_one_trade_review
  ON journal_entries (user_id, trade_id) WHERE tags @> ARRAY['review']::text[];
CREATE TABLE IF NOT EXISTS mistakes (
  user_id text NOT NULL,
  trade_id bigint NOT NULL,
  kind text NOT NULL,
  note text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, trade_id, kind),
  FOREIGN KEY (user_id, trade_id) REFERENCES trades(user_id, id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS forecasts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  symbol text NOT NULL,
  direction text NOT NULL CHECK (direction IN ('up','down','flat')),
  category text NOT NULL CHECK (category IN ('Macro','Earnings','Technical')),
  probability int NOT NULL CHECK (probability BETWEEN 1 AND 99),
  thesis text NOT NULL,
  due_on date NOT NULL,
  made_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  outcome boolean
);
CREATE INDEX IF NOT EXISTS forecasts_user_id ON forecasts (user_id, id DESC);
CREATE TABLE IF NOT EXISTS sizing_presets (
  user_id text PRIMARY KEY REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  settings jsonb NOT NULL
);
CREATE TABLE IF NOT EXISTS portfolios (
  user_id text PRIMARY KEY REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  slug uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(),
  headline text NOT NULL DEFAULT '',
  display_name text NOT NULL DEFAULT '',
  about text NOT NULL DEFAULT '',
  design text NOT NULL DEFAULT 'dashboard' CHECK (design IN ('dashboard','marginalia','terracotta')),
  sections jsonb NOT NULL DEFAULT '{}',
  visibility text NOT NULL DEFAULT 'private' CHECK (visibility IN ('private','link','public'))
);
CREATE TABLE IF NOT EXISTS clubs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  name text NOT NULL,
  description text NOT NULL,
  location text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS club_members (
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  club_id uuid NOT NULL REFERENCES clubs(id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, club_id)
);
CREATE INDEX IF NOT EXISTS club_members_club_id ON club_members (club_id);
CREATE TABLE IF NOT EXISTS coach_messages (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  question text NOT NULL,
  answer text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS coach_messages_user_id ON coach_messages (user_id, id DESC);
