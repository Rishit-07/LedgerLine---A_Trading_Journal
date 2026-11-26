/* Mentor tools: cohort content, assignments, feedback, audit and export for one space.
   Students pay nothing here and nothing here moves money. A mentor only ever reads what a student chose to share. */
import { hasPlan } from './entitlements.js';
import { notify } from './notifications.js';
import { cachedStats } from './mentorship-stats.js';
import { readJson, send } from './http.js';

const FOLDERS = ['Checklists', 'Notes', 'Sample charts', 'Recordings'];
const SIGNAL = /\b(buy|sell|long|short|target|stop ?loss|sl|tp)\b[^.]{0,30}\b\d{2,}/i;
const clean = (v, max) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]+/g, ' ').trim().slice(0, max);
const fail = (status, error, reason) => { throw Object.assign(new Error(error), { status, reason }); };
const meet = (v) => { const u = clean(v, 500); if (!/^https:\/\/meet\.google\.com\/[a-z0-9-]{3,}(\?[^\s]*)?$/i.test(u)) fail(400, 'Paste a Google Meet link, like https://meet.google.com/abc-defg-hij. To make one, use Create a Meet.'); return u; };
const https = (v) => { const u = clean(v, 500); if (!/^https:\/\/[^\s]+$/.test(u)) fail(400, 'Use a full https link.'); return u; };
const date = (v, what) => { const d = new Date(v); if (Number.isNaN(d.getTime())) fail(400, `Choose a valid ${what}.`); return d; };
const ics = (s) => ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Ledgerline//Mentor session//EN', 'BEGIN:VEVENT', `UID:${s.id}@ledgerline`,
  `DTSTAMP:${new Date().toISOString().replace(/[-:]|\.\d{3}/g, '')}`, `DTSTART:${new Date(s.starts_at).toISOString().replace(/[-:]|\.\d{3}/g, '')}`,
  `SUMMARY:${s.title.replace(/[,;\\\n]/g, ' ')}`, 'DESCRIPTION:Open Ledgerline > Mentorship to get the join link. It opens 15 minutes before the start.', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
const csvCell = (v) => { const t = String(v ?? ''); return /^[=+\-@\t\r]/.test(t) ? `"'${t.replace(/"/g, '""')}"` : /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t; };

