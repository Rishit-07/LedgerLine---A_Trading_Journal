/* Support tickets: the help form creates one, the user follows it under "My tickets",
   and the reviewer/admin account answers and resolves them. The team inbox still gets an email. */
import { isEmail, readJson, send } from './http.js';
import { reviewer, eligibleReviewer } from './mentor-verification.js';

export const inbox = 'ledgerline.team@gmail.com';
export const topics = ['Bug', 'Billing', 'Feature idea', 'Data request'];
const priorities = ['Low', 'Normal', 'Urgent'];
const statuses = ['open', 'in_progress', 'resolved'];
const text = (value) => typeof value === 'string' ? value.trim() : '';
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
export const reference = (id) => 'LL-' + id;

/* Only these technical details are kept, each as short plain text, whatever the browser sends. */
const DIAGNOSTIC_FIELDS = {
  page: 160, appVersion: 40, userAgent: 300, platform: 60, language: 20, timezone: 60, screen: 30, viewport: 30,
  pixelRatio: 10, theme: 20, online: 10, connection: 30, cookiesEnabled: 10, touch: 10, referrer: 160,
};
export function cleanDiagnostics(raw) {
  const out = {};
  if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
    for (const [key, max] of Object.entries(DIAGNOSTIC_FIELDS)) {
      if (raw[key] !== undefined && raw[key] !== null) out[key] = clean(raw[key], max);
    }
    if (Array.isArray(raw.recentErrors)) out.recentErrors = raw.recentErrors.slice(-5).map((item) => clean(item, 240));
  }
  return out;
}
const diagnosticLines = (diagnostics) => Object.entries(diagnostics).map(([key, value]) =>
  key + ': ' + (Array.isArray(value) ? (value.length ? '\n  - ' + value.join('\n  - ') : 'none') : value)).join('\n');

const forbid = (status, message) => { throw Object.assign(new Error(message), { status }); };
const idFrom = (value) => /^\d{1,15}$/.test(String(value ?? '')) ? String(value) : null;

