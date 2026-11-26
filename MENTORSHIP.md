# Mentorship (prompt 12)

One page, `/mentorship`, three states (no role, student, mentor). Joining happens only through a link: `/mentor/join?token=...`.

## Rules enforced on the server
- One role per account. Mentors need approved verification and an active mentor plan (through `backend/src/entitlements.js`). A mentor leads one space.
- Personal links are claim-bound: the first account that opens one owns it, a forward gets "This link has already been used". 7 day expiry, optional email lock. Open-seat links: 7/14/30 days, 5/10/25 seats, a new one kills the old one. Tokens are 256-bit and only a hash is stored.
- A student needs Pro, a verified email and ticks the rules and "18 or older". A student has one live mentor (database unique index); switching asks first and is atomic. A full space puts the student on a waitlist.
- Consent levels: Level 1 (process) required; Levels 2 (R results) and 3 (setups) default off, asked again every 90 days. Each change is logged in `mentor_consents`. Turning Level 1 off pauses coaching and hides all data at once.
- Mentors only get numbers computed by `mentorship-stats.js`, and only up to the level shared. Under 10 closed trades shows "Not enough data". Every view is logged in `mentor_view_audit` and the student can read that log.
- Role change: 15 days after creating a space (monthly plan) or 2 months (yearly), then a confirm closes the space (30 days read-only, new joins stop, plan cancelled through `cancelMentorPlan`). Verification is kept.
- Plan lapse: the daily sweep freezes the space read-only and tells members; renewing restores it. Nothing is deleted.
- Old paths are closed: creating or joining a space through the old `/api/spaces` returns "use Mentorship".

## Not built yet (from prompt 12)
- Substitute-mentor takeover and the admin report queue UI (reports are stored and escalate at 3 reporters, but there is no admin screen).
- Battles, public profile, reviews, co-mentors (belong to the tools prompt or later).
- Student-facing feedback notes and the mentor "send for review" flow.
- Under-18 handling is a tick box only; there is no date of birth on the account.

## Owner steps
Run `npm run db:migrate` for 031. Connect `cancelMentorPlan` and `planTerm` in `server.js` when billing lands (defaults: no-op and monthly). Have the consent wording and the "18 or older" approach reviewed.

## Mentor tools (migration 032)

Open the mentor page, then "Mentor tools": Cohort, Students, Feedback, Admin. Students see the same content under "From your mentor".

- Posts, weekly agenda, assignments (a reviewed assignment counts as a journaling day), resources (https only), house rules, process rubric (0 to 5), private notes, activity log, CSV export (logged).
- Posts that look like trade calls (buy/sell with a price) are refused.
- The mistake heat map shows only when 3 or more students share.
- Live sessions: Google Meet only. Students Register (optional seat limit). The Meet link is hidden until registered and opens 15 minutes before the start, for 3 hours. The mentor sees who registered and who joined. Reminders (1 day, 1 hour) go to registered students only. The calendar file and the Google Calendar link carry no Meet link.
- Create a Meet opens meet.new and the mentor pastes the link. Creating Meet links automatically needs each mentor to sign in with Google (Calendar API). Not built.
- Not built: AI digest, certificates, cohort leaderboard, public profile and reviews, co-mentors.
- Legacy tables `space_announcements` and `space_assignments` already exist from migration 015, so the new ones are `mentor_announcements` and `mentor_assignments`.
