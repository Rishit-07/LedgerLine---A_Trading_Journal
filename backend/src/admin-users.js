// Admin: every account, filterable by plan, with the controls an operator needs. Reviewer only.
// All changes run in one transaction with an append-only audit row, and each needs a written reason.
import { reviewer } from './mentor-verification.js';
import { readJson, send } from './http.js';
import { GRACE_DAYS } from './billing-config.js';

const PAGE_SIZE = 25;
const PLANS = ['free', 'pro', 'mentor'];
const clean = (value, max) => String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
const like = (value) => '%' + value.replace(/[\\%_]/g, '\\$&') + '%';
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const MAX_GRANT_DAYS = 366;

// The same rule as activePlan() in entitlements.js, written once as SQL so a list of accounts needs one query.
const PLAN_SQL = `
  WITH u AS (
    SELECT a.firebase_uid AS uid, a.created_at, p.display_name, p.onboarded_at,
      CASE
        WHEN EXISTS (SELECT 1 FROM mentor_entitlements m WHERE m.user_id = a.firebase_uid AND m.active AND (m.expires_at IS NULL OR m.expires_at > $1)) THEN 'mentor'
        WHEN EXISTS (SELECT 1 FROM report_subscriptions s WHERE s.user_id = a.firebase_uid AND s.valid_until > $1) THEN 'pro'
        ELSE 'free'
      END AS plan,
      (SELECT max(valid_until) FROM report_subscriptions s WHERE s.user_id = a.firebase_uid) AS pro_until
    FROM ledgerline_accounts a LEFT JOIN user_profile p ON p.user_id = a.firebase_uid
  )`;

