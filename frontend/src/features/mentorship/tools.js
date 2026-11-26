import { el, btn, field, fail } from './ui.js';
import { toast } from '../notifications/toast.js';

const tp = '/api/mentor-tools';
const dt = (v) => new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
const input = (type = 'text', ph = '') => { const i = el('input'); i.type = type; i.placeholder = ph; return i; };
const area = (ph = '') => { const a = el('textarea'); a.rows = 3; a.placeholder = ph; return a; };
const section = (title, ...kids) => { const s = el('div', 'mt-block'); s.append(el('strong', '', title), ...kids); return s; };
const list = () => { const d = el('div'); d.style.display = 'grid'; d.style.gap = '8px'; return d; };
function download({ file, type, text }) {
  const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type: `${type};charset=utf-8` })); a.download = file; document.body.append(a); a.click(); a.remove();
}
const gcal = (s) => {
  const f = (d) => new Date(d).toISOString().replace(/[-:]|\.\d{3}/g, '');
  const end = new Date(new Date(s.starts_at).getTime() + 36e5);
  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(s.title)}&dates=${f(s.starts_at)}/${f(end)}&details=${encodeURIComponent('Open Ledgerline > Mentorship to get the join link. It opens 15 minutes before the start.')}`;
};

/** Mentor side: Cohort, Students, Feedback, Admin. */
export function mentorTools(root, { request, readOnly }) {
  const names = ['Cohort', 'Students', 'Feedback', 'Admin']; let cur = 'Cohort';
  const tabs = el('div', 'mt-tabs'); tabs.setAttribute('role', 'tablist'); const body = el('div'); body.style.display = 'grid'; body.style.gap = '16px'; const bs = {};
  const post = async (payload, msg) => { const r = await request(tp, 'POST', payload); if (msg) toast(msg); return r; };
  const show = async (k) => {
    cur = k; for (const n of names) bs[n].setAttribute('aria-selected', String(n === k));
    body.replaceChildren(el('p', 'mt-note', 'Loading...'));
    try { body.replaceChildren(await ({ Cohort: cohort, Students: students, Feedback: feedback, Admin: admin })[k]()); } catch (e) { body.replaceChildren(el('p', 'mt-msg', e.message)); }
  };
  for (const n of names) { const b = el('button', 'btn btn-secondary', n); b.type = 'button'; b.setAttribute('role', 'tab'); b.addEventListener('click', () => { if (n !== cur) void show(n); }); bs[n] = b; tabs.append(b); }
  root.replaceChildren(el('h3', '', 'Mentor tools'), tabs, body);
  if (readOnly) root.insertBefore(el('p', 'mt-note', 'Your space is read-only, so you can look but not change anything.'), tabs);
  const again = () => show(cur);
  const form = (title, fields, label, build, msg) => {
    const box = section(title); const checks = fields.filter((f) => f.check);
    for (const f of fields) box.append(f);
    box.append(btn(label, 'btn-primary', async () => { if (checks.map((f) => f.check()).includes(false)) return; await post(build(), msg); await again(); }));
    return box;
  };

  async function cohort() {
    const d = await request(tp, 'GET'); const wrap = el('div'); wrap.style.display = 'grid'; wrap.style.gap = '16px';
    // Announcements
    const ann = input('text'); const annField = field('Post to your space', area('Process only. No prices, entries or targets.'), true);
    const annBody = annField.querySelector('textarea'); const pinned = input('checkbox'); const sched = input('datetime-local');
    const annList = list();
    for (const a of d.announcements) {
      const row = el('div', 'mt-row'); row.append(el('p', '', `${a.pinned ? 'Pinned: ' : ''}${a.body}`), el('p', 'mt-note', new Date(a.publish_at) > new Date() ? `Goes out ${dt(a.publish_at)}` : dt(a.publish_at)));
      if (!readOnly) { const bt = el('div', 'btn-row'); bt.append(btn(a.pinned ? 'Unpin' : 'Pin', 'btn-secondary', async () => { await post({ action: 'pin', id: a.id, pinned: !a.pinned }); await again(); }), btn('Delete', 'btn-secondary', async () => { await post({ action: 'delete_announcement', id: a.id }); await again(); })); row.append(bt); }
      annList.append(row);
    }
    wrap.append(section('Announcements', ...(readOnly ? [] : [annField, field('Pin to the top', pinned), field('Send later (optional)', sched), btn('Post', 'btn-primary', async () => { if (!annField.check()) return; await post({ action: 'announce', body: annBody.value, pinned: pinned.checked, publish_at: sched.value ? new Date(sched.value).toISOString() : undefined }, 'Posted.'); await again(); })]), annList));
    void ann;
    // Live sessions
    const sess = list();
    for (const s of d.sessions) {
      const row = el('div', 'mt-row'); row.append(el('strong', '', s.title), el('p', 'mt-note', `${dt(s.starts_at)}. ${s.registered} registered${s.capacity ? ` of ${s.capacity} seats` : ''}, ${s.joined} joined`));
      if (s.guests.length) row.append(el('p', 'mt-note', 'Registered: ' + s.guests.map((g) => g.name + (g.joined ? ' (joined)' : '')).join(', ')));
      const bt = el('div', 'btn-row'); const a = el('a', 'btn btn-secondary', 'Open Meet'); a.href = s.link; a.target = '_blank'; a.rel = 'noopener noreferrer'; bt.append(a);
      bt.append(btn('Add to calendar file', 'btn-secondary', async () => download(await request(`${tp}?view=ics&id=${s.id}`, 'GET'))));
      if (!readOnly) bt.append(btn('Cancel session', 'btn-secondary', async () => { if (confirm('Cancel this session? Registered students lose their seat.')) { await post({ action: 'delete_session', id: s.id }); await again(); } }));
      row.append(bt); sess.append(row);
    }
    const sTitle = field('Title', input(), true), sWhen = field('Starts', input('datetime-local'), true), sLink = field('Google Meet link', input('url', 'https://meet.google.com/abc-defg-hij'), true), sSeats = field('Seats (empty for no limit)', input('number')), sDesc = field('What will you cover', area());
    const meetBtn = el('a', 'btn btn-secondary', 'Create a Meet'); meetBtn.href = 'https://meet.new'; meetBtn.target = '_blank'; meetBtn.rel = 'noopener noreferrer';
    wrap.append(section('Live sessions', el('p', 'mt-note', 'Students register for a session. The Meet link stays hidden until they have registered, and it opens 15 minutes before the start. You see who registered and who joined.'), sess,
      ...(readOnly ? [] : [form('Schedule a session', [sTitle, sWhen, sLink, sSeats, sDesc], 'Schedule session', () => ({ action: 'session', title: sTitle.querySelector('input').value, starts_at: new Date(sWhen.querySelector('input').value).toISOString(), link: sLink.querySelector('input').value, capacity: sSeats.querySelector('input').value, description: sDesc.querySelector('textarea').value }), 'Session scheduled. Students were told.'), meetBtn, el('p', 'mt-note', 'Tap Create a Meet, start an instant meeting, then paste its link above.')])));
    // Assignments
    const asg = list();
    for (const a of d.assignments) {
      const row = el('div', 'mt-row'); row.append(el('strong', '', a.title), el('p', 'mt-note', a.due_at ? `Due ${dt(a.due_at)}` : 'No due date'));
      for (const sub of a.submissions) {
        const sr = el('div'); sr.append(el('p', '', `${sub.name}: ${sub.body}`));
        if (sub.status === 'reviewed') sr.append(el('p', 'mt-note', `Reviewed: ${sub.review_note || 'done'}`));
        else if (!readOnly) { const note = input('text', 'Your note'); sr.append(note, btn('Mark reviewed', 'btn-secondary', async () => { await post({ action: 'review', assignment_id: a.id, student_id: sub.student_id, note: note.value }, 'Reviewed. It counts as a journaling day for them.'); await again(); })); }
        row.append(sr);
      }
      asg.append(row);
    }
    const aT = field('Title', input(), true), aB = field('What to do', area()), aD = field('Due (optional)', input('datetime-local'));
    wrap.append(section('Assignments', asg, ...(readOnly ? [] : [form('New assignment', [aT, aB, aD], 'Give assignment', () => ({ action: 'assignment', title: aT.querySelector('input').value, body: aB.querySelector('textarea').value, due_at: aD.querySelector('input').value ? new Date(aD.querySelector('input').value).toISOString() : undefined }), 'Assignment sent.')])));
    // Agenda
    const ag = field('This week', area('One line per day. Example: Mon: review last week'), true);
    wrap.append(section('Weekly agenda', ...(d.agenda[0] ? [el('p', 'mt-note', 'Latest saved agenda is shown to students.')] : []), ...(readOnly ? [] : [ag, btn('Save agenda', 'btn-primary', async () => { if (!ag.check()) return; const m = new Date(); m.setDate(m.getDate() - ((m.getDay() + 6) % 7)); await post({ action: 'agenda', week_start: m.toISOString().slice(0, 10), body: ag.querySelector('textarea').value }, 'Agenda saved.'); await again(); })])));
    // Resources
    const rs = list(); for (const r of d.resources) { const row = el('div', 'mt-row'); const a = el('a', '', `${r.folder}: ${r.title}`); a.href = r.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; row.append(a); if (!readOnly) row.append(btn('Remove', 'btn-secondary', async () => { await post({ action: 'delete_resource', id: r.id }); await again(); })); rs.append(row); }
    const rF = el('select'); for (const f of d.folders) rF.append(new Option(f, f)); const rT = field('Title', input(), true), rU = field('Link (https)', input('url'), true);
    wrap.append(section('Resources', rs, ...(readOnly ? [] : [field('Folder', rF), rT, rU, btn('Add resource', 'btn-primary', async () => { if (![rT, rU].map((f) => f.check()).every(Boolean)) return; await post({ action: 'resource', folder: rF.value, title: rT.querySelector('input').value, url: rU.querySelector('input').value }, 'Added.'); await again(); })])));
    // Rules
    const ru = field('House rules', area(), true); ru.querySelector('textarea').value = d.rules ?? ''; const wm = field('Welcome message', area()); wm.querySelector('textarea').value = d.welcome ?? '';
    if (!readOnly) wrap.append(section('House rules', ru, wm, btn('Save rules', 'btn-primary', async () => { if (!ru.check()) return; await post({ action: 'rules', rules: ru.querySelector('textarea').value, welcome: wm.querySelector('textarea').value }, 'Saved.'); })));
    return wrap;
  }

  async function students() {
    const d = await request(tp + '?view=students', 'GET'); const wrap = el('div'); wrap.style.display = 'grid'; wrap.style.gap = '12px';
    wrap.append(el('p', 'n-in mt-row', `You can see ${d.banner.seen} of ${d.banner.total} students. The rest chose not to share, or their Pro plan lapsed.`));
    if (d.tiles) wrap.append(el('p', '', `Average rules kept: ${d.tiles.avg_rules_pct ?? 'Not enough data'}${d.tiles.avg_rules_pct != null ? '%' : ''}. Average journal days (30): ${d.tiles.avg_journal_days}. Need a nudge: ${d.tiles.needs_nudge}.`));
    for (const n of d.nudge) wrap.append(el('p', 'mt-note', `${n.name}: ${n.reason}`));
    if (d.heatmap.hidden) wrap.append(el('p', 'mt-note', 'The mistake heat map shows once 3 students share, so no one can be picked out.'));
    else {
      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']; const t = el('table', 'mt-table'); t.append(Object.assign(el('caption', '', 'Mistakes by tag and weekday, last 8 weeks')));
      const kinds = [...new Set(d.heatmap.cells.map((c) => c.kind))]; const hr = el('tr'); hr.append(el('th', '', 'Tag'), ...days.map((x) => el('th', '', x))); t.append(hr);
      for (const k of kinds) { const r = el('tr'); r.append(el('td', '', k)); for (let i = 0; i < 7; i++) r.append(el('td', '', String(d.heatmap.cells.find((c) => c.kind === k && c.dow === i)?.n ?? 0))); t.append(r); }
      wrap.append(t);
    }
    if (d.banner.seen) wrap.append(btn('Export CSV', 'btn-secondary', async () => { download(await request(tp + '?view=export', 'GET')); toast('Exported. This is logged.'); }));
    return wrap;
  }

  async function feedback() {
    const [d, dash] = await Promise.all([request(tp + '?view=feedback', 'GET'), request(tp + '?view=roster', 'GET')]);
    const wrap = el('div'); wrap.style.display = 'grid'; wrap.style.gap = '12px'; wrap.append(el('p', 'mt-note', d.scale));
    const pick = el('select'); for (const s of dash.students) pick.append(new Option(s.name ?? 'Student', s.student_id));
    const keys = [['plan_quality', 'Plan quality'], ['risk_rules', 'Risk rules'], ['review_depth', 'Review depth'], ['consistency', 'Consistency']]; const ins = {};
    const note = field('Note', area());
    const fs = [field('Student', pick)]; for (const [k, l] of keys) { ins[k] = input('number'); ins[k].min = 0; ins[k].max = 5; ins[k].value = 3; fs.push(field(l + ' (0 to 5)', ins[k])); }
    if (!readOnly && pick.options.length) wrap.append(section('Process rubric', ...fs, note, btn('Send feedback', 'btn-primary', async () => { await post({ action: 'rubric', student_id: pick.value, note: note.querySelector('textarea').value, ...Object.fromEntries(keys.map(([k]) => [k, Number(ins[k].value)])) }, 'Feedback sent.'); await again(); })));
    const nb = field('Private note (only you see it)', area()); if (!readOnly && pick.options.length) { const sync = () => { nb.querySelector('textarea').value = d.notes.find((n) => n.student_id === pick.value)?.body ?? ''; }; pick.addEventListener('change', sync); sync(); wrap.append(section('Private notes', nb, btn('Save note', 'btn-secondary', async () => { await post({ action: 'note', student_id: pick.value, body: nb.querySelector('textarea').value }, 'Saved.'); await again(); }))); }
    const hist = list(); for (const r of d.rubrics.slice(0, 10)) hist.append(el('p', 'mt-note', `${r.name}: plan ${r.plan_quality}, risk ${r.risk_rules}, review ${r.review_depth}, consistency ${r.consistency} on ${dt(r.created_at)}`));
    wrap.append(section('Recent feedback', hist));
    return wrap;
  }

  async function admin() {
    const [a, r] = await Promise.all([request(tp + '?view=audit', 'GET'), request(tp + '?view=reports', 'GET')]);
    const wrap = el('div'); wrap.style.display = 'grid'; wrap.style.gap = '12px';
    const al = list(); for (const i of a.items) al.append(el('p', 'mt-note', `${dt(i.at)}: ${i.action.replaceAll('_', ' ')}${i.detail ? ' (' + i.detail + ')' : ''}`)); if (!a.items.length) al.append(el('p', 'mt-note', 'Nothing yet.'));
    const rl = list(); for (const i of r.items) rl.append(el('p', 'mt-note', `${dt(i.created_at)}: ${i.category}. Status ${i.status}. Who reported is never shown.`)); if (!r.items.length) rl.append(el('p', 'mt-note', 'No reports.'));
    wrap.append(section('Activity log', al), section('Reports about your space', rl)); return wrap;
  }
  void show('Cohort');
}

/** Student side: what the mentor shared, plus register and join for live sessions. */
export async function fromMentor(root, { request }) {
  const box = el('div'); box.style.display = 'grid'; box.style.gap = '12px'; root.append(el('strong', '', 'From your mentor'), box);
  const load = async () => {
    let d; try { d = await request(tp + '?view=feed', 'GET'); } catch { box.replaceChildren(el('p', 'mt-note', 'Mentor updates are unavailable right now.')); return; }
    box.replaceChildren();
    if (d.read_only) box.append(el('p', 'n-in mt-row', 'This space is read-only right now. You can read, not register or submit.'));
    for (const a of d.announcements) box.append(el('p', 'mt-row', `${a.pinned ? 'Pinned: ' : ''}${a.body}`));
    if (d.agenda) box.append(section('This week', el('p', '', d.agenda.body)));
    const sess = section('Live sessions');
    if (!d.sessions.length) sess.append(el('p', 'mt-note', 'No sessions scheduled.'));
    for (const s of d.sessions) {
      const row = el('div', 'mt-row'); row.append(el('strong', '', s.title), el('p', 'mt-note', `${dt(s.starts_at)}. ${s.registered}${s.capacity ? ` of ${s.capacity}` : ''} registered`));
      if (s.description) row.append(el('p', '', s.description));
      const bt = el('div', 'btn-row');
      if (!s.is_registered) bt.append(btn(s.capacity && s.registered >= s.capacity ? 'Full' : 'Register', 'btn-primary', async (b) => { if (b.textContent === 'Full') { toast('All seats are taken.'); return; } await request(tp, 'POST', { action: 'register', session_id: s.id }); toast('You are registered. The link opens 15 minutes before the start.'); await load(); }));
      else {
        const start = new Date(s.starts_at).getTime(), open = Date.now() >= start - 15 * 60000;
        bt.append(btn(open ? 'Join on Google Meet' : 'Registered. Link opens 15 min before', open ? 'btn-primary' : 'btn-secondary', async () => {
          if (!open) { toast(`The link opens at ${new Date(start - 15 * 60000).toLocaleTimeString('en-IN', { timeStyle: 'short' })}.`); return; }
          const r = await request(tp, 'POST', { action: 'join_session', session_id: s.id }); window.open(r.link, '_blank', 'noopener,noreferrer');
        }));
        const g = el('a', 'btn btn-secondary', 'Add to Google Calendar'); g.href = gcal(s); g.target = '_blank'; g.rel = 'noopener noreferrer'; bt.append(g);
        bt.append(btn('Calendar file', 'btn-secondary', async () => download(await request(`${tp}?view=ics&id=${s.id}`, 'GET'))));
        bt.append(btn('Cancel registration', 'btn-secondary', async () => { await request(tp, 'POST', { action: 'unregister', session_id: s.id }); toast('Registration cancelled.'); await load(); }));
      }
      row.append(bt); sess.append(row);
    }
    box.append(sess);
    if (d.assignments.length) {
      const as = section('Assignments');
      for (const a of d.assignments) {
        const row = el('div', 'mt-row'); row.append(el('strong', '', a.title), el('p', '', a.body ?? ''));
        if (a.status === 'reviewed') row.append(el('p', 'mt-note', `Reviewed: ${a.review_note || 'done'}`));
        else if (!d.read_only) { const ans = area('Your answer'); ans.value = a.my_answer ?? ''; row.append(ans, btn(a.status ? 'Update answer' : 'Submit', 'btn-primary', async () => { if (!ans.value.trim()) { toast('Write your answer first.'); return; } await request(tp, 'POST', { action: 'submit', assignment_id: a.id, body: ans.value }); toast('Submitted.'); await load(); })); }
        as.append(row);
      }
      box.append(as);
    }
    if (d.resources.length) { const rs = section('Resources'); for (const r of d.resources) { const a = el('a', '', `${r.folder}: ${r.title}`); a.href = r.url; a.target = '_blank'; a.rel = 'noopener noreferrer'; rs.append(a); } box.append(rs); }
    if (d.feedback.length) { const f = section('Feedback on your process'); for (const r of d.feedback) f.append(el('p', 'mt-note', `Plan ${r.plan_quality}, risk ${r.risk_rules}, review ${r.review_depth}, consistency ${r.consistency}. ${r.note ?? ''}`)); box.append(f); }
  };
  await load();
}
