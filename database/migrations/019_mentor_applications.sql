ALTER TABLE mentor_verifications DROP CONSTRAINT mentor_verifications_status_check;
ALTER TABLE mentor_verifications ADD CHECK(status IN ('draft','pending','needs_info','approved','rejected','revoked')),
 ADD id uuid UNIQUE NOT NULL DEFAULT gen_random_uuid(), ADD full_name text, ADD display_name text, ADD email text, ADD phone text, ADD photo bytea,
 ADD country text, ADD city text, ADD topics text[], ADD other_topic text, ADD markets text[], ADD levels text[], ADD languages text[], ADD bio text,
 ADD evidence_links text[], ADD sample_link text, ADD certifications text, ADD past_students_self_reported int,
 ADD sebi_registered boolean, ADD sebi_reg_number text, ADD sebi_verify_url text, ADD education_only_ack boolean,
 ADD promises text[], ADD terms_version text, ADD conduct_version text, ADD accepted_at timestamptz, ADD accepted_ip_hash text,
 ADD submitted_at timestamptz, ADD reviewed_at timestamptz, ADD reviewer_id text, ADD reviewer_note text, ADD next_review_at timestamptz,
 ADD step int NOT NULL DEFAULT 0;
UPDATE mentor_verifications SET status='draft' WHERE status='pending';
UPDATE mentor_verifications SET next_review_at=now() WHERE status='approved';
CREATE TABLE mentor_review_events(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,verification_id uuid NOT NULL,actor_id text NOT NULL,action text NOT NULL,reason text,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX mentor_events_application ON mentor_review_events(verification_id,created_at);
CREATE TABLE mentor_reports(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),space_id uuid REFERENCES spaces,mentor_id text NOT NULL,reporter_id text NOT NULL,reason text NOT NULL,status text NOT NULL DEFAULT 'open',created_at timestamptz NOT NULL DEFAULT now());
CREATE UNIQUE INDEX open_mentor_report ON mentor_reports(mentor_id,reporter_id) WHERE status='open';
CREATE TABLE mentor_mail(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,recipient text NOT NULL,status text NOT NULL,created_at timestamptz DEFAULT now(),retry_at timestamptz DEFAULT now());
CREATE TABLE billing_profiles(user_id text PRIMARY KEY REFERENCES ledgerline_accounts(firebase_uid) ON DELETE CASCADE,billing_name text NOT NULL,billing_email text NOT NULL,gstin text,address text NOT NULL);
ALTER TABLE spaces ADD topic text,ADD student_level text,ADD member_cap int NOT NULL DEFAULT 50,ADD cohort_start date,ADD cohort_end date,ADD space_rules text;
REVOKE ALL ON mentor_verifications,mentor_reports,mentor_review_events,mentor_mail,billing_profiles FROM PUBLIC;
