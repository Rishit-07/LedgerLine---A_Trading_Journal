-- Least-privilege database role for the running API. Run once as the database owner, after choosing a strong password.
-- The API connects as ledgerline_app (can read and write rows only). Migrations keep using the owner via DATABASE_URL_UNPOOLED.
-- In Neon: Roles tab > New role, or run this in the SQL editor. Then put the new role's connection string in DATABASE_URL.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ledgerline_app') THEN
    CREATE ROLE ledgerline_app LOGIN PASSWORD 'CHANGE_ME_TO_A_LONG_RANDOM_PASSWORD';
  END IF;
END $$;
GRANT CONNECT ON DATABASE neondb TO ledgerline_app;   -- change neondb if your database has another name
GRANT USAGE ON SCHEMA public TO ledgerline_app;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ledgerline_app;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO ledgerline_app;
-- Tables and sequences added by later migrations get the same rights.
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ledgerline_app;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO ledgerline_app;
-- The app may add to the audit logs but never change history.
REVOKE UPDATE, DELETE ON admin_audit_log FROM ledgerline_app;
REVOKE UPDATE ON terms_acceptances FROM ledgerline_app;
-- Never DROP, ALTER, TRUNCATE or CREATE: those stay with the owner.
