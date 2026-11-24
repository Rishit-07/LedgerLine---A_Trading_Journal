-- Undo 025. Take a backup first: this removes the reviewer audit history.
DROP TRIGGER IF EXISTS admin_audit_log_no_change ON admin_audit_log;
DROP FUNCTION IF EXISTS admin_audit_log_immutable();
DROP TABLE IF EXISTS admin_audit_log;
DELETE FROM ledgerline_schema_migrations WHERE name = '025_admin_audit_log.sql';