export function createAdminUsersApi(pool, { authenticate, auth, now = () => new Date() }) {
  const cutoff = () => new Date(now().getTime() - GRACE_DAYS * 864e5);

  async function emailsFor(uids) {
    const out = new Map();
    if (!uids.length) return out;
    try {
      const { users } = await auth.getUsers(uids.map((uid) => ({ uid })));
      for (const user of users) out.set(user.uid, { email: user.email ?? null, disabled: user.disabled === true, lastSignIn: user.metadata?.lastSignInTime ?? null, verified: user.emailVerified === true });
    } catch { /* Firebase unreachable: the list still shows names and plans */ }
    return out;
  }

  async function list(url, response) {
    const plan = PLANS.includes(url.searchParams.get('plan')) ? url.searchParams.get('plan') : null;
    const q = clean(url.searchParams.get('q'), 100);
    const page = Math.max(1, Math.min(10_000, Number.parseInt(url.searchParams.get('page'), 10) || 1));
    let uidFromEmail = null;
    if (q.includes('@')) {
      try { uidFromEmail = (await auth.getUserByEmail(q)).uid; } catch { /* no such account */ }
    }
    const match = q ? [like(q), uidFromEmail ?? q] : [null, null];
    const { rows } = await pool.query(
      `${PLAN_SQL}
       SELECT uid, created_at, display_name, onboarded_at IS NOT NULL AS onboarded, plan, pro_until, count(*) OVER() AS total
       FROM u WHERE ($2::text IS NULL OR plan = $2) AND ($3::text IS NULL OR display_name ILIKE $3 OR uid = $4)
       ORDER BY created_at DESC LIMIT ${PAGE_SIZE} OFFSET ${(page - 1) * PAGE_SIZE}`,
      [cutoff(), plan, match[0], match[1]]);
    const { rows: counts } = await pool.query(`${PLAN_SQL} SELECT plan, count(*)::int AS n FROM u GROUP BY plan`, [cutoff()]);
    const byPlan = Object.fromEntries(PLANS.map((name) => [name, counts.find((row) => row.plan === name)?.n ?? 0]));
    const people = await emailsFor(rows.map((row) => row.uid));
    const total = rows[0] ? Number(rows[0].total) : 0;
    send(response, 200, {
      page, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)), total,
      counts: { all: byPlan.free + byPlan.pro + byPlan.mentor, ...byPlan },
      items: rows.map((row) => ({
        uid: row.uid, name: row.display_name, createdAt: row.created_at, onboarded: row.onboarded, plan: row.plan, proUntil: row.pro_until,
        email: people.get(row.uid)?.email ?? null, disabled: people.get(row.uid)?.disabled ?? false, lastSignIn: people.get(row.uid)?.lastSignIn ?? null,
      })),
    });
  }

  async function detail(uid, response) {
    const { rows: [row] } = await pool.query(`${PLAN_SQL} SELECT * FROM u WHERE uid = $2`, [cutoff(), uid]);
    if (!row) return send(response, 404, { error: 'No account with that id.' });
    const people = await emailsFor([uid]);
    const person = people.get(uid) ?? {};
    const [orders, stats, mentor, notes, mentorUntil] = await Promise.all([
      pool.query(`SELECT id::text, plan, method, months, price_usd_cents, payment_state, paid_until, created_at
                  FROM report_checkouts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 8`, [uid]),
      pool.query(`SELECT
          (SELECT count(*) FROM trades WHERE user_id = $1)::int AS trades,
          (SELECT count(*) FROM support_tickets WHERE user_id = $1)::int AS tickets,
          (SELECT count(*) FROM mt_links WHERE user_id = $1 AND revoked_at IS NULL)::int AS mt_links,
          (SELECT count(*) FROM ai_tool_runs WHERE user_id = $1 AND created_at >= date_trunc('month', now() AT TIME ZONE 'UTC'))::int AS ai_runs_month`, [uid]),
      pool.query('SELECT id::text, status, submitted_at FROM mentor_verifications WHERE user_id = $1', [uid]),
      pool.query('SELECT id::text, author_id, body, created_at FROM admin_user_notes WHERE user_id = $1 ORDER BY created_at DESC LIMIT 30', [uid]),
      pool.query('SELECT expires_at FROM mentor_entitlements WHERE user_id = $1 AND active', [uid]),
    ]);
    send(response, 200, {
      account: {
        uid, email: person.email ?? null, name: row.display_name, createdAt: row.created_at, onboarded: row.onboarded_at != null,
        lastSignIn: person.lastSignIn ?? null, disabled: person.disabled ?? false, verified: person.verified ?? null,
      },
      plan: { plan: row.plan, proUntil: row.pro_until, mentorUntil: mentorUntil.rows[0]?.expires_at ?? null },
      stats: stats.rows[0], orders: orders.rows, mentor: mentor.rows[0] ?? null, notes: notes.rows,
    });
  }

  async function act(admin, data, response) {
    const uid = clean(data.uid, 128);
    const reason = clean(data.reason, 300);
    const action = data.action;
    if (!uid || !['grant', 'end_plan', 'note', 'suspend', 'unsuspend'].includes(action)) return send(response, 400, { error: 'Choose a valid action.' });
    if (action === 'note') {
      const body = clean(data.body, 1000);
      if (!body) return send(response, 400, { error: 'Write the note first.' });
      const db = await pool.connect();
      try {
        await db.query('BEGIN');
        if (!(await db.query('SELECT 1 FROM ledgerline_accounts WHERE firebase_uid = $1', [uid])).rowCount) { await db.query('ROLLBACK'); return send(response, 404, { error: 'No account with that id.' }); }
        await db.query('INSERT INTO admin_user_notes(user_id,author_id,body) VALUES($1,$2,$3)', [uid, admin.uid, body]);
        await db.query("INSERT INTO admin_audit_log(actor_id,action,target,detail) VALUES($1,'user_note',$2,'{}')", [admin.uid, uid]);
        await db.query('COMMIT');
      } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; } finally { db.release(); }
      return send(response, 200, { saved: true });
    }
    if (reason.length < 5) return send(response, 400, { error: 'Write a reason of at least a few words. It goes in the audit log.' });
    if (uid === admin.uid && action !== 'grant') return send(response, 400, { error: 'You cannot do this to your own admin account.' });

    if (action === 'suspend' || action === 'unsuspend') {
      if (!(await pool.query('SELECT 1 FROM ledgerline_accounts WHERE firebase_uid = $1', [uid])).rowCount) return send(response, 404, { error: 'No account with that id.' });
      // Firebase is the source of truth for sign-in. A disabled account cannot sign in or refresh; revoking tokens ends open sessions
      // (changes are refused straight away, plain page reads stop when the current hour-long token expires).
      await auth.updateUser(uid, { disabled: action === 'suspend' });
      if (action === 'suspend') await auth.revokeRefreshTokens(uid);
      await pool.query('INSERT INTO admin_audit_log(actor_id,action,target,detail) VALUES($1,$2,$3,$4)', [admin.uid, 'user_' + action, uid, JSON.stringify({ reason })]);
      return send(response, 200, { saved: true });
    }

    const db = await pool.connect();
    try {
      await db.query('BEGIN');
      if (!(await db.query('SELECT 1 FROM ledgerline_accounts WHERE firebase_uid = $1 FOR UPDATE', [uid])).rowCount) { await db.query('ROLLBACK'); return send(response, 404, { error: 'No account with that id.' }); }
      if (action === 'grant') {
        const plan = data.plan;
        const days = Number(data.days);
        if (!['pro', 'mentor'].includes(plan) || !Number.isInteger(days) || days < 1 || days > MAX_GRANT_DAYS) { await db.query('ROLLBACK'); return send(response, 400, { error: `Choose Pro or Mentor and 1 to ${MAX_GRANT_DAYS} days.` }); }
        if (plan === 'pro') {
          await db.query(
            `INSERT INTO report_subscriptions(user_id, plan, valid_until) VALUES($1,'pro', $2::timestamptz + $3 * interval '1 day')
             ON CONFLICT (user_id) DO UPDATE SET valid_until = greatest(report_subscriptions.valid_until, $2::timestamptz) + $3 * interval '1 day'`,
            [uid, now(), days]);
        } else {
          await db.query(
            `INSERT INTO mentor_entitlements(user_id, active, expires_at) VALUES($1, true, $2::timestamptz + $3 * interval '1 day')
             ON CONFLICT (user_id) DO UPDATE SET active = true,
               expires_at = CASE WHEN mentor_entitlements.active AND mentor_entitlements.expires_at > $2 THEN mentor_entitlements.expires_at ELSE $2::timestamptz END + $3 * interval '1 day'`,
            [uid, now(), days]);
        }
        await db.query('INSERT INTO admin_audit_log(actor_id,action,target,detail) VALUES($1,$2,$3,$4)', [admin.uid, 'user_grant', uid, JSON.stringify({ plan, days, reason })]);
      } else {
        // A hard stop: the grace period is for late renewals, not for an operator ending access on purpose.
        const pro = await db.query('DELETE FROM report_subscriptions WHERE user_id = $1', [uid]);
        const mentor = await db.query('UPDATE mentor_entitlements SET active = false, expires_at = $2 WHERE user_id = $1 AND active', [uid, now()]);
        await db.query('INSERT INTO admin_audit_log(actor_id,action,target,detail) VALUES($1,$2,$3,$4)', [admin.uid, 'user_end_plan', uid, JSON.stringify({ reason, pro_removed: pro.rowCount > 0, mentor_ended: mentor.rowCount > 0 })]);
      }
      await db.query('COMMIT');
    } catch (error) { await db.query('ROLLBACK').catch(() => {}); throw error; } finally { db.release(); }
    send(response, 200, { saved: true });
  }

  async function handler(request, response) {
    const admin = await authenticate(request, response);
    if (!admin) return;
    try {
      if (!await reviewer(admin, auth)) return send(response, 403, { error: 'Admin access required.' });
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'GET') {
        const uid = clean(url.searchParams.get('uid'), 128);
        return uid ? await detail(uid, response) : await list(url, response);
      }
      const { error, data } = await readJson(request, 4096);
      if (error || !data || typeof data !== 'object') return send(response, typeof error === 'number' ? error : 400, { error: 'Enter a valid request.' });
      return await act(admin, data, response);
    } catch (error) {
      if (error?.status) return send(response, error.status, { error: error.message });
      console.error('Admin users request failed (' + (error?.code ?? 'unknown') + ').');
      send(response, 503, { error: 'The admin directory is unavailable right now.' });
    }
  }

  // The append-only log of everything done in the admin role. Newest first, filterable by the kind of action.
  async function audit(request, response) {
    const admin = await authenticate(request, response);
    if (!admin) return;
    try {
      if (!await reviewer(admin, auth)) return send(response, 403, { error: 'Admin access required.' });
      const url = new URL(request.url, 'http://localhost');
      const kind = clean(url.searchParams.get('kind'), 30);
      const q = clean(url.searchParams.get('q'), 80);
      const page = Math.max(1, Math.min(10_000, Number.parseInt(url.searchParams.get('page'), 10) || 1));
      const { rows } = await pool.query(
        `SELECT id::text, actor_id, action, target, detail, created_at, count(*) OVER() AS total FROM admin_audit_log
         WHERE ($1::text IS NULL OR action LIKE $1) AND ($2::text IS NULL OR target ILIKE $2)
         ORDER BY id DESC LIMIT 50 OFFSET ${(page - 1) * 50}`,
        [kind ? like(kind).replace(/^%/, '') : null, q ? like(q) : null]);
      const total = rows[0] ? Number(rows[0].total) : 0;
      send(response, 200, { page, pages: Math.max(1, Math.ceil(total / 50)), total, items: rows.map(({ total: _t, ...item }) => item) });
    } catch (error) {
      console.error('Admin audit request failed (' + (error?.code ?? 'unknown') + ').');
      send(response, 503, { error: 'The audit log is unavailable right now.' });
    }
  }

  return { handler, audit };
}
