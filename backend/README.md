# Backend

The account API validates the browser’s Firebase ID token and requires its `email_verified` claim. It uses the Firebase UID to get or create a Ledgerline account in Neon and returns its creation time. Requests with an unverified email receive HTTP 403 before any account lookup or write.

Copy [`.env.example`](.env.example) to `.env.local` and set `DATABASE_URL` to the pooled Neon URL and `DATABASE_URL_UNPOOLED` to the direct URL for migrations. Run `npm run db:migrate` and `npm run dev:backend` from the repository root.

The API listens on `127.0.0.1:8787` by default. A deployed frontend should route same-origin `/api/*` requests to the backend.

## Onboarding

`GET /api/onboarding` returns the verified user's saved step and answers. `PUT /api/onboarding` saves one step at a time. The account API exposes `onboardingCompleted` so returning users can go straight to the app. Progress and completion are stored by Firebase UID in Neon. Broker choices are preferences, and account setup does not connect any broker.

## Dashboard

`GET /api/dashboard` returns the verified user's completed onboarding profile, saved plan, active rules and metrics calculated from their trades. Dashboard and P&L dates use IST. `POST /api/trades` records a manual trade in a supported market, with optional realized R, stop and target. Rule checks are saved alongside the trade. The client request ID makes retries safe.

## Journal streak

The verified user's streak is rebuilt from their trades, first review timestamps, and rest-day entries, using `user_profile.timezone`. Changing timezone rebuckets trade and review instants. Explicit rest-day notes retain their recorded calendar dates. The published 2026 NSE/BSE equity schedules are in `exchange_holidays`. Add new notices and special sessions through migrations as those exchanges announce them.

Run `node --test backend/test/streak*.test.js` for the unit and API authorization tests. Set `STREAK_TEST_DATABASE_URL` to the direct URL of a migrated development database to include the transactional API integration test. Its test records are rolled back.

The `streakmaintenance` Neon Function and its five-minute UTC trigger are declared in `neon.ts`. It advances streaks after midnight in each user's timezone. It also sends at most one opt-in email reminder per local date when a sender is configured, and settles completed battles after the backfill window. The Node backend runs the same job while it is running unless `STREAK_NEON_SCHEDULE=true`. Set that flag when the hosted Function has the mail sender and public `APP_URL` configured. Provide those values through a private deployment environment passed to `neon deploy --env`.

## Email

`POST /api/newsletter` accepts an `{ "email": "…" }` JSON body from the About page. It stores one opt-in per normalized address in Neon. To send the weekly process note, use these opt-ins with a newsletter provider that handles unsubscribes and suppression. Account creation is independent of the newsletter.

`POST /api/support` uses the configured Gmail account to send messages to `ledgerline.team@gmail.com`. The form address is used for replies. The endpoint limits submissions and keeps the recipient fixed on the server. The form also provides an email-draft option.

Firebase sends verification emails using its built-in Authentication sender. Add the deployed frontend host under **Authentication → Settings → Authorized domains** so the verification link can return users directly to Ledgerline.

To enable separate welcome emails, set `APP_URL` to the public HTTPS origin and choose a sender. Apply the migrations before enabling delivery.

For local development, `APP_URL=http://127.0.0.1:5173` is also accepted. Links using that address open only on the computer running Ledgerline. Set `NODE_ENV=production` and use the public HTTPS address on the deployed backend.

- **Gmail** uses `GMAIL_ADDRESS` and `GMAIL_APP_PASSWORD` from the sending account. Use a [Google app password](https://support.google.com/accounts/answer/185833) and keep it in the backend environment. The host needs outbound access to `smtp.gmail.com` on TCP port 465. The sender appears as Ledgerline at that Gmail address.
- **Resend** uses `RESEND_API_KEY` and `EMAIL_FROM` on a [verified Resend domain](https://resend.com/docs/dashboard/domains/introduction). Leave the Gmail settings empty to use Resend.

The backend queues one welcome email when it creates a verified user’s first Ledgerline profile, even if the user verifies their address after a delay. It uses the verified recipient from Firebase’s token and links to `/auth` and `/about`. Existing profiles do not receive another welcome email. Welcome delivery is disabled when sender settings are absent.

Queued messages stay assigned to their original provider. Resend retries use a per-account [idempotency key](https://resend.com/docs/dashboard/emails/idempotency-keys). Gmail retries explicit SMTP rejections and DNS failures. If an attempt may have reached Gmail, the worker leaves it unscheduled to avoid duplicate mail. Pending messages expire after 23 hours.
