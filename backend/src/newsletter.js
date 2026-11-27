/* The trading newsletter: double opt-in, signed links, one-click unsubscribe, issues, sending and bounce handling.
   Nothing is sent to anyone until they confirm from the email we send them. */
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { isEmail, readJson, send } from './http.js';
import { clientAddress } from './guard.js';
import { renderMarkdown, markdownToText } from './markdown.js';
import { makeToken, readToken, available as tokensAvailable } from './newsletter-tokens.js';
import { eligibleReviewer, reviewer } from './mentor-verification.js';

export const TOPICS = ['Market wrap', 'Process lessons', 'Journal and sizing tips', 'Product updates'];
export const FREQUENCIES = { weekly: 'Weekly, Sunday', weekdays: 'Weekdays, evening', monthly: 'Monthly' };
const GAP_DAYS = { weekly: 6, weekdays: 0.9, monthly: 27 };
export const PROMISE = 'Not investment advice. No tips, calls or paid signals, ever. Market facts link to their source. Unsubscribe in one click.';
export const TEMPLATE_VERSION = '2026-11';
const WORDING = 'Send me the Ledgerline trading newsletter (' + Object.values(FREQUENCIES).join(' / ') + '). ' + PROMISE;
const BATCH = 50;

const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
const pickTopics = (value) => Array.isArray(value) ? TOPICS.filter((t) => value.includes(t)) : null;
const pickFrequency = (value) => Object.hasOwn(FREQUENCIES, value) ? value : null;
const hashIp = (ip, env = process.env) => createHash('sha256').update(String(env.NEWSLETTER_SECRET ?? env.FIELD_ENCRYPTION_KEY ?? '') + '|' + ip).digest('hex').slice(0, 32);
const mask = (email) => email.replace(/^(.).*(@.*)$/, '$1•••$2');
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export function createNewsletterApi(pool, { authenticate, mail, auth, env = process.env, now = () => new Date() }) {
  const origin = () => mail?.origin ?? env.APP_URL ?? 'https://ledgerline.app';
  const url = (path) => new URL(path, origin()).href;
  const postal = () => env.NEWSLETTER_POSTAL_ADDRESS?.trim() ?? '';
  const ready = () => Boolean(mail) && tokensAvailable(env);

  function footer(sub) {
    const manage = url('/newsletter/manage?token=' + makeToken('manage', sub.id, env));
    const unsub = url('/newsletter/manage?token=' + makeToken('manage', sub.id, env) + '&unsubscribe=1');
    return {
      text: `\n\n--\n${PROMISE}\nUnsubscribe: ${unsub}\nManage preferences: ${manage}\nLedgerline${postal() ? ', ' + postal() : ''}\nWe do not track opens or clicks and never sell or share your email.`,
      html: `<hr><p style="font-size:12px;color:#666">${escapeHtml(PROMISE)}<br><a href="${escapeHtml(unsub)}">Unsubscribe</a> · <a href="${escapeHtml(manage)}">Manage preferences</a><br>Ledgerline${postal() ? ', ' + escapeHtml(postal()) : ''}<br>We do not track opens or clicks and never sell or share your email.</p>`,
    };
  }
  const oneClick = (sub) => ({
    'List-Unsubscribe': `<${url('/api/newsletter/unsubscribe?token=' + makeToken('manage', sub.id, env))}>, <mailto:${mail?.from?.match(/<(.+)>/)?.[1] ?? 'ledgerline.team@gmail.com'}?subject=unsubscribe>`,
    'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
  });

  async function deliverMail(message) {
    const payload = { from: mail.from, ...message };
    if (mail.provider === 'gmail') { await mail.transporter.sendMail({ ...payload, to: { address: message.to } }); return; }
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST', signal: AbortSignal.timeout(10000),
      headers: { Authorization: 'Bearer ' + mail.apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...payload, to: [message.to] }),
    });
    await response.body?.cancel();
    if (!response.ok) throw new Error('mail provider ' + response.status);
  }

  async function sendConfirmation(sub) {
    const link = url('/newsletter/confirm?token=' + makeToken('confirm', sub.id, env, now().getTime()));
    await deliverMail({
      to: sub.email, subject: 'Confirm your Ledgerline newsletter',
      text: `Tap to confirm you want the Ledgerline trading newsletter (${sub.topics.join(', ')}; ${FREQUENCIES[sub.frequency]}):\n${link}\n\nThe link works for 48 hours. Nothing is sent until you confirm. If this was not you, ignore this email.\n\n${PROMISE}`,
      html: `<p>Tap to confirm you want the Ledgerline trading newsletter (${escapeHtml(sub.topics.join(', '))}; ${escapeHtml(FREQUENCIES[sub.frequency])}).</p><p><a href="${escapeHtml(link)}">Confirm my subscription</a></p><p style="font-size:12px;color:#666">The link works for 48 hours. Nothing is sent until you confirm. If this was not you, ignore this email.<br>${escapeHtml(PROMISE)}</p>`,
    });
  }

  async function consent(email, userId, action, ipHash = null) {
    await pool.query('INSERT INTO newsletter_consents(email,user_id,action,wording,template_version,ip_hash) VALUES($1,$2,$3,$4,$5,$6)',
      [email, userId ?? null, action, action === 'subscribe' || action === 'confirm' ? WORDING : '', TEMPLATE_VERSION, ipHash]);
  }

  /** Start (or restart) double opt-in. Returns what happened without revealing whether the address was known. */
  async function startOptIn({ email, topics, frequency, userId, ip }) {
    const today = now().toISOString().slice(0, 10);
    const { rows: [existing] } = await pool.query('SELECT * FROM newsletter_subscribers WHERE email=$1', [email]);
    if (existing && (existing.status === 'subscribed' || existing.status === 'bounced')) {
      if (userId && !existing.user_id) await pool.query('UPDATE newsletter_subscribers SET user_id=$2 WHERE id=$1', [existing.id, userId]);
      return { sent: false };
    }
    if (existing && existing.resend_day?.toISOString?.().slice(0, 10) === today && existing.resend_count >= 3) return { sent: false, limited: true };
    const sameDay = existing?.resend_day?.toISOString?.().slice(0, 10) === today;
    const { rows: [sub] } = await pool.query(
      `INSERT INTO newsletter_subscribers(email,user_id,status,topics,frequency,confirm_expires_at,resend_day,resend_count)
       VALUES($1,$2,'pending',$3,$4,$5,$6,1)
       ON CONFLICT (email) DO UPDATE SET status='pending', topics=$3, frequency=$4, confirm_expires_at=$5,
         user_id=COALESCE($2, newsletter_subscribers.user_id), unsubscribed_at=NULL,
         resend_day=$6, resend_count=CASE WHEN $7 THEN newsletter_subscribers.resend_count + 1 ELSE 1 END
       RETURNING *`,
      [email, userId ?? null, topics, frequency, new Date(now().getTime() + 48 * 3600_000), today, sameDay]);
    await consent(email, userId, 'subscribe', ip ? hashIp(ip, env) : null);
    await sendConfirmation(sub);
    return { sent: true };
  }

  const ipOf = (request) => clientAddress(request, env.TRUST_PROXY === 'true', env) === 'unknown' ? '' : clientAddress(request, env.TRUST_PROXY === 'true', env);
  const body = async (request, response, max = 2048) => {
    const { error, data } = await readJson(request, max);
    if (error || !data || typeof data !== 'object') { send(response, error ?? 400, { error: 'Enter a valid request.' }); return null; }
    return data;
  };
  const tokenOf = (request) => new URL(request.url, 'http://localhost').searchParams.get('token');
  const view = (sub) => ({ email: mask(sub.email), status: sub.status, topics: sub.topics, frequency: sub.frequency });

  /* POST /api/newsletter: sign-up from the landing page footer (email only). */
  const subscribe = async (request, response) => {
    const data = await body(request, response, 1024);
    if (!data) return;
    const email = clean(data.email, 254).toLowerCase();
    if (!isEmail(email)) return send(response, 400, { error: 'Enter a valid email address.' });
    if (!ready()) return send(response, 503, { error: 'Subscriptions are temporarily unavailable.' });
    const topics = pickTopics(data.topics) ?? TOPICS;
    const result = await startOptIn({ email, topics: topics.length ? topics : TOPICS, frequency: pickFrequency(data.frequency) ?? 'weekly', ip: ipOf(request) });
    send(response, result.limited ? 429 : 200, result.limited ? { error: 'Too many confirmation emails today. Check your inbox.' } : { pending: true });
  };

  /* POST /api/newsletter/confirm {token}: the person tapped the link in the email. */
  const confirm = async (request, response) => {
    const data = await body(request, response, 512);
    if (!data) return;
    const id = readToken('confirm', data.token, env, now().getTime());
    if (!id) return send(response, 400, { error: 'This link has expired. Subscribe again to get a new one.' });
    const { rows: [sub] } = await pool.query(
      `UPDATE newsletter_subscribers SET status='subscribed', confirmed_at=COALESCE(confirmed_at,now()), unsubscribed_at=NULL
       WHERE id=$1 AND status IN ('pending','subscribed') RETURNING *`, [id]);
    if (!sub) return send(response, 400, { error: 'This subscription is no longer waiting for confirmation.' });
    await consent(sub.email, sub.user_id, 'confirm', hashIp(ipOf(request), env));
    send(response, 200, { ...view(sub), manageToken: makeToken('manage', sub.id, env) });
  };

  async function change(sub, data) {
    const topics = pickTopics(data.topics); const frequency = pickFrequency(data.frequency);
    if (data.topics !== undefined && (!topics || !topics.length)) return { error: 'Pick at least one topic.' };
    await pool.query('UPDATE newsletter_subscribers SET topics=COALESCE($2,topics), frequency=COALESCE($3,frequency) WHERE id=$1', [sub.id, topics, frequency]);
    return {};
  }
  async function unsubscribe(sub) {
    await pool.query("UPDATE newsletter_subscribers SET status='unsubscribed', unsubscribed_at=now() WHERE id=$1 AND status<>'unsubscribed'", [sub.id]);
    await consent(sub.email, sub.user_id, 'unsubscribe');
  }

  /* GET/POST /api/newsletter/manage: from the "manage preferences" link, no login needed. */
  const manage = async (request, response) => {
    let data = {};
    if (request.method === 'POST') { data = await body(request, response, 1024); if (!data) return; }
    const id = readToken('manage', request.method === 'GET' ? tokenOf(request) : data.token, env);
    if (!id) return send(response, 400, { error: 'This link is not valid.' });
    const { rows: [sub] } = await pool.query('SELECT * FROM newsletter_subscribers WHERE id=$1', [id]);
    if (!sub) return send(response, 404, { error: 'This subscription no longer exists.' });
    if (request.method === 'POST') {
      if (data.action === 'unsubscribe') await unsubscribe(sub);
      else if (data.action === 'update' && sub.status === 'subscribed') { const r = await change(sub, data); if (r.error) return send(response, 400, r); }
      else return send(response, 400, { error: 'Unknown action.' });
      const { rows: [fresh] } = await pool.query('SELECT * FROM newsletter_subscribers WHERE id=$1', [id]);
      return send(response, 200, view(fresh));
    }
    send(response, 200, view(sub));
  };

  /* POST /api/newsletter/unsubscribe?token=: the one-click header used by mail apps. Always unsubscribes. */
  const oneClickUnsubscribe = async (request, response) => {
    request.resume();
    const id = readToken('manage', tokenOf(request), env);
    if (!id) return send(response, 400, { error: 'This link is not valid.' });
    const { rows: [sub] } = await pool.query('SELECT * FROM newsletter_subscribers WHERE id=$1', [id]);
    if (sub) await unsubscribe(sub);
    send(response, 200, { unsubscribed: true });
  };

  /* GET/POST /api/newsletter/me: the signed-in person, always their verified account email. */
  const me = async (request, response) => {
    const claims = await authenticate(request, response);
    if (!claims) return;
    const email = String(claims.email ?? '').toLowerCase();
    if (!isEmail(email) || claims.email_verified !== true) return send(response, 409, { error: 'Verify your email address first.' });
    const find = async () => (await pool.query('SELECT * FROM newsletter_subscribers WHERE email=$1', [email])).rows[0];
    const state = (sub) => ({ email, status: sub?.status ?? 'none', topics: sub?.topics ?? TOPICS, frequency: sub?.frequency ?? 'weekly', admin: eligibleReviewer(claims), ready: ready() });
    if (request.method === 'GET') return send(response, 200, state(await find()));
    const data = await body(request, response);
    if (!data) return;
    let sub = await find();
    const action = data.action;
    if (action === 'subscribe' || action === 'resend') {
      if (!ready()) return send(response, 503, { error: 'Subscriptions are temporarily unavailable.' });
      const topics = action === 'resend' && sub ? sub.topics : pickTopics(data.topics);
      if (!topics?.length) return send(response, 400, { error: 'Pick at least one topic.' });
      const result = await startOptIn({ email, topics, frequency: action === 'resend' && sub ? sub.frequency : (pickFrequency(data.frequency) ?? 'weekly'), userId: claims.uid, ip: ipOf(request) });
      if (result.limited) return send(response, 429, { error: 'You can resend up to 3 times a day. Check your inbox and spam folder.' });
    } else if (action === 'cancel') {
      if (sub?.status === 'pending') await pool.query('DELETE FROM newsletter_subscribers WHERE id=$1', [sub.id]);
    } else if (action === 'unsubscribe') {
      if (sub) await unsubscribe(sub);
    } else if (action === 'update') {
      if (sub?.status !== 'subscribed') return send(response, 409, { error: 'Subscribe first.' });
      const r = await change(sub, data); if (r.error) return send(response, 400, r);
    } else if (action === 'send_latest') {
      if (sub?.status !== 'subscribed') return send(response, 409, { error: 'Subscribe first.' });
      const { rows: [issue] } = await pool.query("SELECT * FROM newsletter_issues WHERE status='sent' ORDER BY number DESC LIMIT 1");
      if (!issue) return send(response, 404, { error: 'There is no issue to send yet.' });
      const slot = `latest:${sub.id}:${now().toISOString().slice(0, 13)}`;
      const { rowCount } = await pool.query('INSERT INTO newsletter_events(event_id) VALUES($1) ON CONFLICT DO NOTHING', [slot]);
      if (!rowCount) return send(response, 429, { error: 'The latest issue was just sent. Try again in an hour.' });
      await sendIssue(issue, sub);
    } else {
      return send(response, 400, { error: 'Unknown action.' });
    }
    send(response, 200, state(await find()));
  };

  const issueView = (row) => ({ number: row.number, title: row.title, slug: row.slug, topic: row.topic, published_at: row.published_at });
  /* GET /api/newsletter/issues, or ?slug= for one issue with its web version. Public. */
  const issues = async (request, response) => {
    const slug = new URL(request.url, 'http://localhost').searchParams.get('slug');
    if (!slug) {
      const { rows } = await pool.query("SELECT number,title,slug,topic,published_at,body_md FROM newsletter_issues WHERE status='sent' ORDER BY number DESC LIMIT 30");
      return send(response, 200, { items: rows.map(({ body_md, ...r }) => ({ ...r, sections: sectionsOf(body_md) })), promise: PROMISE });
    }
    const { rows: [row] } = await pool.query("SELECT * FROM newsletter_issues WHERE slug=$1 AND status='sent'", [slug.slice(0, 80)]);
    if (!row) return send(response, 404, { error: 'This issue is not available.' });
    send(response, 200, { ...issueView(row), html: renderMarkdown(row.body_md), promise: PROMISE, address: postal() });
  };
  // "## Heading" blocks become the sample card's sections.
  const sectionsOf = (md) => [...String(md).matchAll(/^##\s+(.+)\n+([^\n#][^\n]*)/gm)].slice(0, 4).map((m) => ({ title: m[1].trim(), text: m[2].trim().slice(0, 160) }));

  async function sendIssue(issue, sub) {
    const f = footer(sub);
    const text = `${issue.title}\n\n${markdownToText(issue.body_md)}\n\nRead on the web: ${url('/newsletter/' + issue.slug)}${f.text}`;
    const html = `<h1>${escapeHtml(issue.title)}</h1>${renderMarkdown(issue.body_md)}<p><a href="${escapeHtml(url('/newsletter/' + issue.slug))}">Read on the web</a></p>${f.html}`;
    await deliverMail({ to: sub.email, subject: `Ledgerline #${issue.number}: ${issue.title}`, text, html, headers: oneClick(sub) });
  }

  /* Run on a timer: sends scheduled issues in batches. A person is never sent the same issue twice. */
  async function sendDueIssues() {
    if (!ready() || !postal()) return;
    const { rows: due } = await pool.query("SELECT * FROM newsletter_issues WHERE status='scheduled' AND scheduled_at <= $1 ORDER BY scheduled_at LIMIT 1", [now()]);
    for (const issue of due) {
      const eligible = `s.status='subscribed' AND $2 = ANY(s.topics) AND NOT EXISTS (SELECT 1 FROM newsletter_deliveries d WHERE d.issue_id=$1 AND d.subscriber_id=s.id)
        AND (s.last_sent_at IS NULL OR s.last_sent_at <= $3::timestamptz - ((CASE s.frequency WHEN 'weekly' THEN 6 WHEN 'weekdays' THEN 0.9 ELSE 27 END)::text || ' days')::interval)`;
      const { rows: batch } = await pool.query(`SELECT s.* FROM newsletter_subscribers s WHERE ${eligible} ORDER BY s.id LIMIT ${BATCH}`, [issue.id, issue.topic, now()]);
      let sent = 0; let failed = 0;
      for (const sub of batch) {
        let ok = false;
        try { await sendIssue(issue, sub); sent++; ok = true; } catch { failed++; }
        // Recorded either way, so one bad address cannot hold the whole run back.
        await pool.query('INSERT INTO newsletter_deliveries(issue_id,subscriber_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [issue.id, sub.id]);
        if (ok) await pool.query('UPDATE newsletter_subscribers SET last_sent_at=$2 WHERE id=$1', [sub.id, now()]);
      }
      const { rows: [left] } = await pool.query(`SELECT count(*)::int AS n FROM newsletter_subscribers s WHERE ${eligible}`, [issue.id, issue.topic, now()]);
      await pool.query(
        `UPDATE newsletter_issues SET sent_count=sent_count+$2, failed_count=failed_count+$3,
         status=CASE WHEN $4 THEN 'sent' ELSE status END, published_at=CASE WHEN $4 THEN COALESCE(published_at,now()) ELSE published_at END WHERE id=$1`,
        [issue.id, sent, failed, left.n === 0]);
    }
  }

  /* POST /api/newsletter/events: bounces and complaints from Resend (Svix signed). They unsubscribe the address. */
  const events = async (request, response) => {
    const secret = env.NEWSLETTER_WEBHOOK_SECRET;
    if (!secret) return send(response, 404, { error: 'Not available.' });
    const chunks = []; let size = 0;
    for await (const chunk of request) { size += chunk.length; if (size > 65536) return send(response, 413, { error: 'Too large.' }); chunks.push(chunk); }
    const raw = Buffer.concat(chunks).toString('utf8');
    const id = request.headers['svix-id']; const stamp = request.headers['svix-timestamp']; const given = String(request.headers['svix-signature'] ?? '');
    if (!id || !stamp || Math.abs(now().getTime() / 1000 - Number(stamp)) > 300) return send(response, 400, { error: 'Invalid signature.' });
    const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
    const good = createHmac('sha256', key).update(`${id}.${stamp}.${raw}`).digest('base64');
    const ok = given.split(' ').some((part) => { const sig = part.split(',')[1] ?? ''; return sig.length === good.length && timingSafeEqual(Buffer.from(sig), Buffer.from(good)); });
    if (!ok) return send(response, 400, { error: 'Invalid signature.' });
    const { rowCount } = await pool.query('INSERT INTO newsletter_events(event_id) VALUES($1) ON CONFLICT DO NOTHING', [String(id).slice(0, 120)]);
    if (rowCount) {
      let event = {}; try { event = JSON.parse(raw); } catch { /* ignore */ }
      const type = String(event.type ?? '');
      if (/bounced|complained/.test(type)) {
        for (const to of [].concat(event.data?.to ?? []).map((e) => String(e).toLowerCase())) {
          const { rows: [sub] } = await pool.query("UPDATE newsletter_subscribers SET status='bounced', unsubscribed_at=now() WHERE email=$1 AND status<>'bounced' RETURNING email,user_id", [to]);
          if (sub) await consent(sub.email, sub.user_id, /complained/.test(type) ? 'complaint' : 'bounce');
        }
      }
    }
    send(response, 200, { ok: true });
  };

  /* GET/POST /api/newsletter-admin: draft, preview, test, schedule. The reviewer/admin account only. */
  const admin = async (request, response) => {
    const claims = await authenticate(request, response);
    if (!claims) return;
    if (!await reviewer(claims, auth)) return send(response, 403, { error: 'Admin access required.' });
    if (request.method === 'GET') {
      const id = new URL(request.url, 'http://localhost').searchParams.get('id');
      if (id) {
        if (!/^\d{1,15}$/.test(id)) return send(response, 404, { error: 'Issue not found.' });
        const { rows: [row] } = await pool.query('SELECT * FROM newsletter_issues WHERE id=$1', [id]);
        return row ? send(response, 200, { issue: row, html: renderMarkdown(row.body_md) }) : send(response, 404, { error: 'Issue not found.' });
      }
      const { rows } = await pool.query('SELECT id::text,number,title,slug,topic,status,scheduled_at,published_at,sent_count,failed_count FROM newsletter_issues ORDER BY number DESC LIMIT 100');
      const { rows: counts } = await pool.query('SELECT status,count(*)::int AS n FROM newsletter_subscribers GROUP BY status');
      return send(response, 200, { items: rows, counts: Object.fromEntries(counts.map((c) => [c.status, c.n])), ready: ready(), hasAddress: Boolean(postal()), promise: PROMISE });
    }
    const data = await body(request, response, 40_000);
    if (!data) return;
    const idOf = () => (/^\d{1,15}$/.test(String(data.id ?? '')) ? String(data.id) : null);
    if (data.action === 'preview') return send(response, 200, { html: renderMarkdown(clean(data.body_md, 20000).length ? String(data.body_md).slice(0, 20000) : '') });
    if (data.action === 'save') {
      const title = clean(data.title, 140); const md = String(data.body_md ?? '').slice(0, 20000);
      if (!title || !md.trim() || !TOPICS.includes(data.topic)) return send(response, 400, { error: 'Add a title, a topic and the text.' });
      if (idOf()) {
        const { rowCount } = await pool.query("UPDATE newsletter_issues SET title=$2,topic=$3,body_md=$4 WHERE id=$1 AND status='draft'", [idOf(), title, data.topic, md]);
        if (!rowCount) return send(response, 409, { error: 'Only drafts can be edited.' });
        return send(response, 200, { saved: true, id: idOf() });
      }
      const { rows: [n] } = await pool.query('SELECT COALESCE(max(number),0)+1 AS n FROM newsletter_issues');
      const slug = `issue-${n.n}-${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50)}`.replace(/-$/, '');
      const { rows: [row] } = await pool.query('INSERT INTO newsletter_issues(number,title,slug,topic,body_md) VALUES($1,$2,$3,$4,$5) RETURNING id::text', [n.n, title, slug, data.topic, md]);
      return send(response, 200, { saved: true, id: row.id });
    }
    const id = idOf();
    if (!id) return send(response, 400, { error: 'Choose an issue.' });
    const { rows: [issue] } = await pool.query('SELECT * FROM newsletter_issues WHERE id=$1', [id]);
    if (!issue) return send(response, 404, { error: 'Issue not found.' });
    if (data.action === 'test') {
      if (!ready()) return send(response, 503, { error: 'Email is not set up on this server.' });
      await sendIssue(issue, { id: 0, email: String(claims.email).toLowerCase() });
      return send(response, 200, { sent: true, to: String(claims.email) });
    }
    if (data.action === 'schedule') {
      if (!ready() || !postal()) return send(response, 409, { error: 'Set NEWSLETTER_POSTAL_ADDRESS and email before scheduling. Every email must carry a sender address.' });
      if (issue.status === 'sent') return send(response, 409, { error: 'This issue was already sent.' });
      const when = data.when ? new Date(data.when) : now();
      if (Number.isNaN(when.getTime())) return send(response, 400, { error: 'Choose a valid time.' });
      await pool.query("UPDATE newsletter_issues SET status='scheduled', scheduled_at=$2 WHERE id=$1", [id, when]);
      await pool.query('INSERT INTO admin_audit_log(actor_id,action,target,detail) VALUES($1,$2,$3,$4)', [claims.uid, 'newsletter_schedule', 'issue-' + issue.number, JSON.stringify({ when })]);
      return send(response, 200, { scheduled: true });
    }
    if (data.action === 'unschedule') {
      await pool.query("UPDATE newsletter_issues SET status='draft', scheduled_at=NULL WHERE id=$1 AND status='scheduled' AND sent_count=0", [id]);
      return send(response, 200, { saved: true });
    }
    send(response, 400, { error: 'Unknown action.' });
  };

  return { subscribe, confirm, manage, oneClickUnsubscribe, me, issues, events, admin, sendDueIssues, startOptIn };
}
