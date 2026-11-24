-- Undo 026. Everyone who turned on two-step sign-in goes back to password only.
DROP TABLE IF EXISTS totp_recovery_codes;
DROP TABLE IF EXISTS user_totp;
DELETE FROM ledgerline_schema_migrations WHERE name = '026_two_step_sign_in.sql';
