# Ledgerline

Ledgerline is a trading journal that scores how consistently you follow your process. This build covers the landing page and its interactive sample demos.

## Run locally

Use Node.js 22.12 or later and run these commands from the repository root.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Run `npm run build` to write the production build to `frontend/dist/`, then `npm run preview` to serve it locally.

## Project layout

- [`frontend/`](frontend/) contains the Vite app, page markup, styles, and public assets. Start with [`frontend/index.html`](frontend/index.html) for markup and [`frontend/src/`](frontend/src/) for browser logic.
- [`backend/`](backend/) is reserved for server-side APIs and account authentication.
- [`database/`](database/) is reserved for the schema, migrations, and development seed data.

The browser app is the only component needed to run the current demo.

The Replay button sends signed-out visitors to `/auth` and continues to `/replay` after demo sign-in. The demo session is stored in the browser and can be ended from Replay or Dashboard. Replay and Dashboard currently show placeholder screens. Account authentication, account creation, and the welcome flow are still pending.
