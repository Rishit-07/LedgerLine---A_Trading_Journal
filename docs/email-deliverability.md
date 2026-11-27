# Why Ledgerline emails land in spam, and what fixes it

The welcome email now uses a branded HTML layout (`backend/src/email-layout.js`) with a plain-text copy, no emoji, no remote images and no tracking. That helps, but design alone does not decide inbox or spam. Sender reputation and authentication do.

## Do these (owner steps)
1. **Send from your own domain, not a Gmail address.** Mail sent through `smtp.gmail.com` with a "Ledgerline" display name and a personal `@gmail.com` address looks like impersonation to filters. Use Resend (set `RESEND_API_KEY` and `EMAIL_FROM="Ledgerline <hello@yourdomain>"`) and leave `GMAIL_ADDRESS` and `GMAIL_APP_PASSWORD` empty.
2. **Verify the domain in Resend** and add the DNS records it shows: SPF, DKIM (and the return-path record).
3. **Add DMARC** as a TXT record on `_dmarc.yourdomain`, starting with `v=DMARC1; p=none; rua=mailto:you@yourdomain`, then move to `quarantine` once reports are clean.
4. **Use a real, monitored reply address** and keep the domain used in links the same as the sender domain.
5. **Warm up slowly.** A new domain with no history is treated cautiously. Send to real, engaged recipients first, and ask early testers to mark the welcome email "Not spam".
6. Check the result with a test to mail-tester.com or Gmail's "Show original" (SPF, DKIM and DMARC should all say PASS).

## Not done
The billing, mentor, newsletter and notification emails still use their own plain layouts. Moving them onto `email-layout.js` is the next step. Marketing mail such as the newsletter should also carry a one-click unsubscribe header.
