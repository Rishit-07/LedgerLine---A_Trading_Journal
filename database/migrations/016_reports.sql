CREATE TABLE report_preferences(user_id text PRIMARY KEY REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE, enabled boolean NOT NULL DEFAULT false);
CREATE TABLE report_subscriptions(user_id text PRIMARY KEY REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,plan text NOT NULL CHECK(plan IN ('pro','mentor')), valid_until timestamptz NOT NULL);
CREATE TABLE ai_reports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE, period text NOT NULL,kind text NOT NULL,input_hash text NOT NULL,output jsonb NOT NULL,model text NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ai_reports_owner ON ai_reports(user_id,created_at DESC);
CREATE TABLE ai_review_usage(user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE, free boolean NOT NULL, created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX ai_review_usage_owner ON ai_review_usage(user_id,free,created_at);
CREATE TABLE report_experiments(user_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,start_day date NOT NULL,kind text NOT NULL,baseline int NOT NULL,PRIMARY KEY(user_id,start_day));
