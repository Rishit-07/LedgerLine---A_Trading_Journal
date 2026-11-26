DROP TABLE IF EXISTS space_reports, student_rollups, mentor_view_audit, mentor_consents, space_memberships, space_links, mentorship_profiles;
DROP INDEX IF EXISTS one_live_space_per_mentor;
ALTER TABLE spaces DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS links_paused, DROP COLUMN IF EXISTS closing_until, DROP COLUMN IF EXISTS focus,
  DROP COLUMN IF EXISTS welcome_message, DROP COLUMN IF EXISTS plan_term, DROP COLUMN IF EXISTS frozen_at;
