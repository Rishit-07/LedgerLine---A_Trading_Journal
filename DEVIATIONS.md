# Design deviations

## Badge shelf checkpoint

The supplied Badge board references a missing canvas runtime (`design/support.js`). Its source markup, embedded catalogue and styles were used as the reference. Pixel parity remains unverified.

- The shelf uses the existing Ledgerline shell and a responsive detail drawer, per the updated action map. The desktop shelf has four medal columns where space permits and the phone shelf has two.
- Current streak milestones and recorded clean-day runs have live progress. Badge criteria with no reliable source events show “Tracking unavailable”. The existing 14- and 60-day badges remain available.
- Community badges are visible to people with a club, space, active streak friendship, or earned community badge.
- Rewards, certificates, unlock redesign, Profile and You, Portfolio builder and public redesign, and Mentor tools are outside this checkpoint. The existing portfolio shows badges only after the owner explicitly shares them.

## Profile, portfolio and profile picture

- The Profile uses the supplied board's header and tab structure with live Ledgerline data. The sample follower counts, Gold tier and verification text were excluded. The follower figures remain unavailable, and Goals and the sample activity heatmap are not implemented.
- Performance uses the real journal aggregates and breakdowns. Its monthly and setup panels use data rows in place of the board's illustrated charts.
- The owner can reach Customize from the saved portfolio and change publishing, metric and picture visibility in Settings. Portfolio previews and share cards use the server's saved settings; share images contain a QR pointing to the current deployment's portfolio URL.
- Profile pictures appear in the authenticated account UI, network listings and connections, and community rosters and discussions. The shared portfolio and its share card include the picture only with the public picture switch enabled.

## Portfolio editor reference layout

The editor is now structured around the supplied Portfolio board. Saved visibility and opt-in process sections appear in the left column. The visual design chooser, shared-page sheets, share cards and QR tools appear on the right, and the columns stack at narrower widths. A separate guided builder, editable slug, custom evidence, mentor access, embed code, and broker verification remain outside this pass. Unsaved changes stay in the editor. The link, QR, and exported cards use the saved portfolio.

## Shared profile and share-card references

The visitor view uses the standalone Marginalia HTML as its visual reference. The supplied demo-only playbook, education, tools, location, and example notes have no corresponding public portfolio data and are omitted. The share card uses the reference’s violet frame, ivory identity panel, orange header, metrics tiles, and link strip. It shows only saved, opted-in metrics and uses rules-kept percentage where the sample shows an unsupported score tier. The portfolio PNG, SVG and print sheet use the same branded QR artwork as streak invites, with the actual saved portfolio URL.
