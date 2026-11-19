# Database

Ledgerline stores its application data in Neon Postgres. The first migration creates one account record per verified Firebase UID. Firebase manages account credentials and sessions.

Run `npm run db:migrate` from the repository root to apply the account migration to the branch identified by `DATABASE_URL_UNPOOLED`.
