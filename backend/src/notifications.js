/* Notifications: one notify() applies the person's switches, stores the inbox row and tells open pages.
   The API lists, marks read, mutes a category and streams new rows to open tabs. */
import { EventEmitter } from 'node:events';
import { readJson, send } from './http.js';
import { KINDS, lockedKinds, switchableKinds } from './notification-kinds.js';

export const bus = new EventEmitter();
bus.setMaxListeners(0);
const KEEP_DAYS = 90;
const PAGE = 30;

// Trading results and tips never go in a notification. Plan prices are fine because billing is not trading.
const MONEY = /(?:[$€£₹]|\b(?:rs\.?|inr|usd)\b)\s?\d|\d[\d,.]*\s?(?:rupees|dollars|usd|inr)\b/i;
const PNL = /\b(?:profit|p&l|pnl|you (?:made|lost|won)|buy|sell|target price|stop price)\b/i;
export function allowedText(kind, ...parts) {
  const text = parts.join(' ');
  if (KINDS[kind]?.category === 4 && /billing|account|security/.test(kind)) return !PNL.test(text);
  return !MONEY.test(text) && !PNL.test(text);
}

const clip = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
const safeTarget = (value) => typeof value === 'string' && /^\/(?!\/)[\w\-./?=&#%]*$/.test(value) && value.length <= 200 ? value : '/dashboard';

/** Create a notification. `dedupe` makes a repeat of the same event a no-op. Returns the row, or null if skipped. */
export async function notify(pool, userId, kind, { title, body = '', target = '/dashboard', dedupe = null }) {
  const meta = KINDS[kind];
  if (!meta) throw new Error('Unknown notification kind.');
  const cleanTitle = clip(title, 140);
  const cleanBody = clip(body, 300);
  if (!cleanTitle || !allowedText(kind, cleanTitle, cleanBody)) return null;
  if (!meta.locked) {
    const { rows: [pref] } = await pool.query('SELECT in_app FROM notification_prefs WHERE user_id=$1 AND kind=$2', [userId, kind]);
    if (pref && pref.in_app === false) return null;
  }
  const { rows: [row] } = await pool.query(
    `INSERT INTO notifications(user_id,kind,category,title,body,target_url,dedupe_key)
     VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT (user_id,dedupe_key) WHERE dedupe_key IS NOT NULL DO NOTHING
     RETURNING id::text,kind,category,title,body,target_url,created_at,read_at`,
    [userId, kind, meta.category, cleanTitle, cleanBody, safeTarget(target), dedupe ? clip(dedupe, 120) : null]);
  if (!row) return null;
  bus.emit(userId, row);
  return row;
}

const visible = `n.created_at > now() - interval '${KEEP_DAYS} days' AND (
  n.kind = ANY($2::text[]) OR NOT EXISTS (SELECT 1 FROM notification_prefs p WHERE p.user_id=n.user_id AND p.kind=n.kind AND p.in_app=false))`;

export function createNotificationApi(pool, authenticate) {
  const unreadCount = async (uid) => (await pool.query(
    `SELECT count(*)::int AS n FROM notifications n WHERE n.user_id=$1 AND n.read_at IS NULL AND ${visible}`, [uid, lockedKinds()])).rows[0].n;

  const list = async (request, response, claims) => {
    const url = new URL(request.url, 'http://localhost');
    const filter = url.searchParams.get('filter') ?? 'all';
    const before = /^\d{1,15}$/.test(url.searchParams.get('before') ?? '') ? url.searchParams.get('before') : null;
    const category = /^[0-4]$/.test(filter) ? Number(filter) : null;
    const { rows } = await pool.query(
      `SELECT n.id::text,n.kind,n.category,n.title,n.body,n.target_url,n.created_at,n.read_at
       FROM notifications n WHERE n.user_id=$1 AND ${visible}
       AND ($3::bigint IS NULL OR n.id < $3) AND ($4::smallint IS NULL OR n.category=$4) AND ($5::boolean IS NOT TRUE OR n.read_at IS NULL)
       ORDER BY n.id DESC LIMIT ${PAGE + 1}`,
      [claims.uid, lockedKinds(), before, category, filter === 'unread']);
    const more = rows.length > PAGE;
    const items = rows.slice(0, PAGE);
    send(response, 200, { items, next: more ? items[items.length - 1].id : null, unread: await unreadCount(claims.uid) });
  };

  const main = async (request, response) => {
    const claims = await authenticate(request, response);
    if (!claims) return;
    if (request.method === 'GET') return list(request, response, claims);
    const { error, data } = await readJson(request, 1024);
    if (error || !data) return send(response, error ?? 400, { error: 'Enter a valid request.' });
    const id = /^\d{1,15}$/.test(String(data.id ?? '')) ? String(data.id) : null;
    if (data.action === 'read' || data.action === 'unread') {
      if (!id) return send(response, 400, { error: 'Unknown notification.' });
      const { rowCount } = await pool.query('UPDATE notifications SET read_at = CASE WHEN $3 THEN now() END WHERE id=$1 AND user_id=$2', [id, claims.uid, data.action === 'read']);
      if (!rowCount) return send(response, 404, { error: 'Unknown notification.' });
    } else if (data.action === 'read_all') {
      await pool.query('UPDATE notifications SET read_at=now() WHERE user_id=$1 AND read_at IS NULL', [claims.uid]);
    } else if (data.action === 'mute') {
      const category = Number(data.category);
      const kinds = Number.isInteger(category) ? switchableKinds(category) : [];
      if (!kinds.length) return send(response, 400, { error: 'This kind cannot be muted.' });
      await pool.query(
        `INSERT INTO notification_prefs(user_id,kind,in_app) SELECT $1,k,false FROM unnest($2::text[]) AS k
         ON CONFLICT (user_id,kind) DO UPDATE SET in_app=false, updated_at=now()`, [claims.uid, kinds]);
    } else {
      return send(response, 400, { error: 'Unknown action.' });
    }
    send(response, 200, { saved: true, unread: await unreadCount(claims.uid) });
  };

  const count = async (request, response) => {
    const claims = await authenticate(request, response);
    if (claims) send(response, 200, { unread: await unreadCount(claims.uid) });
  };

  /* Server-sent events: one open request per tab. Sends each new row as it is created. */
  const stream = async (request, response) => {
    const claims = await authenticate(request, response);
    if (!claims) return;
    response.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', Connection: 'keep-alive',
      'X-Content-Type-Options': 'nosniff', 'X-Accel-Buffering': 'no', 'Content-Security-Policy': "default-src 'none'",
    });
    response.write('retry: 5000\n\n');
    const push = (row) => response.write('event: notification\ndata: ' + JSON.stringify({ ...row, unread: undefined }) + '\n\n');
    bus.on(claims.uid, push);
    const beat = setInterval(() => response.write(': keep-alive\n\n'), 25_000);
    // Tokens last an hour; end the stream before then so the page reconnects with a fresh one.
    const limit = setTimeout(() => response.end(), 10 * 60_000);
    request.on('close', () => { bus.off(claims.uid, push); clearInterval(beat); clearTimeout(limit); });
  };
  return { main, count, stream };
}
