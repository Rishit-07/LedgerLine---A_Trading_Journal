# Database

Ledgerline stores its application data in Neon Postgres. The first migration creates one account record per verified Firebase UID. Firebase manages account credentials and sessions.

Run `npm run db:migrate` from the repository root to apply the idempotent SQL migrations in order to the branch identified by `DATABASE_URL_UNPOOLED`. The email migration stores About page newsletter opt-ins and the account welcome email queue.

The onboarding migration stores per-account setup progress and preferences in `user_profile`, creates the user's starting `rules`, and records broker preferences in `broker_links`. Daily loss as a percentage is derived from the saved risk per trade and daily limit in R.
