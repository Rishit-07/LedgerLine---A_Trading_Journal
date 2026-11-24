# Notifications: stage 1 (Inbox and bell)

Built: tables (`028_notifications.sql`), `notify()`, list/read/unread/read-all/mute API, live stream, bell on every top bar, Inbox tab at `/notifications`.

## Differences from `Notifications.dc.html`
- The Settings and Newsletter tabs are not built yet (stages 2 and 3). The tab pill is hidden until they exist, so no dead tabs ship.
- The "Mute" toast says to undo it in Settings. That switch arrives in stage 2; until then a muted kind stays muted.
- Icons are two-letter codes per kind; the design uses a code per row. Button labels come from the kind (for example "Pick reward"), not per row.
- Motion uses GSAP (stagger on load, slide-in for new rows, collapse on mute, bell ring, press feedback). All of it is skipped under `prefers-reduced-motion`.
- Rows show an accent wash while unread (not in the design) so unread is visible without relying on the dot alone; the title also carries a screen-reader "Unread." prefix.
- Live updates use a streamed `fetch` (the stream needs the sign-in token). The event bus is in memory, so with more than one backend server a notification created on one server only reaches tabs connected to that same server. Use one server, or add Redis pub/sub before scaling out.

## Not done yet
- Domain events wired to `notify()`: only support replies so far. Streak-at-risk and reminder cron jobs, new sign-in, loss-limit, battle, follow, reward and renewal events come with Settings (they depend on quiet hours and reminder times).
- Push and email channels (stage 2).
- Run `npm run db:migrate` to apply migration 028.

# Stage 2: Settings

Built: channel matrix (6 kinds by in-app, push, email), quiet hours, delivery (instant or one 8 pm summary), reminders, always-on card, push device tokens, email and push delivery with held-back rows (`029_notification_settings.sql`, `notification-delivery.js`, `notification-schedule.js`).

## Differences from the design
- Push starts OFF for every kind. The design shows some push switches on, but a browser must grant permission first, so a switch cannot honestly start on.
- Community in-app starts ON (the design starts it off, which would hide follows and battles by default).
- Reminders reuse the existing streak reminder job and its time setting (8 pm, 9 pm, none) instead of a second job. It already skips days you logged or noted a rest day.
- "Allow email tracking" switch belongs to the newsletter and is added in stage 3.
- Quiet hours chips are Off, 10 pm to 7 am, 11 pm to 6 am. The time zone is stored (default Asia/Kolkata) but there is no zone picker in the design, so none was added.

## Owner setup for push (needs you)
1. Firebase console, Project settings, Cloud Messaging: create a Web Push certificate and put the public key in `frontend/.env.local` as `VITE_FIREBASE_VAPID_KEY`.
2. The backend already uses firebase-admin to send, so no new secret is needed.
3. Deploy with `public/firebase-messaging-sw.js` at the site root. The CSP now allows `fcmregistrations.googleapis.com` and `firebaseinstallations.googleapis.com`.
Until the key is set, turning a push switch on shows "Push is not set up on this site yet." and the switch returns to off.

## Not done / not tested
- Push and email sending were tested with fake senders only (delivery rules, quiet hours, summary collapse, dead-token removal logic), not against real Firebase or a mail server.
- Held rows are flushed by the existing 5-minute timer. If you run `STREAK_NEON_SCHEDULE=true`, that timer is off and held notifications are not sent; tell me and I will add the same call to that scheduler.
- Run `npm run db:migrate` for migration 029.
