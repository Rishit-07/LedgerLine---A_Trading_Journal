/* Mentorship: one account, one page, three states (none, student, mentor).
   Everything that matters is enforced here on the server: verification, plans, one mentor at a time,
   claim-bound links, consent levels and the audit of every mentor view. */
import { createHash, randomBytes } from 'node:crypto';
import { hasPlan, activePlan } from './entitlements.js';
import { notify } from './notifications.js';
import { cachedStats } from './mentorship-stats.js';
import { readJson, send } from './http.js';

export const CONSENT_VERSION = '2026-11';
const LINK_DAYS = [7, 14, 30];
const SEATS = [5, 10, 25];
const STUDENT_REPORTS = ['Not teaching well', 'Not showing up', 'Asked for trades or signals', 'Asked for money outside Ledgerline', 'Pressure or rude behaviour', 'Something else'];
const MENTOR_REPORTS = ['A student breaks the rules', 'Billing or plan problem', 'Appeal a decision', 'Something else'];
const URGENT = new Set(['Asked for trades or signals', 'Asked for money outside Ledgerline', 'Pressure or rude behaviour']);

const sha = (value) => createHash('sha256').update(value).digest('hex');
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').trim().slice(0, max);
const fail = (status, error, reason) => { throw Object.assign(new Error(error), { status, reason }); };
const addDays = (d, n) => new Date(d.getTime() + n * 864e5);
const addMonths = (d, n) => { const x = new Date(d); x.setUTCMonth(x.getUTCMonth() + n); return x; };

