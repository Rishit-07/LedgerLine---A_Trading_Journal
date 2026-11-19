# Ledgerline

Ledgerline is a trading journal that scores how consistently you follow your process. The current build includes the landing page, Firebase sign-in, and an account API backed by Neon Postgres.

## Run locally

Use Node.js 22.12 or later and run these commands from the repository root.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Run `npm run build` to write the production build to `frontend/dist/`, then `npm run preview` to serve it locally.

To run the account API, configure [`backend/.env.local`](backend/.env.example) with the Neon connections and run these commands from the repository root, using a separate terminal for the server.

```sh
npm run db:migrate
npm run dev:backend
```

Vite proxies `/api` requests from the dev and preview servers to the local API on port 8787.

## Project layout

- [`frontend/`](frontend/) contains the Vite app, page markup, styles, and public assets. Start with [`frontend/index.html`](frontend/index.html) for markup and [`frontend/src/`](frontend/src/) for browser logic.
- [`backend/`](backend/) verifies Firebase ID tokens and connects to Neon using server-side credentials.
- [`database/`](database/) contains PostgreSQL migrations.

## Authentication

The web app uses Firebase project `ledger-line-d2e8c` for email/password registration and sign-in, Google sign-in, and session restoration. Signed-out visitors to Replay and Dashboard go to `/auth` and return to their requested page after sign-in. Replay and Dashboard are still placeholders for their product features.

For isolated auth testing, start the Auth emulator with `npx -y firebase-tools@latest emulators:start --only auth --project ledger-line-d2e8c` and set `VITE_FIREBASE_USE_EMULATOR=true` in `frontend/.env.local` before starting Vite. The emulator is only supported by the frontend during development.

## Neon agent tooling

Project-scoped Codex MCP configuration is in [`.codex/config.toml`](.codex/config.toml). Codex uses OAuth for this connection. Open the repository as a Codex project and sign into Neon when prompted. The skill install is recorded in `skills-lock.json`.
