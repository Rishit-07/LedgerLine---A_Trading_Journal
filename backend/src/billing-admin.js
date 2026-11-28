// Operator billing panel: search payments, see an order's history, record refunds and mark them sent.
// Only the reviewer account can use it. Crypto cannot be reversed by the app, so a refund is recorded as "owed"
// and stays that way until the operator has sent the coins from their own wallet and pasted the transaction reference.
import { eligibleReviewer } from './mentor-verification.js';
import { GRACE_DAYS } from './billing-config.js';
import { notify } from './notifications.js';
import { readJson, send } from './http.js';

export const REFUND_REASONS = ['duplicate_payment', 'wrong_amount', 'service_problem', 'goodwill', 'other'];
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
const fail = (status, error) => { throw Object.assign(new Error(error), { status }); };
const usd = (cents) => '$' + (cents / 100).toFixed(2);

export function createBillingAdminApi(pool, { authenticate, now = () => new Date() }) {
  async function tx(fn) {
    const db = await pool.connect();
    try { await db.query('BEGIN'); const out = await fn(db); await db.query('COMMIT'); return out; }
    catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; }
    finally { db.release(); }
  }
  const audit = (db, actor, action, target, detail) =>
    db.query('INSERT INTO admin_audit_log(actor_id,action,target,detail) VALUES($1,$2,$3,$4)', [actor, action, target, JSON.stringify(detail)]);
  const log = (db, id, state, note) =>
    db.query("INSERT INTO payment_events(checkout_id,source,state,note) VALUES($1,'reviewer',$2,$3)", [id, state, note]);

  async function overview(query) {
    const q = clean(query.get('q'), 80);
    const like = '%' + q.replace(/[\\%_]/g, '\\$&') + '%';
    const filter = ['all', 'paid', 'review', 'refunded'].includes(query.get('filter')) ? query.get('filter') : 'all';
    const [totals, payments, refunds] = await Promise.all([
      pool.query(`SELECT
          (SELECT count(*) FROM report_checkouts WHERE payment_state='paid' AND created_at > now() - interval '30 days')::int paid_30d,
          (SELECT coalesce(sum(price_usd_cents),0) FROM report_checkouts WHERE payment_state='paid' AND created_at > now() - interval '30 days')::int paid_30d_cents,
          (SELECT count(*) FROM report_checkouts WHERE needs_review)::int needs_review,
          (SELECT count(*) FROM billing_refunds WHERE status='owed')::int refunds_owed,
          (SELECT coalesce(sum(amount_usd_cents),0) FROM billing_refunds WHERE status='owed')::int refunds_owed_cents`),
      pool.query(`SELECT o.id, o.recipient AS email, o.user_id, o.plan, o.months, o.price_usd_cents, o.payment_state, o.needs_review, o.review_note,
          o.created_at, o.paid_until, coalesce((SELECT sum(amount_usd_cents) FROM billing_refunds r WHERE r.checkout_id=o.id AND r.status<>'cancelled'),0)::int refunded_cents
        FROM report_checkouts o
        WHERE ($1 = '' OR o.recipient ILIKE $2 ESCAPE '\\' OR o.id::text = $1 OR o.user_id = $1)
          AND ($3 = 'all' OR ($3 = 'paid' AND o.payment_state='paid') OR ($3 = 'review' AND o.needs_review)
               OR ($3 = 'refunded' AND EXISTS (SELECT 1 FROM billing_refunds r WHERE r.checkout_id=o.id AND r.status<>'cancelled')))
        ORDER BY o.created_at DESC LIMIT 50`, [q, like, filter]),
      pool.query(`SELECT r.id, r.checkout_id, r.amount_usd_cents, r.reason, r.note, r.ends_access, r.refund_to, r.status, r.tx_ref, r.created_at, r.sent_at, o.recipient AS email
        FROM billing_refunds r JOIN report_checkouts o ON o.id = r.checkout_id
        ORDER BY (r.status='owed') DESC, r.created_at DESC LIMIT 50`),
    ]);
    return { totals: totals.rows[0], payments: payments.rows, refunds: refunds.rows, reasons: REFUND_REASONS };
  }

  async function detail(id) {
    const { rows: [order] } = await pool.query(
      `SELECT id, recipient AS email, user_id, plan, months, price_usd_cents, payment_state, needs_review, review_note, created_at, paid_until, provider_ref
       FROM report_checkouts WHERE id::text=$1`, [id]);
    if (!order) fail(404, 'Order not found.');
    const [events, refunds] = await Promise.all([
      pool.query('SELECT at, source, state, note FROM payment_events WHERE checkout_id=$1 ORDER BY at, id', [order.id]),
      pool.query('SELECT id, amount_usd_cents, reason, note, ends_access, refund_to, status, tx_ref, created_at, sent_at FROM billing_refunds WHERE checkout_id=$1 ORDER BY created_at', [order.id]),
    ]);
    return { order, events: events.rows, refunds: refunds.rows };
  }

  /** Remove the access this order paid for, now, with no grace period. Only used for a full refund. */
  async function endAccess(db, order, at) {
    const hardStop = `$2::timestamptz - make_interval(days=>${GRACE_DAYS + 1})`;
    await db.query(
      `UPDATE report_subscriptions SET valid_until = CASE WHEN valid_until - make_interval(months=>$3) > $2 THEN valid_until - make_interval(months=>$3) ELSE ${hardStop} END WHERE user_id=$1`,
      [order.user_id, at, order.months]);
    if (order.plan === 'mentor') {
      await db.query(
        `UPDATE mentor_entitlements SET expires_at = CASE WHEN expires_at - make_interval(months=>$3) > $2 THEN expires_at - make_interval(months=>$3) ELSE ${hardStop} END,
           active = (expires_at IS NOT NULL AND expires_at - make_interval(months=>$3) > $2) WHERE user_id=$1 AND expires_at IS NOT NULL`,
        [order.user_id, at, order.months]);
    }
  }

  async function recordRefund(actor, data) {
    const cents = Math.round(Number(data.amountUsd) * 100);
    if (!Number.isInteger(cents) || cents <= 0) fail(400, 'Enter an amount in US dollars.');
    if (!REFUND_REASONS.includes(data.reason)) fail(400, 'Choose a reason.');
    const requestId = clean(data.requestId, 80);
    if (!requestId) fail(400, 'Missing request id.');
    const note = clean(data.note, 500) || null;
    const refundTo = clean(data.refundTo, 200) || null;
    const at = now();
    const result = await tx(async (db) => {
      const { rows: [order] } = await db.query('SELECT * FROM report_checkouts WHERE id::text=$1 FOR UPDATE', [clean(data.checkoutId, 60)]);
      if (!order) fail(404, 'Order not found.');
      const { rows: [again] } = await db.query('SELECT id FROM billing_refunds WHERE checkout_id=$1 AND request_id=$2', [order.id, requestId]);
      if (again) return { id: again.id, repeated: true };                       // the same form sent twice
      if (order.payment_state !== 'paid' || !order.price_usd_cents) fail(409, 'Only a paid order can be refunded.');
      const { rows: [sum] } = await db.query("SELECT coalesce(sum(amount_usd_cents),0)::int total, bool_or(ends_access) ended FROM billing_refunds WHERE checkout_id=$1 AND status<>'cancelled'", [order.id]);
      if (sum.total + cents > order.price_usd_cents) fail(409, `Only ${usd(order.price_usd_cents - sum.total)} is left to refund on this order.`);
      const endsAccess = data.endsAccess === true;
      if (endsAccess && (cents !== order.price_usd_cents || sum.ended)) fail(409, 'Access can only be ended with one full refund.');
      const { rows: [row] } = await db.query(
        `INSERT INTO billing_refunds(checkout_id,user_id,request_id,amount_usd_cents,reason,note,ends_access,refund_to,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
        [order.id, order.user_id, requestId, cents, data.reason, note, endsAccess, refundTo, actor]);
      if (endsAccess) await endAccess(db, order, at);
      await log(db, order.id, 'refund_owed', `${usd(cents)} (${data.reason})${endsAccess ? ', access ended' : ''}`);
      await audit(db, actor, 'billing_refund_recorded', order.id, { refund: row.id, cents, reason: data.reason, endsAccess });
      return { id: row.id, order, cents, endsAccess };
    });
    if (!result.repeated) {
      await notify(pool, result.order.user_id, 'billing', {
        title: 'A refund was recorded', body: `We recorded a refund of ${usd(result.cents)} for your ${result.order.plan === 'mentor' ? 'Mentor' : 'Pro'} payment. We will send it to the wallet address you gave us.`,
        target: '/billing', dedupe: 'refund:' + result.id,
      }).catch(() => {});
    }
    return { ok: true, id: result.id };
  }

  async function markSent(actor, data) {
    const txRef = clean(data.txRef, 200);
    if (txRef.length < 8) fail(400, 'Paste the transaction reference (hash) of the payment you sent.');
    const done = await tx(async (db) => {
      const { rows: [refund] } = await db.query('SELECT * FROM billing_refunds WHERE id::text=$1 FOR UPDATE', [clean(data.refundId, 60)]);
      if (!refund) fail(404, 'Refund not found.');
      if (refund.status === 'sent') return { refund, repeated: true };
      if (refund.status !== 'owed') fail(409, 'This refund was cancelled.');
      await db.query("UPDATE billing_refunds SET status='sent', tx_ref=$2, sent_at=now() WHERE id=$1", [refund.id, txRef]);
      await log(db, refund.checkout_id, 'refund_sent', `${usd(refund.amount_usd_cents)} sent, ref ${txRef.slice(0, 24)}`);
      await audit(db, actor, 'billing_refund_sent', refund.checkout_id, { refund: refund.id });
      return { refund };
    });
    if (!done.repeated) {
      await notify(pool, done.refund.user_id, 'billing', {
        title: 'Your refund was sent', body: `We sent ${usd(done.refund.amount_usd_cents)} to your wallet. Crypto can take a little while to arrive.`, target: '/billing', dedupe: 'refund-sent:' + done.refund.id,
      }).catch(() => {});
    }
    return { ok: true };
  }

  async function cancelRefund(actor, data) {
    await tx(async (db) => {
      const { rows: [refund] } = await db.query('SELECT * FROM billing_refunds WHERE id::text=$1 FOR UPDATE', [clean(data.refundId, 60)]);
      if (!refund) fail(404, 'Refund not found.');
      if (refund.status === 'cancelled') return;
      if (refund.status !== 'owed') fail(409, 'A refund that was sent cannot be cancelled.');
      if (refund.ends_access) fail(409, 'This refund already ended the access. Restore it by crediting the order again, then ask support to adjust.');
      await db.query("UPDATE billing_refunds SET status='cancelled' WHERE id=$1", [refund.id]);
      await log(db, refund.checkout_id, 'refund_cancelled', usd(refund.amount_usd_cents));
      await audit(db, actor, 'billing_refund_cancelled', refund.checkout_id, { refund: refund.id });
    });
    return { ok: true };
  }

  const handler = async (request, response) => {
    try {
      const claims = await authenticate(request, response);
      if (!claims) return;
      if (!eligibleReviewer(claims)) return send(response, 403, { error: 'Reviewers only.' });
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'GET') {
        const order = url.searchParams.get('order');
        return send(response, 200, order ? await detail(order) : await overview(url.searchParams));
      }
      const { error, data } = await readJson(request, 4096);
      if (error) return send(response, typeof error === 'number' ? error : 400, { error: 'Send JSON of 4 KB or less.' });
      const actions = { refund: recordRefund, refund_sent: markSent, refund_cancel: cancelRefund };
      if (!actions[data?.action]) return send(response, 400, { error: 'Unknown action.' });
      return send(response, 200, await actions[data.action](claims.uid, data));
    } catch (error) {
      if (error.status) return send(response, error.status, { error: error.message });
      console.error('Billing admin failed.');
      return send(response, 503, { error: 'The billing panel is temporarily unavailable.' });
    }
  };
  return { handler };
}
