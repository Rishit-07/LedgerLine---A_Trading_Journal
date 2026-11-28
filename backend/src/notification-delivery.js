/* Email and push for notifications. notify() calls deliver(); flushPending() runs on a timer for rows held back
   by quiet hours or the daily summary. Both channels are injected, so tests need no mail server or Firebase. */
import { KINDS } from './notification-kinds.js';
import { DEFAULTS } from './notification-settings.js';
import { deliverNow } from './notification-schedule.js';

const channels = { sendEmail: null, sendPush: null };
export function configureDelivery(next) { Object.assign(channels, next); }

import { branded } from './email-layout.js';
const origin = () => process.env.APP_ORIGIN ?? (process.env.APP_URL ? new URL(process.env.APP_URL).origin : 'https://ledgerline.app');
const link = (path) => new URL(path, origin()).href;

async function context(pool, userId, kind) {
  const [{ rows: [pref] }, { rows: [settings] }, { rows: [tokens] }] = await Promise.all([
    pool.query('SELECT push,email FROM notification_prefs WHERE user_id=$1 AND kind=$2', [userId, kind]),
    pool.query('SELECT email,quiet,delivery,tz FROM notification_settings WHERE user_id=$1', [userId]),
    pool.query('SELECT count(*)::int AS n FROM push_tokens WHERE user_id=$1', [userId]),
  ]);
  return {
    pref: pref ?? DEFAULTS[kind] ?? { push: false, email: false },
    settings: settings ?? { email: null, quiet: '22-07', delivery: 'instant', tz: 'Asia/Kolkata' },
    devices: tokens.n,
  };
}

/** Called right after a notification is stored. Never throws. */
export async function deliver(pool, userId, row, now = new Date()) {
  try {
    const meta = KINDS[row.kind];
    if (!meta || (!channels.sendEmail && !channels.sendPush)) return;
    const { pref, settings, devices } = await context(pool, userId, row.kind);
    // Safety kinds always go out and ignore quiet hours and the daily summary.
    const wantEmail = (meta.locked || pref.email) && Boolean(settings.email) && Boolean(channels.sendEmail);
    const wantPush = (meta.locked || pref.push) && devices > 0 && Boolean(channels.sendPush);
    const now_ = meta.locked || deliverNow(settings, now);
    if (wantEmail) {
      if (now_) await channels.sendEmail(settings.email, [row]).catch(() => {});
      else await pool.query('UPDATE notifications SET email_pending=true WHERE id=$1', [row.id]);
    }
    if (wantPush) {
      if (now_) await channels.sendPush(userId, [row]).catch(() => {});
      else await pool.query('UPDATE notifications SET push_pending=true WHERE id=$1', [row.id]);
    }
  } catch { console.error('A notification could not be delivered.'); }
}

/** Sends what was held back once quiet hours or the wait for the daily summary is over.
    Several rows are collapsed into one email, and into one push when there are more than three. */
export async function flushPending(pool, now = new Date()) {
  const { rows: people } = await pool.query(
    `SELECT DISTINCT n.user_id, s.email, s.quiet, s.delivery, s.tz FROM notifications n
     JOIN notification_settings s ON s.user_id=n.user_id WHERE n.email_pending OR n.push_pending LIMIT 200`);
  for (const person of people) {
    if (!deliverNow(person, now)) continue;
    const { rows } = await pool.query(
      `SELECT id::text,kind,title,body,target_url,email_pending,push_pending FROM notifications
       WHERE user_id=$1 AND (email_pending OR push_pending) ORDER BY id LIMIT 50`, [person.user_id]);
    const mail = rows.filter((r) => r.email_pending);
    const push = rows.filter((r) => r.push_pending);
    try {
      if (mail.length && person.email && channels.sendEmail) await channels.sendEmail(person.email, mail);
      if (push.length && channels.sendPush) await channels.sendPush(person.user_id, push);
    } catch { continue; }
    await pool.query('UPDATE notifications SET email_pending=false, push_pending=false WHERE id = ANY($1::bigint[])', [rows.map((r) => r.id)]);
  }
}

/** Real senders. `mail` is the app's mail config; `messaging` is firebase-admin's messaging. */
export function createSenders({ pool, mail, messaging }) {
  const sendEmail = async (to, rows) => {
    if (!mail) return;
    const lines = rows.map((r) => `• ${r.title}${r.body ? '\n  ' + r.body : ''}\n  ${link(r.target_url)}`).join('\n\n');
    const branding = branded({
      title: rows.length === 1 ? rows[0].title : `${rows.length} updates from Ledgerline`,
      lines: rows.flatMap((r) => [r.body ? `${r.title}\n${r.body}` : r.title]),
      action: { label: rows.length === 1 ? 'Open it' : 'Open Ledgerline', href: link(rows.length === 1 ? rows[0].target_url : '/notifications') },
      origin: origin(), reason: 'You are getting this because you turned on email updates. Choose what reaches you in Settings.',
    });
    const message = {
      from: mail.from, to: { address: to },
      subject: rows.length === 1 ? rows[0].title : `${rows.length} updates from Ledgerline`,
      text: `${lines}\n\nChoose what reaches you: ${link('/notifications')}`, html: branding.html,
    };
    if (mail.provider === 'gmail') { await mail.transporter.sendMail(message); return; }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(8000),
      headers: { Authorization: 'Bearer ' + mail.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...message, to: [to] }),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error('mail provider');
  };
  const sendPush = async (userId, rows) => {
    if (!messaging) return;
    const { rows: tokens } = await pool.query('SELECT device_id,token FROM push_tokens WHERE user_id=$1', [userId]);
    if (!tokens.length) return;
    const items = rows.length > 3 ? [{ title: `${rows.length} new updates`, body: 'Open Ledgerline to see them.', target_url: '/notifications' }] : rows;
    for (const item of items) {
      const result = await messaging.sendEachForMulticast({
        tokens: tokens.map((t) => t.token),
        notification: { title: item.title, body: item.body ?? '' },
        webpush: { fcmOptions: { link: link(item.target_url) } },
      });
      // Remove tokens the push service says are dead.
      const dead = [];
      result.responses.forEach((r, i) => {
        if (!r.success && /registration-token-not-registered|invalid-registration-token/.test(r.error?.code ?? '')) dead.push(tokens[i].device_id);
      });
      if (dead.length) await pool.query('DELETE FROM push_tokens WHERE user_id=$1 AND device_id = ANY($2::text[])', [userId, dead]);
    }
  };
  return { sendEmail, sendPush };
}
