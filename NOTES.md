# Implementation notes

## Gate and setup

Completed onboarding stays completed when a trader edits their name, markets, limits, hard rules or import preference in Settings. Market defaults use the saved choices and instrument suggestions come from the trader’s own history. Broker selection lives in Settings as requested. Manual logging and CSV imports work. Saving a broker preference does not authorize an external broker or synchronize its fills. Direct broker imports still require provider integrations and account authorization.

## Account boards

Profile, Badges, Settings and signed-in Support use their respective layouts. The private profile uses measured review, streak and badge counts in the hero. Its public visitor link uses the owner’s published portfolio. The shelf shows the six milestones currently awarded by the server. The additional reward choices, certificates, awards, follower metrics, cross-device appearance preference, full account export and self-service deletion in the later phases remain outstanding. Support messages and replies currently go through email.

## Journal replay

Entry and exit playback uses the timestamps and prices in the logged trade. Imported candles take precedence. With a server-side UPSTOX_HISTORY_TOKEN authorized for the intended display, Journal, History and Replay request historical candles from Upstox for matching Indian equity and derivative symbols. Bare symbols resolve against NSE. Prefix with BSE: for BSE. Only complete bars in the holding window are shown. If history is unavailable, the two execution events remain playable. This does not infer the price path between fills.

## Remaining phases

Later-phase items include daily journal autosave and writing milestones, trade-edit history and screenshot uploads, complete mentor verification and social follow flows, and rewards and certificate sharing. These require separate implementation and verification against their respective boards.
