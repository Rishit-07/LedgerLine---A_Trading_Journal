DROP INDEX IF EXISTS notifications_pending_idx;
ALTER TABLE notifications DROP COLUMN IF EXISTS push_pending;
ALTER TABLE notifications DROP COLUMN IF EXISTS email_pending;
DROP TABLE IF EXISTS push_tokens;
DROP TABLE IF EXISTS notification_settings;
