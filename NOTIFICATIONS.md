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
