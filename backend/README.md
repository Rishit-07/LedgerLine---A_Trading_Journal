# Backend

The account API accepts a Firebase ID token from the browser. It uses the verified Firebase UID to get or create a Ledgerline account in Neon and returns its creation time.

Copy [`.env.example`](.env.example) to `.env.local` and set `DATABASE_URL` to the pooled Neon URL and `DATABASE_URL_UNPOOLED` to the direct URL for migrations. Run `npm run db:migrate` and `npm run dev:backend` from the repository root.

The API listens on `127.0.0.1:8787` by default. A deployed frontend should route same-origin `/api/*` requests to the backend.
