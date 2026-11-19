# Ledgerline

Ledgerline is a trading journal that scores how consistently you follow your process. This build covers the landing page and its interactive sample demos.

## Run locally

Use Node.js 22.12 or later.

```sh
npm ci
npm run dev
```

Open the local URL printed by Vite. Run `npm run build` to create a production build and `npm run preview` to serve it locally.

## Project layout

- `index.html` contains the landing page and a shared notice for routes planned for later builds.
- `src/styles/tokens.css` contains the shared light and dark themes.
- `src/motion.js` drives scroll animations with GSAP ScrollTrigger.
- `src/playground.js` handles the sample Trader Score and Kelly sizing demos.

The sign-in link opens a temporary screen at `/auth`. Sign-in, account creation, and the welcome flow are the next page milestone.