export function createMentorToolsApi(pool, { authenticate, now = () => new Date(), plans = { hasPlan } }) {
  const one = async (sql, p) => (await pool.query(sql, p)).rows[0];
  const audit = (space, actor, action, target, detail = '') => pool.query('INSERT INTO mentor_audit_log(space_id,actor_id,action,target_id,detail) VALUES($1,$2,$3,$4,$5)', [space, actor, action, target ?? null, detail]);

  async function ownerGate(uid, { writable = true } = {}) {
    const space = await one("SELECT * FROM spaces WHERE owner_id=$1 AND status IN ('active','frozen','closing')", [uid]);
    if (!space) fail(403, 'Create your space first.', 'no_space');
    const ver = await one('SELECT status FROM mentor_verifications WHERE user_id=$1', [uid]);
    if (ver?.status !== 'approved') fail(403, 'Get verified first.', 'not_verified');
    if (writable && (space.status !== 'active' || !await plans.hasPlan(pool, uid, 'mentor', now()))) fail(403, 'Your space is read-only until your mentor plan is active.', 'needs_plan');
    return space;
  }
  const memberOf = (uid) => one(`SELECT m.*, s.owner_id, s.status space_status FROM space_memberships m JOIN spaces s ON s.id=m.space_id WHERE m.student_id=$1 AND m.status IN ('active','paused') `, [uid]);
  async function sharingStudent(space, studentId) {
    const m = await one("SELECT * FROM space_memberships WHERE space_id=$1 AND student_id=$2 AND status='active' AND level1", [space.id, studentId]);
    if (!m) fail(404, 'That student is not sharing with you.');
    return m;
  }

  /* ---------- reads ---------- */
  async function cohort(space) {
    const [ann, agenda, assignments, subs, res, sess] = await Promise.all([
      pool.query('SELECT * FROM mentor_announcements WHERE space_id=$1 ORDER BY pinned DESC, publish_at DESC LIMIT 50', [space.id]),
      pool.query('SELECT week_start, body FROM space_agenda WHERE space_id=$1 ORDER BY week_start DESC LIMIT 8', [space.id]),
      pool.query('SELECT * FROM mentor_assignments WHERE space_id=$1 ORDER BY created_at DESC LIMIT 30', [space.id]),
      pool.query(`SELECT s.assignment_id, s.student_id, s.body, s.submitted_at, s.status, s.review_note, coalesce(p.display_name,'Student') name
        FROM assignment_submissions s JOIN mentor_assignments a ON a.id=s.assignment_id LEFT JOIN user_profile p ON p.user_id=s.student_id
        JOIN space_memberships m ON m.student_id=s.student_id AND m.space_id=a.space_id AND m.status='active' AND m.level1
        WHERE a.space_id=$1 ORDER BY s.submitted_at DESC LIMIT 200`, [space.id]),
      pool.query('SELECT * FROM space_resources WHERE space_id=$1 ORDER BY folder, created_at DESC', [space.id]),
      pool.query(`SELECT s.*, (SELECT count(*)::int FROM space_session_guests g WHERE g.session_id=s.id) registered, (SELECT count(*)::int FROM space_session_guests g WHERE g.session_id=s.id AND g.joined_at IS NOT NULL) joined,
        (SELECT coalesce(json_agg(json_build_object('name', coalesce(p.display_name,'Student'), 'joined', g.joined_at IS NOT NULL) ORDER BY g.registered_at), '[]') FROM space_session_guests g LEFT JOIN user_profile p ON p.user_id=g.student_id WHERE g.session_id=s.id) guests
        FROM space_sessions s WHERE s.space_id=$1 AND s.starts_at>$2 ORDER BY s.starts_at LIMIT 20`, [space.id, new Date(now().getTime() - 4 * 36e5)]),
    ]);
    return { rules: space.space_rules, welcome: space.welcome_message, announcements: ann.rows, agenda: agenda.rows, assignments: assignments.rows.map((a) => ({ ...a, submissions: subs.rows.filter((s) => s.assignment_id === a.id) })), resources: res.rows, sessions: sess.rows, folders: FOLDERS };
  }
  async function feed(uid) {
    const m = await memberOf(uid);
    if (!m) fail(404, 'You are not in a space.');
    const sid = m.space_id;
    const [ann, agenda, asg, res, sess, rub] = await Promise.all([
      pool.query('SELECT id, body, pinned, publish_at FROM mentor_announcements WHERE space_id=$1 AND publish_at<=$2 ORDER BY pinned DESC, publish_at DESC LIMIT 20', [sid, now()]),
      pool.query('SELECT week_start, body FROM space_agenda WHERE space_id=$1 ORDER BY week_start DESC LIMIT 1', [sid]),
      pool.query(`SELECT a.id, a.title, a.body, a.due_at, s.status, s.body my_answer, s.review_note FROM mentor_assignments a LEFT JOIN assignment_submissions s ON s.assignment_id=a.id AND s.student_id=$2 WHERE a.space_id=$1 ORDER BY a.created_at DESC LIMIT 20`, [sid, uid]),
      pool.query('SELECT folder, title, url FROM space_resources WHERE space_id=$1 ORDER BY folder, created_at DESC', [sid]),
      pool.query(`SELECT s.id, s.title, s.starts_at, s.description, s.capacity, (SELECT count(*)::int FROM space_session_guests g WHERE g.session_id=s.id) registered,
        EXISTS (SELECT 1 FROM space_session_guests g WHERE g.session_id=s.id AND g.student_id=$3) is_registered
        FROM space_sessions s WHERE s.space_id=$1 AND s.starts_at>$2 ORDER BY s.starts_at LIMIT 10`, [sid, new Date(now().getTime() - 4 * 36e5), uid]),
      pool.query('SELECT plan_quality, risk_rules, review_depth, consistency, note, created_at FROM space_rubrics WHERE space_id=$1 AND student_id=$2 ORDER BY created_at DESC LIMIT 5', [sid, uid]),
    ]);
    return { read_only: m.space_status !== 'active', announcements: ann.rows, agenda: agenda.rows[0] ?? null, assignments: asg.rows, resources: res.rows, sessions: sess.rows, feedback: rub.rows };
  }
  async function students(space, uid) {
    const { rows: members } = await pool.query(`SELECT m.student_id, m.level2, m.level3, coalesce(p.display_name,'Student') name FROM space_memberships m LEFT JOIN user_profile p ON p.user_id=m.student_id WHERE m.space_id=$1 AND m.status='active'`, [space.id]);
    const sharing = [];
    for (const m of members) {
      if (!(await one('SELECT 1 FROM space_memberships WHERE space_id=$1 AND student_id=$2 AND level1', [space.id, m.student_id]))) continue;
      if (!await plans.hasPlan(pool, m.student_id, 'pro', now())) continue;
      sharing.push(m);
    }
    const out = { banner: { seen: sharing.length, total: members.length }, tiles: null, heatmap: { hidden: 'needs_3' }, nudge: [] };
    if (!sharing.length) return out;
    let rules = 0, rn = 0, days = 0;
    for (const m of sharing) {
      const s = await cachedStats(pool, m.student_id, m);
      if (typeof s.rules_followed_pct === 'number') { rules += s.rules_followed_pct; rn++; }
      days += s.journal_days_30;
      if (s.journal_days_30 < 3) out.nudge.push({ name: m.name, reason: `Journaled ${s.journal_days_30} of 30 days` });
      else if (typeof s.rules_followed_pct === 'number' && s.rules_followed_pct < 60) out.nudge.push({ name: m.name, reason: `Rules kept on ${s.rules_followed_pct}%` });
    }
    out.tiles = { avg_rules_pct: rn ? Math.round(rules / rn) : null, avg_journal_days: Math.round(days / sharing.length), needs_nudge: out.nudge.length };
    if (sharing.length >= 3) {
      const { rows } = await pool.query(`SELECT kind, extract(dow from created_at)::int dow, count(*)::int n FROM mistakes WHERE user_id = ANY($1::text[]) AND created_at>$2 GROUP BY 1,2 ORDER BY 1,2`, [sharing.map((m) => m.student_id), new Date(now().getTime() - 56 * 864e5)]);
      out.heatmap = { cells: rows };
    }
    for (const m of sharing) await pool.query("INSERT INTO mentor_view_audit(space_id,mentor_id,student_id,what) SELECT $1,$2,$3,'cohort' WHERE NOT EXISTS (SELECT 1 FROM mentor_view_audit WHERE space_id=$1 AND mentor_id=$2 AND student_id=$3 AND what='cohort' AND at>$4)", [space.id, uid, m.student_id, new Date(now().getTime() - 36e5)]);
    return out;
  }
  async function feedback(space) {
    const rub = await pool.query(`SELECT r.*, coalesce(p.display_name,'Student') name FROM space_rubrics r LEFT JOIN user_profile p ON p.user_id=r.student_id WHERE r.space_id=$1 ORDER BY r.created_at DESC LIMIT 50`, [space.id]);
    const notes = await pool.query('SELECT student_id, body, updated_at FROM mentor_notes WHERE space_id=$1', [space.id]);
    return { rubrics: rub.rows, notes: notes.rows, scale: 'Score the process, not the outcome. 0 to 5.' };
  }
  async function exportCsv(space, uid) {
    const { rows } = await pool.query(`SELECT m.student_id, m.level2, m.level3, coalesce(p.display_name,'Student') name, m.joined_at FROM space_memberships m LEFT JOIN user_profile p ON p.user_id=m.student_id WHERE m.space_id=$1 AND m.status='active' AND m.level1`, [space.id]);
    const lines = [['Name', 'Joined', 'Rules kept %', 'Journal days (30)', 'Streak'].join(',')];
    for (const m of rows) {
      if (!await plans.hasPlan(pool, m.student_id, 'pro', now())) continue;
      const s = await cachedStats(pool, m.student_id, m);
      lines.push([m.name, new Date(m.joined_at).toISOString().slice(0, 10), typeof s.rules_followed_pct === 'number' ? s.rules_followed_pct : 'Not enough data', s.journal_days_30, s.streak.current].map(csvCell).join(','));
    }
    await audit(space.id, uid, 'export_csv', null, `${lines.length - 1} students`);
    return lines.join('\n') + '\n';
  }

  /* ---------- writes (owner) ---------- */
  const actions = {
    async announce(space, uid, d) {
      const body = clean(d.body, 1000); if (!body) fail(400, 'Write something to post.');
      if (SIGNAL.test(body)) fail(422, 'This looks like a trade call. Spaces teach process, so rewrite it without prices or entries.', 'signal');
      const at = d.publish_at ? date(d.publish_at, 'time') : now();
      const r = await one('INSERT INTO mentor_announcements(space_id,author_id,body,pinned,publish_at) VALUES($1,$2,$3,$4,$5) RETURNING id', [space.id, uid, body, d.pinned === true, at]);
      if (at <= now()) await notifyMembers(space, 'New post in your mentor space', '', `ann:${r.id}`);
      return { id: r.id };
    },
    async pin(space, uid, d) { await pool.query('UPDATE mentor_announcements SET pinned=$3 WHERE id::text=$1 AND space_id=$2', [String(d.id), space.id, d.pinned === true]); },
    async delete_announcement(space, uid, d) { await pool.query('DELETE FROM mentor_announcements WHERE id::text=$1 AND space_id=$2', [String(d.id), space.id]); },
    async agenda(space, uid, d) {
      const week = date(d.week_start, 'week'); const day = week.toISOString().slice(0, 10);
      await pool.query('INSERT INTO space_agenda(space_id,week_start,body) VALUES($1,$2,$3) ON CONFLICT (space_id,week_start) DO UPDATE SET body=excluded.body', [space.id, day, clean(d.body, 2000)]);
    },
    async assignment(space, uid, d) {
      const title = clean(d.title, 120); if (!title) fail(400, 'Add a title.');
      const r = await one('INSERT INTO mentor_assignments(space_id,title,body,due_at) VALUES($1,$2,$3,$4) RETURNING id', [space.id, title, clean(d.body, 2000), d.due_at ? date(d.due_at, 'due date') : null]);
      await notifyMembers(space, 'New assignment: ' + title, '', `asg:${r.id}`); return { id: r.id };
    },
    async review(space, uid, d) {
      const a = await one('SELECT id, title FROM mentor_assignments WHERE id::text=$1 AND space_id=$2', [String(d.assignment_id), space.id]); if (!a) fail(404, 'Assignment not found.');
      await sharingStudent(space, d.student_id);
      const r = await pool.query("UPDATE assignment_submissions SET status='reviewed', review_note=$3, reviewed_at=$4 WHERE assignment_id=$1 AND student_id=$2 AND status='submitted'", [a.id, d.student_id, clean(d.note, 1000), now()]);
      if (!r.rowCount) fail(409, 'Nothing to review.');
      // A reviewed assignment counts as a journaling day for the student's streak.
      await pool.query("INSERT INTO streak_days(user_id,day,kind) VALUES($1,$2,'review') ON CONFLICT (user_id,day) DO NOTHING", [d.student_id, now().toISOString().slice(0, 10)]);
      await audit(space.id, uid, 'review_assignment', d.student_id, a.title);
      await notify(pool, d.student_id, 'spaces', { title: 'Your assignment was reviewed', body: a.title, target: '/mentorship', dedupe: `rev:${a.id}:${d.student_id}` });
    },
    async resource(space, uid, d) {
      if (!FOLDERS.includes(d.folder)) fail(400, 'Choose a folder.');
      const title = clean(d.title, 120); if (!title) fail(400, 'Add a title.');
      await pool.query('INSERT INTO space_resources(space_id,folder,title,url) VALUES($1,$2,$3,$4)', [space.id, d.folder, title, https(d.url)]);
    },
    async delete_resource(space, uid, d) { await pool.query('DELETE FROM space_resources WHERE id::text=$1 AND space_id=$2', [String(d.id), space.id]); },
    async session(space, uid, d) {
      const title = clean(d.title, 120); if (!title) fail(400, 'Add a title.');
      const at = date(d.starts_at, 'start time'); if (at <= now()) fail(400, 'Choose a time in the future.');
      const cap = d.capacity === '' || d.capacity == null ? null : Number(d.capacity);
      if (cap !== null && (!Number.isInteger(cap) || cap < 1 || cap > 500)) fail(400, 'Seats must be 1 to 500, or empty for no limit.');
      const r = await one('INSERT INTO space_sessions(space_id,title,starts_at,link,description,capacity) VALUES($1,$2,$3,$4,$5,$6) RETURNING id', [space.id, title, at, meet(d.link), clean(d.description, 600), cap]);
      await notifyMembers(space, 'New live session: ' + title, 'Register to get the join link.', `sessnew:${r.id}`);
      return { id: r.id };
    },
    async delete_session(space, uid, d) { await pool.query('DELETE FROM space_sessions WHERE id::text=$1 AND space_id=$2', [String(d.id), space.id]); },
    async rules(space, uid, d) {
      const rules = clean(d.rules, 1200); if (!rules) fail(400, 'Add your house rules.');
      await pool.query('UPDATE spaces SET space_rules=$2, welcome_message=$3 WHERE id=$1', [space.id, rules, clean(d.welcome, 400)]);
      await audit(space.id, uid, 'update_rules', null);
    },
    async rubric(space, uid, d) {
      await sharingStudent(space, d.student_id);
      const keys = ['plan_quality', 'risk_rules', 'review_depth', 'consistency'], v = keys.map((k) => Number(d[k]));
      if (v.some((n) => !Number.isInteger(n) || n < 0 || n > 5)) fail(400, 'Score each part from 0 to 5.');
      await pool.query('INSERT INTO space_rubrics(space_id,student_id,plan_quality,risk_rules,review_depth,consistency,note) VALUES($1,$2,$3,$4,$5,$6,$7)', [space.id, d.student_id, ...v, clean(d.note, 1000)]);
      await audit(space.id, uid, 'rubric', d.student_id);
      await notify(pool, d.student_id, 'spaces', { title: 'Your mentor left feedback', body: '', target: '/mentorship', dedupe: `rub:${space.id}:${d.student_id}:${now().toISOString().slice(0, 10)}` });
    },
    async note(space, uid, d) {
      await sharingStudent(space, d.student_id);
      await pool.query('INSERT INTO mentor_notes(space_id,student_id,body) VALUES($1,$2,$3) ON CONFLICT (space_id,student_id) DO UPDATE SET body=excluded.body, updated_at=now()', [space.id, d.student_id, clean(d.body, 2000)]);
    },
  };
  async function notifyMembers(space, title, body, key) {
    const { rows } = await pool.query("SELECT student_id FROM space_memberships WHERE space_id=$1 AND status='active'", [space.id]);
    for (const r of rows) await notify(pool, r.student_id, 'spaces', { title, body, target: '/mentorship', dedupe: `${key}:${r.student_id}` });
  }

  /** Scheduled: publish due announcements and remind about live sessions 1 day and 1 hour before. */
  async function sweep() {
    const t = now();
    const { rows: due } = await pool.query(`SELECT a.id, a.space_id FROM mentor_announcements a WHERE a.publish_at<=$1 AND a.publish_at>$2`, [t, new Date(t.getTime() - 15 * 60000)]);
    for (const a of due) await notifyMembers({ id: a.space_id }, 'New post in your mentor space', '', `ann:${a.id}`);
    const { rows: soon } = await pool.query('SELECT id, space_id, title, starts_at FROM space_sessions WHERE starts_at>$1 AND starts_at<=$2', [t, new Date(t.getTime() + 24 * 36e5)]);
    for (const s of soon) {
      const mins = (new Date(s.starts_at) - t) / 60000;
      const kind = mins <= 60 ? 'hour' : 'day';
      const { rows: guests } = await pool.query('SELECT student_id FROM space_session_guests WHERE session_id=$1', [s.id]);
      for (const g of guests) await notify(pool, g.student_id, 'spaces', { title: `${s.title} starts ${kind === 'hour' ? 'within the hour' : 'within a day'}`, body: 'Open Mentorship to join.', target: '/mentorship', dedupe: `sess:${s.id}:${kind}:${g.student_id}` });
    }
  }

  const handler = async (request, response) => {
    const claims = await authenticate(request, response);
    if (!claims) return;
    const uid = claims.uid;
    try {
      const url = new URL(request.url, 'http://localhost');
      if (request.method === 'GET') {
        const view = url.searchParams.get('view');
        if (view === 'feed') return send(response, 200, await feed(uid));
        if (view === 'ics') {
          const s = await one('SELECT s.* FROM space_sessions s WHERE s.id::text=$1', [String(url.searchParams.get('id'))]);
          const ok = s && ((await one('SELECT 1 FROM space_session_guests WHERE session_id=$1 AND student_id=$2', [s.id, uid])) || (await one('SELECT 1 FROM spaces WHERE id=$1 AND owner_id=$2', [s.space_id, uid])));
          if (!ok) fail(404, 'Register for this session first.');
          return send(response, 200, { file: 'session.ics', type: 'text/calendar', text: ics(s) });
        }
        const space = await ownerGate(uid, { writable: false });
        if (view === 'students') return send(response, 200, await students(space, uid));
        if (view === 'roster') return send(response, 200, { students: (await pool.query("SELECT m.student_id, coalesce(p.display_name,'Student') name FROM space_memberships m LEFT JOIN user_profile p ON p.user_id=m.student_id WHERE m.space_id=$1 AND m.status='active' AND m.level1 ORDER BY m.joined_at", [space.id])).rows });
        if (view === 'feedback') return send(response, 200, await feedback(space));
        if (view === 'audit') return send(response, 200, { items: (await pool.query('SELECT actor_id, action, target_id, detail, at FROM mentor_audit_log WHERE space_id=$1 ORDER BY at DESC LIMIT 100', [space.id])).rows });
        if (view === 'reports') return send(response, 200, { items: (await pool.query("SELECT category, severity, status, created_at FROM space_reports WHERE space_id=$1 AND side='student' ORDER BY created_at DESC LIMIT 50", [space.id])).rows });
        if (view === 'export') {
          if (!await plans.hasPlan(pool, uid, 'mentor', now())) fail(403, 'Your mentor plan is not active.', 'needs_plan');
          return send(response, 200, { file: 'students.csv', type: 'text/csv', text: await exportCsv(space, uid) });
        }
        return send(response, 200, await cohort(space));
      }
      const { error, data } = await readJson(request, 16384);
      if (error || !data || typeof data !== 'object') return send(response, error ?? 400, { error: 'Check the details.' });
      if (data.action === 'submit') {
        const m = await memberOf(uid);
        if (!m || m.space_status !== 'active' || !m.level1) fail(403, 'You cannot submit right now.');
        const a = await one('SELECT id FROM mentor_assignments WHERE id::text=$1 AND space_id=$2', [String(data.assignment_id), m.space_id]); if (!a) fail(404, 'Assignment not found.');
        const body = clean(data.body, 4000); if (!body) fail(400, 'Write your answer first.');
        await pool.query(`INSERT INTO assignment_submissions(assignment_id,student_id,body) VALUES($1,$2,$3)
          ON CONFLICT (assignment_id,student_id) DO UPDATE SET body=excluded.body, submitted_at=now(), status='submitted', review_note='', reviewed_at=NULL`, [a.id, uid, body]);
        return send(response, 200, { ok: true });
      }
      if (['register', 'unregister', 'join_session'].includes(data.action)) {
        const m = await memberOf(uid);
        if (!m || !m.level1) fail(403, 'Join a mentor space first.');
        const s = await one('SELECT * FROM space_sessions WHERE id::text=$1 AND space_id=$2', [String(data.session_id), m.space_id]);
        if (!s) fail(404, 'Session not found.');
        if (data.action === 'unregister') {
          await pool.query('DELETE FROM space_session_guests WHERE session_id=$1 AND student_id=$2', [s.id, uid]);
          return send(response, 200, { ok: true });
        }
        if (m.space_status !== 'active') fail(403, 'This space is read-only right now.');
        if (data.action === 'register') {
          if (new Date(s.starts_at) < now()) fail(400, 'This session already started.');
          const have = await one('SELECT 1 FROM space_session_guests WHERE session_id=$1 AND student_id=$2', [s.id, uid]);
          if (!have && s.capacity) {
            const c = await one('SELECT count(*)::int n FROM space_session_guests WHERE session_id=$1', [s.id]);
            if (c.n >= s.capacity) fail(409, 'All seats are taken.', 'full');
          }
          await pool.query('INSERT INTO space_session_guests(session_id,student_id) VALUES($1,$2) ON CONFLICT DO NOTHING', [s.id, uid]);
          return send(response, 200, { ok: true });
        }
        // join_session: registered only, opens 15 minutes before the start and stays open for 3 hours.
        const g = await one('SELECT 1 FROM space_session_guests WHERE session_id=$1 AND student_id=$2', [s.id, uid]);
        if (!g) fail(403, 'Register first to get the link.', 'not_registered');
        const start = new Date(s.starts_at).getTime(), t = now().getTime();
        if (t < start - 15 * 60000) fail(425, 'The link opens 15 minutes before the start.', 'too_early');
        if (t > start + 3 * 36e5) fail(410, 'This session has ended.', 'ended');
        await pool.query('UPDATE space_session_guests SET joined_at=coalesce(joined_at, $3) WHERE session_id=$1 AND student_id=$2', [s.id, uid, now()]);
        return send(response, 200, { link: s.link });
      }
      const fn = actions[data.action];
      if (!fn) return send(response, 400, { error: 'Unknown action.' });
      const space = await ownerGate(uid);
      const result = await fn(space, uid, data);
      send(response, 200, result ?? { ok: true });
    } catch (e) {
      if (e.status) return send(response, e.status, { error: e.message, reason: e.reason });
      console.error('Mentor tools request failed (' + (e.code ?? 'unknown') + ').');
      send(response, 503, { error: 'Mentor tools are temporarily unavailable.' });
    }
  };
  return { handler, sweep };
}
