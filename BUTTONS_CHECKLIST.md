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
