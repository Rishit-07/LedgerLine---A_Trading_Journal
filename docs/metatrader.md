# MetaTrader (MT4 and MT5)

Replaces the old Brokers panel in Settings. Two ways in.

**Import a report** (every plan). The user saves a history report (MT5: History > Report, HTML or CSV; MT4: Account History > Save as Detailed Report) and uploads it. `backend/src/metatrader-parse.js` reads it. Free accounts can bring in `FREE_MT_IMPORTS_PER_MONTH` (25, in `billing-config.js`) new trades per calendar month (UTC); Pro and Mentor have no cap. Re-importing the same trades does nothing (keyed on account and ticket).

**Live sync** (Pro and Mentor). The user creates a connection in Settings, installs `LedgerlineBridge.mq5` or `.mq4` (served from `frontend/public/metatrader/`), allows the Ledgerline address under Tools > Options > Expert Advisors, and pastes the token. The script sends closed trades to `POST /api/metatrader/ingest` with `Authorization: Bearer <token>`. Tokens are stored as SHA-256 hashes, shown once, revocable, and at most 3 per account. If Pro lapses (after the 3-day grace) the endpoint returns 403 `needs_plan`; trades already imported stay.

Rules worth knowing
- A trade needs a stop loss so R can be computed. Trades without one, or with the stop moved past entry, are skipped and listed, never guessed.
- Report times are the platform's server time and are stored as UTC.
- The scripts never place, modify or close orders and never touch passwords. They have not been compiled in MetaEditor here: compile and test them on a demo account before sharing.
- Everything is closed-trade, process-only; no currency amounts are stored from MetaTrader.

Monthly limits on the analysis tools (server side, `workspace.js` `spend()` and `usage()`; numbers in `billing-config.js` `FEATURE_LIMITS`, `AI_TOKENS` and `FREE_MT_IMPORTS_PER_MONTH`). Nothing is locked: every account can open Trade replay, Mistake lab and Ask your journal. Per calendar month (UTC):

| Tool | Free | Pro | Mentor |
|---|---|---|---|
| Trade replay (replays opened) | 5 | 150 | 1,000 |
| Mistake lab (new tags; editing a tag is free) | 5 | 300 | 2,000 |
| Ask your journal (questions) | 5 | 300 | 2,000 |
| AI trade review | 2 | 60 | 400 |
| AI habit insight | 2 | 60 | 400 |
| MetaTrader report import | 25 trades | no cap | no cap |
| MetaTrader live sync | not included | included | included |

AI token wallet (shared by Ask your journal, AI trade review and AI habit insight; `usage-limits.js` `tokenState()`):
- Free: 8,000 tokens a day, refilling at midnight IST.
- Pro: 600,000 tokens a month, and no more than 40,000 in any rolling hour (the cooldown; the message says how many minutes until it frees up).
- Mentor: 3,000,000 tokens a month, 150,000 an hour.

Past a limit the API answers 403 with `reason: 'limit'` (tool count) or 429 with `reason: 'tokens'` (wallet). A failed AI call is never charged. The billing page shows every meter, and its comparison table is built from the same config, so copy and enforcement cannot drift apart (a test checks the landing page and `plans.ts` too).
