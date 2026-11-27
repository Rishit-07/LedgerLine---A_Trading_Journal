# MetaTrader (MT4 and MT5)

Replaces the old Brokers panel in Settings. Two ways in.

**Import a report** (every plan). The user saves a history report (MT5: History > Report, HTML or CSV; MT4: Account History > Save as Detailed Report) and uploads it. `backend/src/metatrader-parse.js` reads it. Free accounts can bring in `FREE_MT_IMPORTS_PER_MONTH` (25, in `billing-config.js`) new trades per calendar month (UTC); Pro and Mentor have no cap. Re-importing the same trades does nothing (keyed on account and ticket).

**Live sync** (Pro and Mentor). The user creates a connection in Settings, installs `LedgerlineBridge.mq5` or `.mq4` (served from `frontend/public/metatrader/`), allows the Ledgerline address under Tools > Options > Expert Advisors, and pastes the token. The script sends closed trades to `POST /api/metatrader/ingest` with `Authorization: Bearer <token>`. Tokens are stored as SHA-256 hashes, shown once, revocable, and at most 3 per account. If Pro lapses (after the 3-day grace) the endpoint returns 403 `needs_plan`; trades already imported stay.

Rules worth knowing
- A trade needs a stop loss so R can be computed. Trades without one, or with the stop moved past entry, are skipped and listed, never guessed.
- Report times are the platform's server time and are stored as UTC.
- The scripts never place, modify or close orders and never touch passwords. They have not been compiled in MetaEditor here: compile and test them on a demo account before sharing.
- Everything is closed-trade, process-only; no currency amounts are stored from MetaTrader.

Pro locks (server side, `workspace.js` `proPages`): Replay, Mistake lab and Ask your journal return 403 `{reason:'needs_plan'}` for Free accounts, and the page shows an unlock card with "See plans". AI reports were already gated in `reports.js`.
