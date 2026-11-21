# Implementation notes

## Gate and setup

Completed onboarding stays completed when a trader edits their name, markets, limits, hard rules or import preference in Settings. Market defaults use the saved choices and instrument suggestions come from the trader’s own history. Broker selection lives in Settings as requested. Manual logging and CSV imports work. Saving a broker preference does not authorize an external broker or synchronize its fills. Direct broker imports still require provider integrations and account authorization.

## Account boards

Profile, Badges, Settings and signed-in Support use their respective layouts. The private profile uses measured review, streak and badge counts in the hero. Its public visitor link uses the owner’s published portfolio. The shelf shows the six milestones currently awarded by the server. The additional reward choices, certificates, awards, follower metrics, cross-device appearance preference, full account export and self-service deletion in the later phases remain outstanding. Support messages and replies currently go through email.

## Journal replay

Journal shows optional before- and after-trade screenshots. A trader can attach the first when logging an entry and the second when closing the position, or edit them later in Journal. The backend stores a resized, metadata-stripped image per stage and Firebase UID. Deleting a trade removes its screenshots.

History and Replay can request historical candles for supported Indian symbols when the server has an authorized UPSTOX_HISTORY_TOKEN. Imported candles take precedence. Replay also accepts one chart export containing up to 500 candle rows. Without candles, traders can review their images and recorded executions.

## Remaining phases

Later-phase items include daily journal autosave and writing milestones, trade-edit history, complete mentor verification and social follow flows, and rewards and certificate sharing. These require separate implementation and verification against their respective boards.
