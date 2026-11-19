import nodemailer from 'nodemailer';

const retryInterval = 5 * 60_000;
const htmlEscape = (value) => value.replace(/[&<>"']/g, (char) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[char]);

export function readMailConfig(env) {
  const { GMAIL_ADDRESS, GMAIL_APP_PASSWORD, RESEND_API_KEY: apiKey, EMAIL_FROM: from, APP_URL: appUrl } = env;
  const gmailAddress = GMAIL_ADDRESS?.trim();
  const gmailPassword = GMAIL_APP_PASSWORD?.replace(/\s/g, '');
  const usesGmail = Boolean(gmailAddress || gmailPassword);
  if (!usesGmail && !apiKey) return null;
  const url = URL.parse(appUrl ?? '');
  const localPreview = env.NODE_ENV !== 'production' && url?.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if (!url || (url.protocol !== 'https:' && !localPreview) || url.username || url.password) {
    console.warn('Welcome email needs an HTTPS APP_URL or a loopback HTTP URL for local development.');
    return null;
  }
  if (usesGmail) {
    if (!/^[a-z0-9.]+@gmail\.com$/i.test(gmailAddress ?? '') || !/^[a-z0-9]{16}$/i.test(gmailPassword ?? '')) {
      console.warn('Welcome email needs a Gmail address and a Google app password.');
      return null;
    }
    const transporter = nodemailer.createTransport({
      host: 'smtp.gmail.com',
      port: 465,
      secure: true,
      auth: { user: gmailAddress, pass: gmailPassword },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
      disableFileAccess: true,
      disableUrlAccess: true,
    });
    return { provider: 'gmail', transporter, from: `Ledgerline <${gmailAddress}>`, origin: url.origin };
  }
  if (!from) {
    console.warn('Welcome email through Resend needs EMAIL_FROM.');
    return null;
  }
  return { provider: 'resend', apiKey, from, origin: url.origin };
}

export function prepareWelcome(config, claims) {
  if (!config || claims.email_verified !== true || !claims.email) return null;
  const firstName = typeof claims.name === 'string' ? claims.name.trim().split(/\s+/)[0].slice(0, 60) : '';
  const greeting = firstName ? `Hi ${firstName},` : 'Hi there,';
  const intro = 'Welcome to Ledgerline 🙌. We’re glad you’re here ❤️. You don’t need a perfect plan to start. One trade, one reason for taking it, and one note about what you learned is enough.';
  const aboutLabel = 'See how Ledgerline works';
  const journal = new URL('/auth', config.origin).href;
  const about = new URL('/about', config.origin).href;
  return {
    provider: config.provider,
    from: config.from,
    to: [claims.email],
    subject: 'Welcome to Ledgerline',
    text: `${greeting}\n\n${intro}\n\nOpen Ledgerline: ${journal}\n${aboutLabel}: ${about}\n\nSee you in the journal,\nThe Ledgerline team`,
    html: `<p>${htmlEscape(greeting)}</p><p>${intro}</p><p><a href="${htmlEscape(journal)}">Open Ledgerline</a></p><p><a href="${htmlEscape(about)}">${aboutLabel}</a></p><p>See you in the journal,<br>The Ledgerline team</p>`,
  };
}

async function sendResend(config, uid, message) {
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'Idempotency-Key': `ledgerline-welcome/${uid}`,
    },
    body: JSON.stringify(message),
    signal: AbortSignal.timeout(8000),
  });
  await response.body?.cancel();
  if (!response.ok) throw new Error(`Resend returned ${response.status}`);
}

export function startWelcomeDelivery(pool, config) {
  if (!config) return () => {};
  const usesGmail = config.provider === 'gmail';
  let draining = false;
  async function deliver() {
    if (draining) return;
    draining = true;
    try {
      for (let count = 0; count < 10; count++) {
        const { rows: [job] } = await pool.query(`
          WITH next AS (
            SELECT firebase_uid FROM ledgerline_welcome_emails
            WHERE payload IS NOT NULL AND (
              (coalesce(payload->>'provider', 'resend') = $2 AND next_attempt_at <= now())
              OR expires_at <= now()
            )
            ORDER BY next_attempt_at LIMIT 1 FOR UPDATE SKIP LOCKED
          )
          UPDATE ledgerline_welcome_emails AS email
          SET next_attempt_at = CASE WHEN $1::boolean THEN 'infinity'::timestamptz ELSE now() + interval '5 minutes' END,
              payload = CASE WHEN expires_at <= now() THEN NULL ELSE payload END
          FROM next WHERE email.firebase_uid = next.firebase_uid
          RETURNING email.firebase_uid, payload
        `, [usesGmail, config.provider]);
        if (!job) break;
        if (!job.payload) continue;
        const { provider, ...message } = job.payload;
        try {
          if (usesGmail) {
            await config.transporter.sendMail({
              ...message,
              from: config.from,
              to: { address: message.to[0] },
            });
          } else {
            await sendResend(config, job.firebase_uid, message);
          }
        } catch (error) {
          if (!usesGmail) {
            console.error('Welcome email delivery could not be completed. The queue will retry.');
            continue;
          }
          // Requeue only when SMTP explicitly rejected the send or DNS prevented the connection.
          if ((error.responseCode >= 400 && error.responseCode <= 599) || error.code === 'EDNS') {
            await pool.query(`
              UPDATE ledgerline_welcome_emails SET next_attempt_at = now() + interval '5 minutes' WHERE firebase_uid = $1
            `, [job.firebase_uid]);
            console.error('Gmail rejected a welcome email. The queue will retry.');
          } else {
            console.error('Gmail welcome email delivery could not be confirmed. No automatic retry will be made.');
          }
          continue;
        }
        await pool.query(`
          UPDATE ledgerline_welcome_emails SET sent_at = now(), payload = NULL WHERE firebase_uid = $1
        `, [job.firebase_uid]);
      }
    } catch (error) {
      console.error('Could not check the welcome email queue (' + (error.code ?? 'unknown error') + ').');
    } finally {
      draining = false;
    }
  }
  setInterval(() => void deliver(), retryInterval).unref();
  void deliver();
  return () => void deliver();
}
