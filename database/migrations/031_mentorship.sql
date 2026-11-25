-- Mentorship: one role per account, claim-bound join links, per-level consent, audit of every mentor view.
CREATE TABLE mentorship_profiles (
  user_id text PRIMARY KEY REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'none' CHECK (role IN ('none','student','mentor')),
  role_change_unlocks_at timestamptz,
  plan_cancel_requested_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE spaces
  ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active','frozen','closing','closed')),
  ADD COLUMN links_paused boolean NOT NULL DEFAULT false,
  ADD COLUMN closing_until timestamptz,
  ADD COLUMN focus text NOT NULL DEFAULT '',
  ADD COLUMN welcome_message text NOT NULL DEFAULT '',
  ADD COLUMN plan_term text NOT NULL DEFAULT 'monthly' CHECK (plan_term IN ('monthly','yearly')),
  ADD COLUMN frozen_at timestamptz;
CREATE UNIQUE INDEX one_live_space_per_mentor ON spaces (owner_id) WHERE status IN ('active','frozen','closing');

CREATE TABLE space_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES spaces ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('personal','open')),
  token_hash text NOT NULL UNIQUE,
  label text NOT NULL DEFAULT '',
  email_hash text,
  expires_at timestamptz NOT NULL,
  seat_limit int CHECK (seat_limit IN (5,10,25)),
  uses int NOT NULL DEFAULT 0,
  claimed_by text REFERENCES ledgerline_accounts(firebase_uid) ON DELETE SET NULL,
  claimed_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind = 'personal' OR seat_limit IS NOT NULL)
);
CREATE INDEX space_links_space ON space_links (space_id, created_at DESC);

CREATE TABLE space_memberships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES spaces ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('active','waitlist','paused','removed','left')),
  via_link_id uuid REFERENCES space_links ON DELETE SET NULL,
  joined_at timestamptz NOT NULL DEFAULT now(),
  ended_at timestamptz,
  end_reason text,
  level1 boolean NOT NULL DEFAULT true,
  level2 boolean NOT NULL DEFAULT false,
  level3 boolean NOT NULL DEFAULT false,
  reconfirm_at timestamptz,
  remove_after timestamptz,
  remove_reason text,
  consent_version text NOT NULL
);
-- A student can only ever have one live mentor.
CREATE UNIQUE INDEX one_live_mentor_per_student ON space_memberships (student_id) WHERE status IN ('active','paused','waitlist');
CREATE INDEX space_memberships_space ON space_memberships (space_id, status);

CREATE TABLE mentor_consents (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  membership_id uuid NOT NULL REFERENCES space_memberships ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  space_id uuid NOT NULL REFERENCES spaces ON DELETE CASCADE,
  action text NOT NULL CHECK (action IN ('grant','withdraw','expire')),
  level int NOT NULL CHECK (level BETWEEN 1 AND 3),
  version text NOT NULL,
  ip_hash text,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mentor_consents_student ON mentor_consents (student_id, at DESC);

CREATE TABLE mentor_view_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  space_id uuid NOT NULL REFERENCES spaces ON DELETE CASCADE,
  mentor_id text NOT NULL,
  student_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  what text NOT NULL,
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mentor_view_audit_student ON mentor_view_audit (student_id, at DESC);

-- Cached per-student numbers so a dashboard never scans raw trades for every member.
CREATE TABLE student_rollups (
  student_id text PRIMARY KEY REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  computed_at timestamptz NOT NULL DEFAULT now(),
  data jsonb NOT NULL
);

CREATE TABLE space_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES spaces ON DELETE CASCADE,
  reporter_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  side text NOT NULL CHECK (side IN ('student','mentor')),
  category text NOT NULL,
  details text NOT NULL DEFAULT '',
  severity text NOT NULL DEFAULT 'normal' CHECK (severity IN ('urgent','normal')),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','reviewing','closed')),
  escalated boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_report_per_issue_per_month ON space_reports (space_id, reporter_id, category, (date_trunc('month', created_at AT TIME ZONE 'UTC')));
REVOKE ALL ON mentorship_profiles, space_links, space_memberships, mentor_consents, mentor_view_audit, student_rollups, space_reports FROM PUBLIC;