export function createMentorshipApi(pool, { authenticate, now = () => new Date(), env = process.env, cancelMentorPlan = async () => {}, planTerm = async () => 'monthly', plans = { hasPlan, activePlan } }) {
  const ipHash = (request) => sha((env.NEWSLETTER_SECRET ?? env.FIELD_ENCRYPTION_KEY ?? '') + '|' + (request.socket?.remoteAddress ?? '')).slice(0, 32);

  async function tx(fn) {
    if (!pool.connect) return fn(pool);
    const db = await pool.connect();
    try { await db.query('BEGIN'); const out = await fn(db); await db.query('COMMIT'); return out; }
    catch (e) { await db.query('ROLLBACK').catch(() => {}); throw e; }
    finally { db.release(); }
  }
  const one = async (db, sql, params) => (await db.query(sql, params)).rows[0];

  async function role(uid) {
    return (await one(pool, 'SELECT * FROM mentorship_profiles WHERE user_id=$1', [uid])) ?? { user_id: uid, role: 'none', role_change_unlocks_at: null };
  }
  const verified = async (uid) => (await one(pool, 'SELECT status, display_name FROM mentor_verifications WHERE user_id=$1', [uid])) ?? { status: 'none' };
  const mySpace = (uid) => one(pool, "SELECT * FROM spaces WHERE owner_id=$1 AND status IN ('active','frozen','closing')", [uid]);

  /* ---------- state ---------- */
  async function state(uid) {
    const [me, ver, plan, space, membership] = await Promise.all([
      role(uid), verified(uid), plans.activePlan(pool, uid, now()), mySpace(uid),
      one(pool, `SELECT m.id, m.status, m.level2, m.level3, m.reconfirm_at, s.name space_name, s.id space_id, v.display_name mentor_name
        FROM space_memberships m JOIN spaces s ON s.id=m.space_id LEFT JOIN mentor_verifications v ON v.user_id=s.owner_id
        WHERE m.student_id=$1 AND m.status IN ('active','paused','waitlist')`, [uid]),
    ]);
    const hasMentorPlan = plan.plan === 'mentor';
    const out = { role: me.role, plan: plan.plan, verification: ver.status, role_change: { state: 'free' } };
    if (me.role === 'mentor') {
      out.checklist = { verified: ver.status === 'approved', plan: hasMentorPlan, space: Boolean(space) };
      if (space) {
        out.space = { id: space.id, name: space.name, status: space.status, focus: space.focus, links_paused: space.links_paused, cap: space.member_cap, closing_until: space.closing_until };
        const unlock = me.role_change_unlocks_at ? new Date(me.role_change_unlocks_at) : null;
        out.role_change = unlock && unlock > now() ? { state: 'cooldown', days: Math.ceil((unlock - now()) / 864e5), unlocks_at: unlock } : { state: 'close' };
      } else if (hasMentorPlan) out.role_change = { state: 'cancel_plan' };
    }
    if (me.role === 'student') {
      out.membership = membership ?? null;
      out.needs_pro = plan.plan === 'free';
    }
    return out;
  }

  /* ---------- roles ---------- */
  async function chooseRole(uid, want) {
    if (!['student', 'mentor'].includes(want)) fail(400, 'Choose student or mentor.');
    const me = await role(uid);
    if (me.role !== 'none') fail(409, 'Change your role first.', 'has_role');
    await pool.query(`INSERT INTO mentorship_profiles(user_id,role) VALUES($1,$2) ON CONFLICT (user_id) DO UPDATE SET role=$2, updated_at=now()`, [uid, want]);
  }

  async function changeRole(uid, confirm) {
    const me = await role(uid);
    if (me.role === 'none') return;
    if (me.role === 'student') {
      if (await one(pool, "SELECT 1 FROM space_memberships WHERE student_id=$1 AND status IN ('active','paused','waitlist')", [uid])) fail(409, 'Leave your mentor first.', 'needs_leave');
    } else {
      const space = await mySpace(uid);
      if (!space) {
        if ((await plans.activePlan(pool, uid, now())).plan === 'mentor') fail(409, 'Cancel your mentor plan first.', 'plan_active');
      } else {
        const unlock = me.role_change_unlocks_at ? new Date(me.role_change_unlocks_at) : null;
        if (unlock && unlock > now()) fail(403, `Change role in ${Math.ceil((unlock - now()) / 864e5)} days.`, 'cooldown');
        if (confirm !== true) fail(409, 'Close your space and change role?', 'confirm_close');
        await closeSpace(space);
      }
    }
    await pool.query("UPDATE mentorship_profiles SET role='none', role_change_unlocks_at=NULL, updated_at=now() WHERE user_id=$1", [uid]);
  }

  async function closeSpace(space) {
    await pool.query("UPDATE spaces SET status='closing', closing_until=$2 WHERE id=$1", [space.id, addDays(now(), 30)]);
    await pool.query('UPDATE space_links SET revoked_at=now() WHERE space_id=$1 AND revoked_at IS NULL', [space.id]);
    await pool.query("UPDATE space_memberships SET status='removed', ended_at=now(), end_reason='waitlist_closed' WHERE space_id=$1 AND status='waitlist'", [space.id]);
    await cancelMentorPlan(space.owner_id);
    const { rows } = await pool.query("SELECT student_id FROM space_memberships WHERE space_id=$1 AND status IN ('active','paused')", [space.id]);
    for (const r of rows) await notify(pool, r.student_id, 'spaces', { title: 'Your mentor is closing their space', body: 'You keep read-only access for 30 days and your journal stays yours.', target: '/mentorship', dedupe: `close:${space.id}` });
  }

  async function cancelPlan(uid) {
    const me = await role(uid);
    if (me.role !== 'mentor' || await mySpace(uid)) fail(409, 'Nothing to cancel.');
    await cancelMentorPlan(uid);
    await pool.query('UPDATE mentorship_profiles SET plan_cancel_requested_at=now() WHERE user_id=$1', [uid]);
  }

  /* ---------- space ---------- */
  async function createSpace(uid, data) {
    const me = await role(uid);
    if (me.role !== 'mentor') fail(403, 'Choose Become a mentor first.', 'not_mentor');
    if ((await verified(uid)).status !== 'approved') fail(403, 'Get verified first.', 'not_verified');
    if (!await plans.hasPlan(pool, uid, 'mentor', now())) fail(403, 'Activate your mentor plan first.', 'needs_plan');
    const name = clean(data.name, 60), about = clean(data.about, 400);
    const limit = Number(data.member_limit ?? 30);
    if (!name || !about || !Number.isInteger(limit) || limit < 1 || limit > 50) fail(400, 'Enter a name, an about line and a member limit up to 50.');
    const term = (await planTerm(uid)) === 'yearly' ? 'yearly' : 'monthly';
    return tx(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,31))', [uid]);
      if (await one(db, "SELECT 1 FROM spaces WHERE owner_id=$1 AND status IN ('active','frozen','closing')", [uid])) fail(409, 'You already lead a space.');
      const space = await one(db, `INSERT INTO spaces(owner_id,name,description,focus,member_cap,space_rules,welcome_message,plan_term,join_mode,topic)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8,'invite',$9) RETURNING id`, [uid, name, about, clean(data.focus, 100), limit, clean(data.rules, 1200) || 'Keep discussions about process. No trade calls, no signals.', clean(data.welcome, 400), term, clean(data.focus, 100) || 'General']);
      await db.query('INSERT INTO space_members(user_id,space_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [uid, space.id]);
      const unlock = term === 'yearly' ? addMonths(now(), 2) : addDays(now(), 15);
      await db.query('UPDATE mentorship_profiles SET role_change_unlocks_at=$2, updated_at=now() WHERE user_id=$1', [uid, unlock]);
      return { id: space.id };
    });
  }

  async function ownerSpace(uid, { writable = true } = {}) {
    const space = await mySpace(uid);
    if (!space) fail(403, 'Create your space first.', 'no_space');
    if (writable && space.status !== 'active') fail(403, 'Your space is read-only.', 'read_only');
    if (writable && !await plans.hasPlan(pool, uid, 'mentor', now())) fail(403, 'Your mentor plan is not active.', 'needs_plan');
    return space;
  }

  /* ---------- links ---------- */
  const newToken = () => randomBytes(32).toString('base64url');
  const linkView = (l, token) => ({ id: l.id, kind: l.kind, label: l.label, expires_at: l.expires_at, seat_limit: l.seat_limit, uses: l.uses, claimed: Boolean(l.claimed_by), claimed_at: l.claimed_at, revoked: Boolean(l.revoked_at), email_locked: Boolean(l.email_hash), ...(token ? { token, path: '/mentor/join?token=' + token } : {}) });

  async function createLink(uid, data) {
    const space = await ownerSpace(uid);
    const token = newToken();
    if (data.kind === 'open') {
      const days = Number(data.expires_days), seats = Number(data.seat_limit);
      if (!LINK_DAYS.includes(days) || !SEATS.includes(seats)) fail(400, 'Choose 7, 14 or 30 days and 5, 10 or 25 seats.');
      await pool.query("UPDATE space_links SET revoked_at=now() WHERE space_id=$1 AND kind='open' AND revoked_at IS NULL", [space.id]);
      const l = await one(pool, "INSERT INTO space_links(space_id,kind,token_hash,label,expires_at,seat_limit) VALUES($1,'open',$2,$3,$4,$5) RETURNING *", [space.id, sha(token), clean(data.label, 60) || 'Open seats', addDays(now(), days), seats]);
      return linkView(l, token);
    }
    const label = clean(data.label, 80), email = clean(data.email, 254).toLowerCase();
    if (!label && !email) fail(400, 'Add a name or an email for this link.');
    const l = await one(pool, "INSERT INTO space_links(space_id,kind,token_hash,label,email_hash,expires_at) VALUES($1,'personal',$2,$3,$4,$5) RETURNING *",
      [space.id, sha(token), label || email, email ? sha(email) : null, addDays(now(), 7)]);
    return linkView(l, token);
  }
  async function resendLink(uid, id) {
    const space = await ownerSpace(uid);
    const old = await one(pool, "SELECT * FROM space_links WHERE id::text=$1 AND space_id=$2 AND kind='personal'", [String(id), space.id]);
    if (!old || old.claimed_by) fail(404, 'This link cannot be resent.');
    await pool.query('UPDATE space_links SET revoked_at=now() WHERE id=$1', [old.id]);
    const token = newToken();
    const l = await one(pool, "INSERT INTO space_links(space_id,kind,token_hash,label,email_hash,expires_at) VALUES($1,'personal',$2,$3,$4,$5) RETURNING *", [space.id, sha(token), old.label, old.email_hash, addDays(now(), 7)]);
    return linkView(l, token);
  }
  async function revokeLink(uid, id) {
    const space = await ownerSpace(uid, { writable: false });
    await pool.query('UPDATE space_links SET revoked_at=now() WHERE id::text=$1 AND space_id=$2 AND revoked_at IS NULL', [String(id), space.id]);
  }
  async function pauseLinks(uid, paused) {
    const space = await ownerSpace(uid, { writable: false });
    await pool.query('UPDATE spaces SET links_paused=$2 WHERE id=$1', [space.id, paused === true]);
  }

  /* ---------- joining ---------- */
  async function resolveLink(db, token, { lock = false } = {}) {
    if (typeof token !== 'string' || token.length < 30 || token.length > 100) fail(404, 'This link is not valid.', 'invalid');
    const l = await one(db, `SELECT l.*, s.owner_id, s.name space_name, s.status space_status, s.links_paused, s.member_cap, s.focus, s.space_rules, s.welcome_message, s.description
      FROM space_links l JOIN spaces s ON s.id=l.space_id WHERE l.token_hash=$1${lock ? ' FOR UPDATE OF l' : ''}`, [sha(token)]);
    if (!l) fail(404, 'This link is not valid.', 'invalid');
    return l;
  }
  function checkLink(l, uid, claims) {
    if (l.revoked_at) fail(410, 'This link is no longer active.', 'revoked');
    if (new Date(l.expires_at) <= now()) fail(410, 'This link has expired.', 'expired');
    if (l.links_paused) fail(423, 'This mentor has paused joining for now.', 'paused');
    if (l.space_status !== 'active') fail(423, 'This space is not taking new members.', 'closed');
    if (l.kind === 'personal' && l.claimed_by && l.claimed_by !== uid) fail(410, 'This link has already been used.', 'used');
    if (l.kind === 'open' && l.uses >= l.seat_limit && l.claimed_by !== uid) fail(410, 'All seats on this link are taken.', 'full');
    if (l.email_hash && sha(String(claims.email ?? '').toLowerCase()) !== l.email_hash) fail(403, 'This link was made for a different email address.', 'email_lock');
  }

  async function preview(uid, claims, token) {
    const l = await resolveLink(pool, token);
    checkLink(l, uid, claims);
    const mentor = await verified(l.owner_id);
    const { rows: [c] } = await pool.query("SELECT count(*)::int n FROM space_memberships WHERE space_id=$1 AND status IN ('active','paused')", [l.space_id]);
    const current = await one(pool, "SELECT s.name FROM space_memberships m JOIN spaces s ON s.id=m.space_id WHERE m.student_id=$1 AND m.status IN ('active','paused','waitlist') AND m.space_id<>$2", [uid, l.space_id]);
    return {
      space: { name: l.space_name, mentor: mentor.display_name ?? 'Mentor', focus: l.focus, size: c.n, cap: l.member_cap, rules: l.space_rules, welcome: l.welcome_message },
      shares: {
        level1: 'Process only: rules kept, journal days, streak, checklist use and mistake tags with counts. No prices, results or account size. Required to be coached.',
        level2: 'Results in R: win rate, average risk to reward and cumulative R. Never account size or currency.',
        level3: 'Notes and trades: symbols, setups and your written reasons.',
      },
      replaces: current?.name ?? null,
      consent_version: CONSENT_VERSION,
    };
  }

  async function join(uid, claims, request, data) {
    if (claims.email_verified !== true) fail(403, 'Verify your email address first.', 'email_unverified');
    if (data.accept_rules !== true || data.adult !== true) fail(400, 'Accept the rules and confirm you are 18 or older.', 'consent_required');
    if (!await plans.hasPlan(pool, uid, 'pro', now())) fail(402, 'Joining a mentor needs Pro.', 'needs_pro');
    const me = await role(uid);
    if (me.role === 'mentor') fail(409, 'Mentors cannot join as students. Change role first.', 'is_mentor');
    const level2 = data.level2 === true, level3 = data.level3 === true;
    return tx(async (db) => {
      await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,32))', [uid]);
      const l = await resolveLink(db, data.token, { lock: true });
      if (l.owner_id === uid) fail(409, 'This is your own space.');
      const mine = await one(db, "SELECT m.* FROM space_memberships m WHERE m.student_id=$1 AND m.status IN ('active','paused','waitlist')", [uid]);
      if (mine?.space_id === l.space_id && l.claimed_by === uid) return { status: mine.status, space: l.space_name };
      checkLink(l, uid, claims);
      if (mine) {
        const cur = await one(db, 'SELECT name FROM spaces WHERE id=$1', [mine.space_id]);
        if (data.replace !== true) fail(409, `Joining ${l.space_name} will remove you from ${cur.name}.`, 'has_mentor');
        await db.query("UPDATE space_memberships SET status='left', ended_at=now(), end_reason='switched' WHERE id=$1", [mine.id]);
        await db.query('DELETE FROM space_members WHERE user_id=$1 AND space_id=$2', [uid, mine.space_id]);
        await db.query('DELETE FROM student_rollups WHERE student_id=$1', [uid]);
      }
      const { rows: [c] } = await db.query("SELECT count(*)::int n FROM space_memberships WHERE space_id=$1 AND status IN ('active','paused')", [l.space_id]);
      const finalStatus = c.n >= l.member_cap ? 'waitlist' : 'active';
      const m = await one(db, `INSERT INTO space_memberships(space_id,student_id,status,via_link_id,level2,level3,reconfirm_at,consent_version)
        VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`, [l.space_id, uid, finalStatus, l.id, level2, level3, level2 || level3 ? addDays(now(), 90) : null, CONSENT_VERSION]);
      for (const level of [1, ...(level2 ? [2] : []), ...(level3 ? [3] : [])]) {
        await db.query("INSERT INTO mentor_consents(membership_id,student_id,space_id,action,level,version,ip_hash) VALUES($1,$2,$3,'grant',$4,$5,$6)", [m.id, uid, l.space_id, level, CONSENT_VERSION, ipHash(request)]);
      }
      if (l.kind === 'personal') await db.query('UPDATE space_links SET claimed_by=$2, claimed_at=now(), uses=1 WHERE id=$1', [l.id, uid]);
      else {
        await db.query('UPDATE space_links SET uses=uses+1, claimed_at=now() WHERE id=$1', [l.id]);
        const { rows: [today] } = await db.query("SELECT count(*)::int n FROM space_memberships WHERE via_link_id=$1 AND joined_at>$2", [l.id, addDays(now(), -1)]);
        if (today.n === 6) await notify(db, l.owner_id, 'spaces', { title: 'Your open link is being used a lot', body: 'More than 5 people joined with it today. Pause links if this is not expected.', target: '/mentorship', dedupe: `link-burst:${l.id}:${now().toISOString().slice(0, 10)}` });
      }
      if (finalStatus === 'active') await db.query('INSERT INTO space_members(user_id,space_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [uid, l.space_id]);
      await notify(db, l.owner_id, 'spaces', { title: finalStatus === 'active' ? 'A new student joined your space' : 'A student is on your waitlist', body: '', target: '/mentorship', dedupe: `joined:${m.id}` });
      return { status: finalStatus, space: l.space_name };
    });
  }

  async function leave(uid) {
    const m = await one(pool, "UPDATE space_memberships SET status='left', ended_at=now(), end_reason='left' WHERE student_id=$1 AND status IN ('active','paused','waitlist') RETURNING space_id", [uid]);
    if (!m) fail(404, 'You are not in a space.');
    await pool.query('DELETE FROM space_members WHERE user_id=$1 AND space_id=$2', [uid, m.space_id]);
    await pool.query('DELETE FROM student_rollups WHERE student_id=$1', [uid]);
  }

  async function setShare(uid, request, data) {
    const m = await one(pool, "SELECT * FROM space_memberships WHERE student_id=$1 AND status IN ('active','paused')", [uid]);
    if (!m) fail(404, 'You are not in a space.');
    const level = Number(data.level), on = data.enabled === true;
    if (![1, 2, 3].includes(level) || typeof data.enabled !== 'boolean') fail(400, 'Choose a level.');
    const patch = level === 1 ? { level1: on, status: on ? 'active' : 'paused' } : { [`level${level}`]: on };
    if (level === 1 && !on) { patch.level2 = false; patch.level3 = false; }
    const next = { level2: m.level2, level3: m.level3, ...patch };
    await pool.query('UPDATE space_memberships SET level1=$2, level2=$3, level3=$4, status=$5, reconfirm_at=$6 WHERE id=$1',
      [m.id, patch.level1 ?? m.level1, next.level2, next.level3, patch.status ?? m.status, next.level2 || next.level3 ? (on && level > 1 ? addDays(now(), 90) : m.reconfirm_at) : null]);
    await pool.query('INSERT INTO mentor_consents(membership_id,student_id,space_id,action,level,version,ip_hash) VALUES($1,$2,$3,$4,$5,$6,$7)', [m.id, uid, m.space_id, on ? 'grant' : 'withdraw', level, CONSENT_VERSION, ipHash(request)]);
    if (!on) await pool.query('DELETE FROM student_rollups WHERE student_id=$1', [uid]);
  }

  /* ---------- mentor dashboard ---------- */
  async function dashboard(uid, studentId) {
    const space = await ownerSpace(uid, { writable: false });
    if (space.status !== 'active' || !await plans.hasPlan(pool, uid, 'mentor', now())) return { frozen: true, space: { id: space.id, name: space.name, status: space.status }, students: [] };
    const { rows: members } = await pool.query(`SELECT m.id, m.student_id, m.status, m.level1, m.level2, m.level3, m.joined_at, m.remove_after, m.via_link_id, l.label link_label,
        coalesce(p.display_name, 'Student') AS name
      FROM space_memberships m LEFT JOIN space_links l ON l.id=m.via_link_id LEFT JOIN user_profile p ON p.user_id=m.student_id
      WHERE m.space_id=$1 AND m.status IN ('active','paused','waitlist') ORDER BY m.joined_at`, [space.id]);
    const students = [];
    for (const m of members) {
      const row = { id: m.id, name: m.name, status: m.status, joined_at: m.joined_at, link: m.link_label, remove_after: m.remove_after };
      if (m.status === 'waitlist') { students.push(row); continue; }
      if (!m.level1 || m.status === 'paused') { students.push({ ...row, stats: 'not_sharing' }); continue; }
      if (!await plans.hasPlan(pool, m.student_id, 'pro', now())) { students.push({ ...row, stats: 'pro_ended' }); continue; }
      if (studentId && studentId !== m.id) { students.push(row); continue; }
      const stats = await cachedStats(pool, m.student_id, m);
      const seen = await one(pool, "SELECT 1 FROM mentor_view_audit WHERE space_id=$1 AND mentor_id=$2 AND student_id=$3 AND what=$4 AND at>$5", [space.id, uid, m.student_id, studentId ? 'profile' : 'list', addDays(now(), -1 / 24)]);
      if (!seen) await pool.query('INSERT INTO mentor_view_audit(space_id,mentor_id,student_id,what) VALUES($1,$2,$3,$4)', [space.id, uid, m.student_id, studentId ? 'profile' : 'list']);
      students.push({ ...row, stats });
    }
    const active = students.filter((s) => s.status === 'active');
    const weekAgo = addDays(now(), -7);
    const links = (await pool.query('SELECT * FROM space_links WHERE space_id=$1 ORDER BY created_at DESC LIMIT 50', [space.id])).rows.map((l) => linkView(l));
    return {
      space: { id: space.id, name: space.name, status: space.status, links_paused: space.links_paused, cap: space.member_cap },
      totals: { students: active.length, new_this_week: members.filter((m) => m.status === 'active' && new Date(m.joined_at) > weekAgo).length, waitlist: students.filter((s) => s.status === 'waitlist').length, quiet: active.filter((s) => s.stats && typeof s.stats === 'object' && s.stats.journal_days_30 < 3).length },
      students, links,
    };
  }

  async function myAudit(uid) {
    const { rows } = await pool.query(`SELECT a.what, a.at, coalesce(v.display_name,'Your mentor') mentor FROM mentor_view_audit a LEFT JOIN mentor_verifications v ON v.user_id=a.mentor_id WHERE a.student_id=$1 ORDER BY a.at DESC LIMIT 50`, [uid]);
    const { rows: consents } = await pool.query('SELECT action, level, version, at FROM mentor_consents WHERE student_id=$1 ORDER BY at DESC LIMIT 50', [uid]);
    return { views: rows, consents };
  }

  async function manage(uid, data) {
    const space = await ownerSpace(uid);
    const m = await one(pool, 'SELECT * FROM space_memberships WHERE id::text=$1 AND space_id=$2', [String(data.membership_id), space.id]);
    if (!m) fail(404, 'Student not found.');
    if (data.action === 'let_in') {
      if (m.status !== 'waitlist') fail(409, 'Not on the waitlist.');
      const { rows: [c] } = await pool.query("SELECT count(*)::int n FROM space_memberships WHERE space_id=$1 AND status IN ('active','paused')", [space.id]);
      if (c.n >= space.member_cap) fail(409, 'Your space is full.');
      await pool.query("UPDATE space_memberships SET status='active' WHERE id=$1", [m.id]);
      await pool.query('INSERT INTO space_members(user_id,space_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [m.student_id, space.id]);
      return;
    }
    const reason = clean(data.reason, 200);
    if (!reason) fail(400, 'Choose a reason for removing this student.');
    await pool.query('UPDATE space_memberships SET remove_after=$2, remove_reason=$3 WHERE id=$1', [m.id, addDays(now(), 7), reason]);
    await pool.query("INSERT INTO mentor_audit_log(space_id,actor_id,action,target_id,detail) VALUES($1,$2,'remove_student',$3,$4)", [space.id, uid, m.student_id, reason]);
    await notify(pool, m.student_id, 'spaces', { title: 'You will be removed from a mentor space in 7 days', body: `Reason given: ${reason}. You can appeal from your mentorship page. Your journal is not touched.`, target: '/mentorship', dedupe: `remove:${m.id}` });
  }

  async function report(uid, data) {
    const mem = await one(pool, "SELECT space_id FROM space_memberships WHERE student_id=$1 AND status IN ('active','paused')", [uid]);
    const own = await mySpace(uid);
    const side = mem ? 'student' : own ? 'mentor' : null;
    if (!side) fail(403, 'Join or lead a space first.');
    if (!(side === 'student' ? STUDENT_REPORTS : MENTOR_REPORTS).includes(data.category)) fail(400, 'Choose what happened.');
    const spaceId = mem?.space_id ?? own.id;
    try {
      await pool.query('INSERT INTO space_reports(space_id,reporter_id,side,category,details,severity) VALUES($1,$2,$3,$4,$5,$6)', [spaceId, uid, side, data.category, clean(data.details, 600), URGENT.has(data.category) ? 'urgent' : 'normal']);
    } catch (e) { if (String(e.code) === '23505' || /duplicate|unique/i.test(e.message)) fail(409, 'You already reported this recently.'); throw e; }
    const { rows: [n] } = await pool.query("SELECT count(DISTINCT reporter_id)::int n FROM space_reports WHERE space_id=$1 AND side='student' AND created_at>$2", [spaceId, addDays(now(), -30)]);
    if (n.n >= 3) await pool.query("UPDATE space_reports SET escalated=true WHERE space_id=$1 AND status='open'", [spaceId]);
  }

  /* ---------- scheduled maintenance ---------- */
  async function sweep() {
    const t = now();
    await pool.query("UPDATE space_memberships SET status='removed', ended_at=now(), end_reason='removed_by_mentor' WHERE remove_after IS NOT NULL AND remove_after<=$1 AND status IN ('active','paused')", [t]);
    await pool.query("DELETE FROM space_members sm USING spaces s WHERE sm.space_id=s.id AND sm.user_id<>s.owner_id AND NOT EXISTS (SELECT 1 FROM space_memberships m WHERE m.space_id=sm.space_id AND m.student_id=sm.user_id AND m.status IN ('active','paused'))");
    const { rows: expired } = await pool.query("SELECT id, student_id, space_id, level2, level3 FROM space_memberships WHERE reconfirm_at IS NOT NULL AND reconfirm_at<=$1 AND status IN ('active','paused')", [t]);
    for (const m of expired) {
      await pool.query('UPDATE space_memberships SET level2=false, level3=false, reconfirm_at=NULL WHERE id=$1', [m.id]);
      for (const level of [m.level2 && 2, m.level3 && 3].filter(Boolean)) await pool.query("INSERT INTO mentor_consents(membership_id,student_id,space_id,action,level,version) VALUES($1,$2,$3,'expire',$4,$5)", [m.id, m.student_id, m.space_id, level, CONSENT_VERSION]);
      await pool.query('DELETE FROM student_rollups WHERE student_id=$1', [m.student_id]);
      await notify(pool, m.student_id, 'spaces', { title: 'Confirm what you share with your mentor', body: 'Sharing above the process level has ended after 90 days. Choose again if you want to keep sharing.', target: '/mentorship', dedupe: `reconfirm:${m.id}:${t.toISOString().slice(0, 10)}` });
    }
    const { rows: closing } = await pool.query("SELECT id FROM spaces WHERE status='closing' AND closing_until<=$1", [t]);
    for (const s of closing) {
      await pool.query("UPDATE space_memberships SET status='left', ended_at=now(), end_reason='space_closed' WHERE space_id=$1 AND status IN ('active','paused')", [s.id]);
      await pool.query('UPDATE spaces SET status=$2 WHERE id=$1', [s.id, 'closed']);
    }
    // Mentor plan lapse freezes the space read-only; renewing restores it. Nothing is deleted.
    const { rows: live } = await pool.query("SELECT id, owner_id, status FROM spaces WHERE status IN ('active','frozen')");
    for (const s of live) {
      const ok = await plans.hasPlan(pool, s.owner_id, 'mentor', t);
      if (!ok && s.status === 'active') {
        await pool.query("UPDATE spaces SET status='frozen', frozen_at=now() WHERE id=$1", [s.id]);
        const { rows } = await pool.query("SELECT student_id FROM space_memberships WHERE space_id=$1 AND status IN ('active','paused')", [s.id]);
        for (const r of rows) await notify(pool, r.student_id, 'spaces', { title: 'Your mentor space is read-only for now', body: 'Your journal is yours and stays untouched. You can leave any time.', target: '/mentorship', dedupe: `frozen:${s.id}` });
      } else if (ok && s.status === 'frozen') await pool.query("UPDATE spaces SET status='active', frozen_at=NULL WHERE id=$1", [s.id]);
    }
  }

  /* ---------- HTTP ---------- */
  const handler = async (request, response) => {
    const claims = await authenticate(request, response);
    if (!claims) return;
    const uid = claims.uid;
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'GET') {
        const view = url.searchParams.get('view');
        if (view === 'dashboard') return send(response, 200, await dashboard(uid, url.searchParams.get('id')));
        if (view === 'audit') return send(response, 200, await myAudit(uid));
        return send(response, 200, await state(uid));
      }
      const { error, data } = await readJson(request, 8192);
      if (error || !data || typeof data !== 'object') return send(response, error ?? 400, { error: 'Check the details.' });
      const a = data.action;
      let result = {};
      if (a === 'choose_role') await chooseRole(uid, data.role);
      else if (a === 'change_role') await changeRole(uid, data.confirm);
      else if (a === 'cancel_plan') await cancelPlan(uid);
      else if (a === 'create_space') result = await createSpace(uid, data);
      else if (a === 'create_link') result = await createLink(uid, data);
      else if (a === 'resend_link') result = await resendLink(uid, data.id);
      else if (a === 'revoke_link') await revokeLink(uid, data.id);
      else if (a === 'pause_links') await pauseLinks(uid, data.paused);
      else if (a === 'preview') result = await preview(uid, claims, data.token);
      else if (a === 'join') result = await join(uid, claims, request, data);
      else if (a === 'leave') await leave(uid);
      else if (a === 'share') await setShare(uid, request, data);
      else if (a === 'let_in' || a === 'remove') await manage(uid, data);
      else if (a === 'report') await report(uid, data);
      else return send(response, 400, { error: 'Unknown action.' });
      send(response, 200, { ...result, state: await state(uid) });
    } catch (e) {
      if (e.status) return send(response, e.status, { error: e.message, reason: e.reason });
      console.error('Mentorship request failed (' + (e.code ?? 'unknown') + ').');
      send(response, 503, { error: 'Mentorship is temporarily unavailable.' });
    }
  };
  return { handler, sweep, state, dashboard };
}