export function createTicketApi(pool, mailConfig, { authenticate, identify, auth, notify = async () => null }) {
  let windowEnds = 0;
  let attempts = 0;
  const attemptsByEmail = new Map();

  async function mail(message) {
    if (!mailConfig?.transporter) return false;
    try {
      const result = await mailConfig.transporter.sendMail({ from: mailConfig.from, ...message });
      return Array.isArray(result?.accepted) ? result.accepted.length > 0 : true;
    } catch {
      console.error('A support email could not be delivered.');
      return false;
    }
  }

  const wrap = (work) => async (request, response) => {
    try {
      await work(request, response);
    } catch (error) {
      if (error?.status) return send(response, error.status, { error: error.message });
      throw error;
    }
  };

  async function readBody(request, max = 16384) {
    const { error, data } = await readJson(request, max);
    if (error || !data || typeof data !== 'object') forbid(error ?? 400, 'Enter a valid request.');
    return data;
  }

  /* POST /api/support — open a ticket. Works for visitors too; signed-in users get it linked to their account. */
  const create = wrap(async (request, response) => {
    const data = await readBody(request);
    const claims = await identify(request);
    const email = claims ? String(claims.email).toLowerCase() : text(data.email).toLowerCase();
    const subject = text(data.subject);
    const message = text(data.message);
    const { topic, priority } = data;
    if (!isEmail(email) || !subject || subject.length > 100 || /[\r\n]/.test(subject) ||
      !message || message.length > 1200 || !topics.includes(topic) || !priorities.includes(priority)) {
      return send(response, 400, { error: 'Check the email address, subject, and message.' });
    }
    const now = Date.now();
    if (now >= windowEnds) { windowEnds = now + 60 * 60_000; attempts = 0; attemptsByEmail.clear(); }
    const personal = attemptsByEmail.get(email) ?? 0;
    if (attempts >= 30 || personal >= 5) {
      response.setHeader('Retry-After', String(Math.ceil((windowEnds - now) / 1000)));
      return send(response, 429, { error: 'Too many requests. Try again later or email ' + inbox + '.' });
    }
    attempts++;
    attemptsByEmail.set(email, personal + 1);

    const diagnostics = data.diagnostics === undefined ? {} : cleanDiagnostics(data.diagnostics);
    if (Object.keys(diagnostics).length) {
      diagnostics.serverSeenAgent = clean(request.headers['user-agent'], 300);
      diagnostics.signedIn = claims ? 'yes' : 'no';
    }
    let ticket;
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      if (claims) {
        const known = await db.query('SELECT created_at FROM ledgerline_accounts WHERE firebase_uid=$1', [claims.uid]);
        if (known.rows[0]) diagnostics.accountCreated = new Date(known.rows[0].created_at).toISOString().slice(0, 10);
      }
      ticket = (await db.query(
        `INSERT INTO support_tickets(user_id,email,topic,priority,subject,diagnostics)
         VALUES($1,$2,$3,$4,$5,$6) RETURNING id`,
        [claims && diagnostics.accountCreated ? claims.uid : null, email, topic, priority, subject, JSON.stringify(diagnostics)])).rows[0];
      await db.query('INSERT INTO support_ticket_messages(ticket_id,author,body) VALUES($1,$2,$3)', [ticket.id, 'user', message]);
      await db.query('COMMIT');
    } catch {
      await db.query('ROLLBACK').catch(() => {});
      console.error('A support ticket could not be saved.');
      return send(response, 503, { error: 'We couldn’t save your ticket. Try again, or email ' + inbox + '.' });
    } finally {
      db.release();
    }
    const ref = reference(ticket.id);
    const details = Object.keys(diagnostics).length ? '\n\n--- Technical details (sent with the user’s consent) ---\n' + diagnosticLines(diagnostics) : '';
    const emailed = await mail({
      to: inbox, replyTo: { address: email },
      subject: `[Ledgerline Support • ${topic}] ${ref}: ${subject}`,
      text: `Ticket: ${ref}\nReply email: ${email}\nTopic: ${topic}\nPriority: ${priority}\nSigned in: ${claims ? 'yes' : 'no'}\n\n${message}${details}`,
    });
    if (emailed) {
      await mail({
        to: email, replyTo: { address: inbox },
        subject: `We got your request (${ref})`,
        text: `Hi,\n\nThanks for contacting Ledgerline. Your ticket reference is ${ref}.\nWe will reply by email, and signed-in users can follow it under Help → My tickets.\nFor further queries write to ${inbox} and quote ${ref}.\n\n— Ledgerline Support`,
      });
    }
    send(response, 200, { sent: true, ref, id: String(ticket.id) });
  });

  /* GET/POST /api/tickets — the signed-in user's own tickets. */
  const mine = wrap(async (request, response) => {
    const claims = await authenticate(request, response);
    if (!claims) return;
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET') {
      const id = url.searchParams.get('id');
      if (!id) {
        const { rows } = await pool.query(
          `SELECT id::text,subject,topic,priority,status,created_at,updated_at FROM support_tickets
           WHERE user_id=$1 ORDER BY updated_at DESC LIMIT 50`, [claims.uid]);
        return send(response, 200, { inbox, admin: eligibleReviewer(claims), items: rows.map((row) => ({ ...row, ref: reference(row.id) })) });
      }
      if (!idFrom(id)) return send(response, 404, { error: 'Ticket not found.' });
      const { rows: [row] } = await pool.query(
        'SELECT id::text,subject,topic,priority,status,created_at,updated_at,resolved_at FROM support_tickets WHERE id=$1 AND user_id=$2', [id, claims.uid]);
      if (!row) return send(response, 404, { error: 'Ticket not found.' });
      const messages = (await pool.query('SELECT author,body,created_at FROM support_ticket_messages WHERE ticket_id=$1 ORDER BY id', [id])).rows;
      return send(response, 200, { inbox, ticket: { ...row, ref: reference(row.id) }, messages });
    }
    const data = await readBody(request, 4096);
    const id = idFrom(data.id);
    const body = text(data.body);
    if (!id || !body || body.length > 1200) return send(response, 400, { error: 'Write a message under 1,200 characters.' });
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      const { rows: [row] } = await db.query('SELECT id FROM support_tickets WHERE id=$1 AND user_id=$2 FOR UPDATE', [id, claims.uid]);
      if (!row) { await db.query('ROLLBACK'); return send(response, 404, { error: 'Ticket not found.' }); }
      const { rows: [count] } = await db.query('SELECT count(*)::int AS n FROM support_ticket_messages WHERE ticket_id=$1', [id]);
      if (count.n >= 60) { await db.query('ROLLBACK'); return send(response, 429, { error: 'This conversation is long. Email ' + inbox + ' and quote ' + reference(id) + '.' }); }
      await db.query('INSERT INTO support_ticket_messages(ticket_id,author,body) VALUES($1,$2,$3)', [id, 'user', body]);
      await db.query("UPDATE support_tickets SET status=CASE WHEN status='resolved' THEN 'open' ELSE status END, resolved_at=NULL, updated_at=now() WHERE id=$1", [id]);
      await db.query('COMMIT');
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      db.release();
    }
    await mail({ to: inbox, replyTo: { address: claims.email }, subject: `[Ledgerline Support] ${reference(id)}: new reply`, text: `${reference(id)} from ${claims.email}:\n\n${body}` });
    send(response, 200, { saved: true });
  });

  /* GET/POST /api/ticket-admin — the reviewer/admin account only. */
  const admin = wrap(async (request, response) => {
    const claims = await authenticate(request, response);
    if (!claims) return;
    if (!await reviewer(claims, auth)) return send(response, 403, { error: 'Admin access required.' });
    const url = new URL(request.url, 'http://localhost');
    if (request.method === 'GET') {
      const id = url.searchParams.get('id');
      if (!id) {
        const filter = url.searchParams.get('status');
        const { rows } = await pool.query(
          `SELECT id::text,email,subject,topic,priority,status,created_at,updated_at,(user_id IS NOT NULL) AS member
           FROM support_tickets WHERE ($1::text IS NULL OR status=$1)
           ORDER BY (status='resolved'), (priority='Urgent') DESC, updated_at DESC LIMIT 200`, [statuses.includes(filter) ? filter : null]);
        const { rows: counts } = await pool.query('SELECT status,count(*)::int AS n FROM support_tickets GROUP BY status');
        return send(response, 200, { inbox, items: rows.map((row) => ({ ...row, ref: reference(row.id) })), counts: Object.fromEntries(counts.map((c) => [c.status, c.n])) });
      }
      if (!idFrom(id)) return send(response, 404, { error: 'Ticket not found.' });
      const { rows: [row] } = await pool.query(
        'SELECT id::text,email,subject,topic,priority,status,diagnostics,created_at,updated_at,resolved_at,(user_id IS NOT NULL) AS member FROM support_tickets WHERE id=$1', [id]);
      if (!row) return send(response, 404, { error: 'Ticket not found.' });
      const messages = (await pool.query('SELECT author,body,created_at FROM support_ticket_messages WHERE ticket_id=$1 ORDER BY id', [id])).rows;
      return send(response, 200, { ticket: { ...row, ref: reference(row.id) }, messages });
    }
    const data = await readBody(request, 4096);
    const id = idFrom(data.id);
    const body = text(data.body);
    const action = data.action;
    if (!id || !['reply', 'status'].includes(action) || (action === 'status' && !statuses.includes(data.status)) ||
      (action === 'reply' && (!body || body.length > 2000 || (data.status !== undefined && !statuses.includes(data.status))))) {
      return send(response, 400, { error: 'Check the reply and status.' });
    }
    let ticket;
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      ticket = (await db.query('SELECT id,email,subject,status,user_id FROM support_tickets WHERE id=$1 FOR UPDATE', [id])).rows[0];
      if (!ticket) { await db.query('ROLLBACK'); return send(response, 404, { error: 'Ticket not found.' }); }
      const next = action === 'status' ? data.status : (data.status ?? (ticket.status === 'open' ? 'in_progress' : ticket.status));
      if (action === 'reply') await db.query('INSERT INTO support_ticket_messages(ticket_id,author,body) VALUES($1,$2,$3)', [id, 'admin', body]);
      await db.query("UPDATE support_tickets SET status=$2, updated_at=now(), resolved_at=CASE WHEN $2='resolved' THEN now() END WHERE id=$1", [id, next]);
      await db.query('INSERT INTO admin_audit_log(actor_id,action,target,detail) VALUES($1,$2,$3,$4)',
        [claims.uid, 'ticket_' + action, reference(id), JSON.stringify({ from: ticket.status, to: next })]);
      await db.query('COMMIT');
      ticket.next = next;
    } catch (error) {
      await db.query('ROLLBACK').catch(() => {});
      throw error;
    } finally {
      db.release();
    }
    if (ticket.user_id && (action === 'reply' || ticket.next === 'resolved')) {
      await notify(ticket.user_id, 'account', {
        title: ticket.next === 'resolved' ? `${reference(id)} was marked resolved` : `Support replied to ${reference(id)}`,
        body: ticket.subject, target: '/tickets', dedupe: `ticket:${id}:${Date.now()}`,
      });
    }
    let emailed = null;
    if (action === 'reply' || (data.status === 'resolved' && ticket.status !== 'resolved')) {
      const ref = reference(id);
      emailed = await mail({
        to: ticket.email, replyTo: { address: inbox },
        subject: `Re: ${ref} ${ticket.subject}`,
        text: `${body ? body + '\n\n' : ''}${ticket.next === 'resolved' ? `We have marked ${ref} as resolved. If it is not fixed, reply to this email or write to ${inbox} and it will reopen.\n\n` : ''}Ticket ${ref}. Further queries: ${inbox}\n— Ledgerline Support`,
      });
    }
    send(response, 200, { saved: true, status: ticket.next, emailed });
  });

  return { create, mine, admin };
}
