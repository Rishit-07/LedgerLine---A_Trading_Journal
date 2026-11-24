-- Undo 024. Take a backup first: this removes the stored terms acceptances and the deletion log.
DROP TRIGGER IF EXISTS terms_acceptances_append_only ON terms_acceptances;
DROP FUNCTION IF EXISTS terms_acceptances_no_update();
DROP TABLE IF EXISTS terms_acceptances;
DROP TABLE IF EXISTS account_deletions;
DELETE FROM ledgerline_schema_migrations WHERE name = '024_terms_and_deletion_log.sql';
