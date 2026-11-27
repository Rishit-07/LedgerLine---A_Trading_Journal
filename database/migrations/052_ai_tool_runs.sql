-- One row per AI run on the Replay review and Mistake lab insight. Rows are written only after the AI answered,
-- so a failed call costs the user nothing. The monthly count of rows is the usage the plan limits are checked against.
CREATE TABLE IF NOT EXISTS ai_tool_runs (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  tool text NOT NULL CHECK (tool IN ('replay_review','mistake_insight')),
  ref text NOT NULL DEFAULT '' CHECK (char_length(ref) <= 40),
  output text NOT NULL CHECK (char_length(output) BETWEEN 1 AND 4000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_tool_runs_user_tool ON ai_tool_runs (user_id, tool, created_at DESC);

-- Every AI answer (Ask your journal, trade review, habit insight) writes its token cost here. Pro and Mentor limits are sums over a month and a rolling hour.
CREATE TABLE IF NOT EXISTS ai_token_ledger (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  tokens integer NOT NULL CHECK (tokens > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ai_token_ledger_user_time ON ai_token_ledger (user_id, created_at DESC);
