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
- Still open: the landing page "Brokers" section and onboarding broker step still describe the old broker list.
