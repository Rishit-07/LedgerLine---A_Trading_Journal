# Buttons checklist

Each control, the test that covers it, and the result. API tests run on a real Postgres engine (PGlite) with the real migrations; browser checks used stub data in light and dark, 1440 px and 390 px.

## Notifications: Inbox and bell

| Control | What it does | API check | Browser check |
|---|---|---|---|
| Bell (every page) | Opens /notifications; shows the unread count in its accessible name; dot and ping only when unread > 0 | `GET /api/notifications/count` | Pass |
| Filter chips (All, Unread, 5 categories) | Reloads the list with that filter | `?filter=3`, `?filter=unread` | Pass |
| Primary action (Log now, Open plan, Pick reward, Open, Review, Billing) | Marks the row read, then opens its target | `read` action; unsafe targets such as `//evil.com` become `/dashboard` | Pass |
| Mark read / Mark unread | Toggles read state, rolls back with a toast on error | `read`, `unread`, other users get 404 | Pass |
| Mute this kind | Sets the category's in-app switch off, removes its rows, toast says where to undo | `mute`; always-on kinds stay; bad category 400 | Pass |
| Mark all read | Marks all read; button becomes pressed "All read" | `read_all` | Pass |
| Infinite scroll | Loads 30 more when the end is near | page 1 = 30 with `next`, page 2 = rest | Not tested with many rows in a browser |
| Live arrival | New row slides in, bell rings, count updates | `bus` emit on `notify()` | Not tested end to end (needs a signed-in session and the stream) |

Open items are listed in `NOTIFICATIONS.md`.

## Notifications: Settings

| Control | What it does | API check | Browser check |
|---|---|---|---|
| Tab pill (Inbox, Settings, Newsletter) | Switches panels, keyboard arrows move between tabs | n/a | Pass |
| Channel switches (6 kinds by in-app, push, email) | Saves the switch; first change starts from the defaults | `PUT {kind,channel,value}`; first change persists; unknown or always-on kinds are ignored | Pass |
| Push switch on | Asks the browser for permission, saves this device's token; on denial or missing setup the switch returns to off with a toast | device token save, 10 device cap | Missing-setup path only (no VAPID key in test) |
| Quiet hours chips | Saves the window; no push or email inside it | `PUT {quiet}`, bad value 400, schedule unit tests | Pass |
| Delivery chips | Instant, or one summary at 8 pm | `PUT {delivery}`; held rows flush at 8 pm as one email | Pass |
| Reminders chips | Sets the existing streak reminder time (or off) through `/api/streak/preferences` | existing streak tests | Pass (stub) |
| Always-on card | Display only, no switches | locked kinds ignore any change; security email bypasses quiet hours | Pass |

## Newsletter

| Control | What it does | API check | Browser check |
|---|---|---|---|
| Landing footer form | Sends a confirmation email; message says to check the inbox | `POST /api/newsletter` returns `{pending:true}`; already subscribed looks identical | Message text only |
| Topic chips | Toggle topics, at least one stays on; saves at once if subscribed | `update` rejects empty topics | Not run (needs sign-in) |
| Frequency chips | Weekly, weekdays, monthly; saves at once if subscribed | `update` | Not run (needs sign-in) |
| Subscribe / Resend / Cancel | Starts or repeats opt-in, 3 resends a day, cancel removes the pending request | resend cap 429 on the 4th | Not run (needs sign-in) |
| Send me the latest issue | Mails the latest issue once an hour | second call within the hour 429 | Not run |
| Unsubscribe (tab, email link, one-click header) | Stops all mail and records consent withdrawal | all three paths | Manage page: Pass (mocked API) |
| Read (past issues) and `/newsletter/:slug` | Web version of a sent issue | public list and slug fetch | Pass (mocked API) |
| `/newsletter/confirm?token=` | Confirms only on the page's POST, so link scanners cannot subscribe anyone | expired and forged tokens rejected | Pass (mocked API) |
| `/newsletter-admin` (admin only) | Save draft, preview light/dark, test to me, schedule, unschedule, counts | non-admin 403, schedule audit-logged, sends once | Not run (needs admin sign-in) |

## Mentorship

| Control | What it does | API check | Browser check |
|---|---|---|---|
| I want a mentor / I want to be a mentor | Sets the role (only from "none") | `choose_role`; second choice 409 | Pass (stubbed API) |
| Change role (label changes) | Free, Cancel mentor plan, "Change role in N days" (disabled), or close-space confirm | cooldown 403 server-side, confirm_close 409, closes 30 days read-only | Label states: Pass (stubbed API) |
| Create space | Needs mentor role, approved verification and active mentor plan; one live space | `not_mentor`, `not_verified`, `needs_plan`, second space 409 | Not run signed in |
| Make a personal link / Make a new link / Stop link | Claim-bound 7 day link, token shown once and stored hashed; resend kills the old one | claimed link refused for second person (410 used), email lock 403, expired 410 | Page renders: Pass |
| Make an open-seat link | 7/14/30 days, 5/10/25 seats, new one revokes old | revoked 410 | Page renders: Pass |
| Pause all links | Stops every link, members stay | 423 paused | Not run |
| Find space (paste link) and Join | Preview card, consent screen, joins atomically | no Pro 402, unverified email 403, no consent 400, one live mentor, switch needs confirmation | Not run signed in |
| Level 1 / 2 / 3 switches | Student changes what the mentor sees, logged, applies immediately | level 1 off pauses coaching and hides all data | Not run signed in |
| Leave space | Ends access at once, clears cached numbers | live membership count stays 1 | Not run |
| Let in / Remove | Waitlist to active; removal gives 7 days notice and a written reason | cap check | Not run |
| Report a problem | One per issue per month, 3 reporters escalates | duplicate 409 | Not run |
| Mentor tools: Post, Pin, Delete, Schedule session, Create a Meet, Open Meet, Cancel session, Give assignment, Mark reviewed, Save agenda, Add resource, Save rules, Export CSV, Send feedback, Save note | Mentor page > Mentor tools | /api/mentor-tools | Done, tested on Postgres engine |
| From your mentor: Register, Join on Google Meet, Add to Google Calendar, Calendar file, Cancel registration, Submit | My mentor tab | /api/mentor-tools | Done |
