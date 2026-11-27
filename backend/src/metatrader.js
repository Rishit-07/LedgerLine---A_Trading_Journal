/* MetaTrader integration. Two ways in: a saved history report (any plan, limited per month on Free) and an installed read-only bridge
   (Pro). The bridge only sends closed trades, using a token that can be revoked here. Nothing here can place or change an order,
   and no broker password or investor password is ever asked for or stored. */
import { createHash, randomBytes } from 'node:crypto';
import { hasPlan, activePlan } from './entitlements.js';
import { FREE_MT_IMPORTS_PER_MONTH } from './billing-config.js';
import { parseReport, toTrade, MAX_ROWS } from './metatrader-parse.js';
import { readJson, send } from './http.js';

const fail = (status, error, reason) => { throw Object.assign(new Error(error), { status, reason }); };
const hash = (token) => createHash('sha256').update(token).digest('hex');
const MAX_LINKS = 3;

export function createMetaTraderApi(pool, { authenticate, now = () => new Date(), plans = { hasPlan, activePlan } }) {
  const one = async (sql, p) => (await pool.query(sql, p)).rows[0];
  const monthStart = () => { const d = now(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); };
  const used = async (uid, db = pool) => Number((await db.query('SELECT count(*)::int AS n FROM mt_imported WHERE user_id=$1 AND imported_at>=$2', [uid, monthStart()])).rows[0].n);

  /** Save trades in one transaction. `cap` is how many new trades this call may add (Infinity on a paid plan). */
  async function store(uid, trades, source, cap) {
    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,51))', [uid]);
      const room = cap === Infinity ? Infinity : Math.max(0, FREE_MT_IMPORTS_PER_MONTH - await used(uid, db));
      let imported = 0, duplicates = 0, limited = 0;
      for (const t of trades) {
        const claim = await db.query('INSERT INTO mt_imported(user_id,ref,source,imported_at) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING RETURNING ref', [uid, t.ref, source, now()]);
        if (!claim.rows.length) { duplicates++; continue; }
        if (imported >= room) { limited++; await db.query('DELETE FROM mt_imported WHERE user_id=$1 AND ref=$2', [uid, t.ref]); continue; }
        const { rows: [trade] } = await db.query(
          `INSERT INTO trades(user_id,opened_at,closed_at,market,symbol,side,qty,entry,exit,stop,target,fees,r_multiple,broker_ref)
           VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
          [uid, t.openedAt, t.closedAt, t.market, t.symbol, t.side, t.qty, t.entry, t.exit, t.stop, t.target, t.fees, t.result, t.ref]);
        await db.query('UPDATE mt_imported SET trade_id=$3 WHERE user_id=$1 AND ref=$2', [uid, t.ref, trade.id]);
        imported++;
      }
      await db.query('COMMIT');
      return { imported, duplicates, limited };
    } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; } finally { db.release(); }
  }

  async function status(uid) {
    const { plan } = await plans.activePlan(pool, uid, now());
    const links = (await pool.query('SELECT id,label,platform,created_at AS "createdAt",last_seen_at AS "lastSeenAt" FROM mt_links WHERE user_id=$1 AND revoked_at IS NULL ORDER BY created_at', [uid])).rows;
    return { plan, live: plan !== 'free', limit: plan === 'free' ? FREE_MT_IMPORTS_PER_MONTH : null, used: await used(uid), links };
  }

  async function importReport(uid, data) {
    const parsed = parseReport(data.text);
    if (parsed.error) fail(400, parsed.error);
    const paid = await plans.hasPlan(pool, uid, 'pro', now());
    const result = await store(uid, parsed.trades, 'report', paid ? Infinity : 0);
    return { ...result, skipped: parsed.skipped.slice(0, 50), skippedCount: parsed.skipped.length, found: parsed.found,
      ...(result.limited ? { reason: 'limit', feature: 'Unlimited MetaTrader import' } : {}), ...await status(uid) };
  }

  async function link(uid, data) {
    if (!await plans.hasPlan(pool, uid, 'pro', now())) fail(403, 'Live sync is part of Pro.', 'needs_plan');
    const label = String(data.label ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, 40);
    if (!label) fail(400, 'Give this terminal a name, like "My MT5".');
    const platform = data.platform === 'mt4' ? 'mt4' : 'mt5';
    if (Number((await one('SELECT count(*) AS n FROM mt_links WHERE user_id=$1 AND revoked_at IS NULL', [uid])).n) >= MAX_LINKS) fail(409, `You can have ${MAX_LINKS} connected terminals. Disconnect one first.`);
    const token = 'llmt_' + randomBytes(32).toString('base64url');
    await pool.query('INSERT INTO mt_links(user_id,label,platform,token_hash) VALUES($1,$2,$3,$4)', [uid, label, platform, hash(token)]);
    return { token, ...await status(uid) };      // the only time the token is ever shown
  }

  async function revoke(uid, data) {
    const r = await pool.query('UPDATE mt_links SET revoked_at=now() WHERE id::text=$1 AND user_id=$2 AND revoked_at IS NULL', [String(data.id), uid]);
    if (!r.rowCount) fail(404, 'That connection is already gone.');
    return status(uid);
  }

  const handler = async (request, response) => {
    const claims = await authenticate(request, response);
    if (!claims) return;
    try {
      if (request.method === 'GET') return send(response, 200, await status(claims.uid));
      const { error, data } = await readJson(request, 2_000_000);
      if (error || !data || typeof data !== 'object') return send(response, error ?? 400, { error: 'Check the details and try again.' });
      const action = { import: importReport, link, revoke }[data.action];
      if (!action) return send(response, 400, { error: 'Unknown action.' });
      return send(response, 200, await action(claims.uid, data));
    } catch (e) {
      if (e.status) return send(response, e.status, { error: e.message, ...(e.reason ? { reason: e.reason } : {}) });
      console.error('MetaTrader request failed.'); return send(response, 503, { error: 'MetaTrader is temporarily unavailable.' });
    }
  };

  /** Called by the installed bridge, not a browser: bearer token instead of a sign-in. Every failure here is generic so tokens cannot be probed. */
  const ingest = async (request, response) => {
    try {
      const token = /^Bearer (llmt_[A-Za-z0-9_-]{20,80})$/.exec(request.headers.authorization ?? '')?.[1];
      const row = token && await one('SELECT id,user_id FROM mt_links WHERE token_hash=$1 AND revoked_at IS NULL', [hash(token)]);
      if (!row) return send(response, 401, { error: 'This token is not valid. Create a new one in Settings.' });
      if (!await plans.hasPlan(pool, row.user_id, 'pro', now())) return send(response, 403, { error: 'Live sync needs an active Pro plan.', reason: 'needs_plan' });
      const { error, data } = await readJson(request, 400_000);
      if (error || !Array.isArray(data?.trades)) return send(response, error ?? 400, { error: 'Send {"trades":[...]}.' });
      if (data.trades.length > 200) return send(response, 413, { error: 'Send at most 200 trades per request.' });
      const account = String(data.account ?? '').replace(/\D/g, '').slice(0, 16);
      const at = (s) => {
        const n = Number(s);
        if (!Number.isFinite(n) || n < 946684800 || n > 4102444800) return null;
        const d = new Date(n * 1000);
        return Number.isNaN(d.getTime()) ? null : d;
      };
      const parsed = data.trades.map((t) => toTrade({ ticket: String(t.ticket ?? '').replace(/\D/g, '').slice(0, 32), account, symbol: t.symbol, type: String(t.type ?? ''),
        volume: Number(t.volume), openedAt: at(t.open_time), closedAt: at(t.close_time), entry: Number(t.open_price), exit: Number(t.close_price),
        stop: Number(t.sl), target: Number(t.tp), commission: Number(t.commission) }));
      const result = parsed.length ? await store(row.user_id, parsed.filter((p) => p.trade).map((p) => p.trade), 'live', Infinity) : { imported: 0, duplicates: 0, limited: 0 };
      await pool.query('UPDATE mt_links SET last_seen_at=now() WHERE id=$1', [row.id]);
      return send(response, 200, { ...result, skipped: parsed.filter((p) => p.skip).length });
    } catch { console.error('MetaTrader ingest failed.'); return send(response, 503, { error: 'Try again shortly.' }); }
  };
  return { handler, ingest, status, store, MAX_ROWS };
}
