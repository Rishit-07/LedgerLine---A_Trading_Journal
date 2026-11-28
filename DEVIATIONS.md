# Deviations from the design pack

Things built differently from the design boards, or not built. Each needs your decision.

## Mentorship (`Spaces.dc.html`)
- The Mentorship screens use the board's wording but are not a pixel-for-pixel port. Tabs for Battles and a public profile are not built.
- Prompt 12 overrides prompt 05: students join by claim-bound links, not a roster or requests.
- The "18 or older" check is a tick box only.

## Mentor tools
- Not built: AI digest and draft, certificates, cohort challenge leaderboard, public profile and reviews, co-mentors and moderators.
- Live sessions use Google Meet links pasted by the mentor ("Create a Meet" opens meet.new). Creating Meet links automatically needs each mentor to sign in with Google.
- `space_announcements` and `space_assignments` already existed (migration 015), so the new tables are `mentor_announcements` and `mentor_assignments`.

## Billing
- Crypto only (CoinPayments). Razorpay (UPI, card, net banking) and the old crypto provider were removed on your instruction.
- Prices are USD and were raised a little from the sample: Pro $5.99 / $59, Mentor $17.99 / $179, intro $2.99 / $8.99. The intro price is for one-month purchases only.
- The invoice request to CoinPayments has not been tested against a real account.
- The billing intro card is matt black with champagne accents instead of the pink and blue gradient.

## Ledger bot
- The bot replaces Tally in the streak panel, badge dialog, streak toast, invite page and coach header. These in-card bots look at the cursor, idle and react to clicks, but do not pop in and out (only the bottom-right bot does).
- The bottom-right bot appears on Dashboard, Journal, Badges and the sign-in page, on screens 760px wide and up. On phones only the in-card bots show.
- The setting sits in Settings > Trading rules, as the design places it under Trading.
- Notes come from a fixed set of process-only sentences with the user's own numbers.

## MetaTrader and Pro locks
- Settings > Brokers (Zerodha, Upstox, Angel One, Dhan, Fyers, CSV radios) is replaced by a MetaTrader panel (report import and optional live sync). The design pack has no MetaTrader screen, so the panel reuses the neomorphic cards and standard buttons.
- Free import limit of 25 trades a month is my choice, set in `billing-config.js`.
- Replay, Mistake lab and Ask your journal stay open to everyone but are limited per month on the server (Free 5 each, Pro and Mentor 150 / 300 / 300). The numbers are my choice, set in `billing-config.js`.
- Buttons gain a shared hover sheen (primary) and press-in; the plan-ready screen no longer has a Replay button.
- The landing page, About page and FAQ no longer claim Zerodha, Upstox, Angel One, Dhan or Fyers sync, because that was never built; they describe MetaTrader import and Pro live sync only.
- Still open: the onboarding broker step and the `broker_links` table still store the old broker names (no code reads them to sync anything).
- AI trade review (on a trade's chart) and AI habit insight (Mistake lab) are new at your request. Limits and token tiers are my choice, set in `billing-config.js`.

## Loading screen, 404 page and hosting
- The Loading board's "Broker trades" row is shown as "MetaTrader trades" and only appears once the account has imported trades. "Mentor notes" only appears when the account has any. Rows use real counts from `/api/opening`; none are invented.
- GSAP is loaded from the npm package (dynamic import) instead of cdnjs, so the CSP needs no extra host. It still loads only on these two screens and not at all with reduced motion.
- `_redirects` has no catch-all, so unknown paths get a real HTTP 404 from `404.html`. This needs a host that honours `_redirects` and `404.html` (Cloudflare Pages and Netlify do).
- `robots.txt`, `sitemap.xml` and the canonical link are written only when `SITE_URL` is set at build time.

## Cookie consent and legal pages
- The banner offers two choices, "Essential only" and "Remember my preferences", because Ledgerline has no analytics or advertising storage. The only optional storage is the theme and the Ledger bot setting. Nothing optional is written before the visitor chooses. A "Cookie settings" link in the landing and legal footers and in Settings reopens it.
- Privacy and Terms were rewritten to match what is built (crypto-only billing, MetaTrader, AI allowances). Bracketed items remain for the operator and a lawyer. `TERMS_VERSION` in `auth.js` was not changed, so existing acceptances stay valid; bump it if you want people to accept again.
- New `/cookies` page (Cookie Policy tab). The spaces approval flag and the notification device ID are listed as essential storage.
- The welcome email uses a new shared layout. Spam placement is mostly a sending-domain issue; see `docs/email-deliverability.md`.

## MetaTrader guided setup
- The bridge scripts now send a heartbeat (an empty trade list) so the panel can show "Connected". Not yet compiled or run in MetaTrader.
- The landing copy no longer says the import works with "any broker"; it says MetaTrader 4 and 5 reports, and notes that live sync needs MetaTrader open or on a VPS.

## Docker and Turnstile
- The `Dockerfile` is for the API only and has not been built here (no Docker engine in the sandbox); the file layout was checked by hand and the server starts and stops at the environment check, as expected.
- Turnstile covers the support and newsletter forms only. Sign-up goes straight to Firebase, so the server cannot block it; App Check is the control there. It is off unless both keys are set.
- `/api` forwarding for production is documented in `docs/deploy.md` but not built.

## Cloudflare Pages forwarder and Render blueprint
- `functions/api/[[path]].js` forwards `/api/*` to the API and sends the visitor address with a shared `PROXY_KEY`; `guard.js` trusts it only when the key matches. Not yet run on a real Pages project.
- `render.yaml` describes the free Docker web service; secrets are entered in Render, never in the file. Not yet run on Render.
- Newsletter, mentorship and mentor-verification IP hashes now use the same address helper.

## Refunds, billing admin and email layout
- Refunds are recorded in the app and paid manually from your own wallet; the app cannot send crypto. There is no customer-facing refund button and no credit-note PDF yet.
- `/billing-admin` is reachable by URL for the reviewer account only; there is no link to it from the app menus.
- Billing, mentor, notification, streak and newsletter-confirmation emails now use the shared branded layout. The notification email link fell back to `https://ledgerline.app` when `APP_ORIGIN` was unset; it now uses `APP_URL` first.
