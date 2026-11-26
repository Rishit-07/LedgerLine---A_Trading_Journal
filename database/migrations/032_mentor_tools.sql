-- Mentor tools: cohort content, assignments, feedback and the audit log. All scoped by space.
CREATE TABLE mentor_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  space_id uuid NOT NULL REFERENCES spaces ON DELETE CASCADE,
  actor_id text NOT NULL,
  action text NOT NULL,
  target_id text,
  detail text NOT NULL DEFAULT '',
  at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mentor_audit_log_space ON mentor_audit_log (space_id, at DESC);

CREATE TABLE mentor_announcements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES spaces ON DELETE CASCADE,
  author_id text NOT NULL,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 1000),
  pinned boolean NOT NULL DEFAULT false,
  publish_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX mentor_announcements_space ON mentor_announcements (space_id, pinned DESC, publish_at DESC);

CREATE TABLE space_agenda (
  space_id uuid NOT NULL REFERENCES spaces ON DELETE CASCADE,
  week_start date NOT NULL,
  body text NOT NULL CHECK (char_length(body) <= 2000),
  PRIMARY KEY (space_id, week_start)
);

CREATE TABLE mentor_assignments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES spaces ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  body text NOT NULL DEFAULT '' CHECK (char_length(body) <= 2000),
  due_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE assignment_submissions (
  assignment_id uuid NOT NULL REFERENCES mentor_assignments ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) BETWEEN 1 AND 4000),
  submitted_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'submitted' CHECK (status IN ('submitted','reviewed')),
  review_note text NOT NULL DEFAULT '',
  reviewed_at timestamptz,
  PRIMARY KEY (assignment_id, student_id)
);

CREATE TABLE space_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES spaces ON DELETE CASCADE,
  folder text NOT NULL CHECK (folder IN ('Checklists','Notes','Sample charts','Recordings')),
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  url text NOT NULL CHECK (url ~ '^https://' AND char_length(url) <= 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE space_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES spaces ON DELETE CASCADE,
  title text NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  starts_at timestamptz NOT NULL,
  link text NOT NULL CHECK (link ~ '^https://meet\.google\.com/' AND char_length(link) <= 500),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 600),
  capacity int CHECK (capacity IS NULL OR capacity BETWEEN 1 AND 500),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE space_session_guests (
  session_id uuid NOT NULL REFERENCES space_sessions ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  registered_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz,
  PRIMARY KEY (session_id, student_id)
);

CREATE TABLE space_rubrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL REFERENCES spaces ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  plan_quality int NOT NULL CHECK (plan_quality BETWEEN 0 AND 5),
  risk_rules int NOT NULL CHECK (risk_rules BETWEEN 0 AND 5),
  review_depth int NOT NULL CHECK (review_depth BETWEEN 0 AND 5),
  consistency int NOT NULL CHECK (consistency BETWEEN 0 AND 5),
  note text NOT NULL DEFAULT '' CHECK (char_length(note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX space_rubrics_student ON space_rubrics (student_id, created_at DESC);

CREATE TABLE mentor_notes (
  space_id uuid NOT NULL REFERENCES spaces ON DELETE CASCADE,
  student_id text NOT NULL REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,
  body text NOT NULL CHECK (char_length(body) <= 2000),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (space_id, student_id)
);
REVOKE ALL ON mentor_audit_log, mentor_announcements, space_agenda, mentor_assignments, assignment_submissions, space_resources, space_sessions, space_session_guests, space_rubrics, mentor_notes FROM PUBLIC;
