import { el, btn, field, check, path, fail, copyText } from './ui.js';
import { consentFlow, tokenFrom } from './join.js';
import { swapPanels, popIn } from '../notifications/motion.js';
import { toast } from '../notifications/toast.js';

const HEADS = (s) => (s.role === 'none' ? ['Mentorship', 'Join a mentor, or become one. Pick one. You cannot be both at once.'] : s.role === 'student' ? ['Your mentor', 'One mentor at a time. You choose what they can see.'] : s.checklist?.space ? ['Your mentor space', 'You lead it, you see how each student grows.'] : ['Become a mentor', 'Three steps: get verified, activate your plan, create your space.']);
const when = (v) => new Date(v).toLocaleDateString('en-IN', { dateStyle: 'medium' });

export const mentorshipPage = {
  title: 'Mentorship',
  description: 'Join a mentor, or become one.',
  endpoint: path,
  content: '<section class="n-out ws-card mt-card" data-mt-head></section><div data-mt-body></div>',
  bind(page, { data, request }) {
    let s = data;
    const head = page.querySelector('[data-mt-head]');
    const body = page.querySelector('[data-mt-body]');
    const act = async (payload) => { const out = await request(path, 'POST', payload); s = out.state; render(); return out; };
    const reload = async () => { s = await request(path, 'GET'); render(); };

    function header() {
      const [title, sub] = HEADS(s);
      head.replaceChildren();
      const row = el('div', 'mt-head'); const left = el('div'); left.append(el('h2', '', title), el('p', '', sub)); row.append(left);
      if (s.role !== 'none') {
        const rc = s.role_change ?? { state: 'free' };
        const label = rc.state === 'cooldown' ? `Change role in ${rc.days} days` : rc.state === 'cancel_plan' ? 'Cancel mentor plan' : 'Change role';
        const b = btn(label, 'btn-secondary', async () => {
          if (rc.state === 'cancel_plan') { if (confirm('Cancel your mentor plan? It ends at the end of the period you paid for.')) await act({ action: 'cancel_plan' }); return; }
          if (rc.state === 'close') {
            if (!confirm('Close your space and change role? Members get 30 days of read-only access, new joiners stop, and your plan ends at the end of the paid period with no refund. You stay verified.')) return;
            await act({ action: 'change_role', confirm: true }); return;
          }
          if (s.role === 'student' && s.membership) { toast('Leave your mentor first.'); return; }
          await act({ action: 'change_role' });
        });
        if (rc.state === 'cooldown') { b.disabled = true; b.setAttribute('aria-disabled', 'true'); b.title = 'Your space was created recently. This unlocks on ' + when(rc.unlocks_at); }
        b.dataset.keepDisabled = rc.state === 'cooldown' ? '1' : '';
        row.append(b);
      }
      head.append(row);
    }

    function noneState() {
      const grid = el('div', 'mt-two mt-rise');
      const mk = (title, text, points, label, role) => {
        const c = el('section', 'n-out ws-card mt-card'); c.append(el('h3', '', title), el('p', '', text));
        const ul = el('ul', 'mt-list'); for (const p of points) ul.append(el('li', '', '✓ ' + p)); c.append(ul, btn(label, 'btn-primary', () => act({ action: 'choose_role', role })));
        return c;
      };
      grid.append(
        mk('I want a mentor', 'Join a mentor you know. It needs the Pro plan, and your own journal stays yours.', ['Open the personal link your mentor sent you', 'Needs the Pro plan. You choose what your mentor can see', 'Leave any time, no waiting'], 'Join a mentor', 'student'),
        mk('I want to be a mentor', 'Teach process. We check once, by hand, before you can create a space. Students never pay to join you.', ['Get verified', 'Activate the mentor plan', 'Create your space'], 'Become a mentor', 'mentor'));
      return grid;
    }

    /* ---- student ---- */
    function studentState() {
      const wrap = el('div'); const tabs = el('div', 'mt-tabs'); const panels = {};
      const names = s.membership ? [['mentor', 'My mentor'], ['join', 'Join a mentor']] : [['join', 'Join a mentor']];
      let cur = names[0][0];
      const buttons = {};
      for (const [key, label] of names) {
        const b = el('button', 'btn btn-secondary', label); b.type = 'button'; b.setAttribute('role', 'tab');
        b.addEventListener('click', () => { if (key === cur) return; buttons[cur].setAttribute('aria-selected', 'false'); swapPanels(panels[cur], panels[key]); cur = key; b.setAttribute('aria-selected', 'true'); });
        buttons[key] = b; tabs.append(b);
        panels[key] = el('section', 'n-out ws-card mt-card'); panels[key].hidden = key !== cur;
      }
      buttons[cur].setAttribute('aria-selected', 'true'); tabs.setAttribute('role', 'tablist');
      wrap.append(tabs, ...Object.values(panels)); wrap.style.display = 'grid'; wrap.style.gap = '16px';
      // join panel
      const jp = panels.join; jp.append(el('h3', '', 'Join a mentor space'), el('p', '', 'Open the link your mentor gave you. You join at once, after you accept their rules and choose what they can see.'));
      if (s.needs_pro) jp.append(el('p', 'mt-note', 'Joining a mentor needs the Pro plan.'));
      const input = el('input'); input.placeholder = 'Paste your link'; input.setAttribute('aria-label', 'Your mentor link');
      const flow = el('div'); flow.style.display = 'grid'; flow.style.gap = '12px';
      jp.append(field('Your link', input, true), btn('Find space', 'btn-primary', async () => { const t = tokenFrom(input.value); if (!t) { input.closest('label').check(); toast('That does not look like a mentor link.'); return; } await consentFlow(flow, { token: t, request, onDone: () => reload() }); }), flow);
      const urlToken = new URLSearchParams(location.search).get('token');
      if (urlToken && !s.membership) { input.value = urlToken; void consentFlow(flow, { token: urlToken, request, onDone: () => reload() }); }
      if (s.membership) myMentor(panels.mentor);
      return wrap;
    }
    async function myMentor(root) {
      const m = s.membership;
      root.append(el('h3', '', m.space_name), el('p', '', `Led by ${m.mentor_name ?? 'your mentor'}`));
      if (m.status === 'waitlist') root.append(el('p', '', 'You are on the waitlist. The mentor can let you in when a seat opens.'));
      if (m.status === 'paused') root.append(el('p', '', 'Coaching is paused because you are not sharing Level 1. Your mentor sees "Not sharing" and no data.'));
      root.append(el('strong', '', 'What your mentor can see'));
      const levels = [[1, 'Level 1: your process', 'Rules kept, journaling, streak and mistake tags. No prices, no account size. Required to be coached.', m.status !== 'paused'], [2, 'Level 2: results in R', 'Win rate, risk to reward and cumulative R.', m.level2], [3, 'Level 3: notes and trades', 'Symbol, setup and your written reasons.', m.level3]];
      for (const [level, title, text, on] of levels) {
        const c = check(`${title}. ${text}`, Boolean(on)); c.box.addEventListener('change', async () => {
          try { await act({ action: 'share', level, enabled: c.box.checked }); toast(c.box.checked ? 'Sharing turned on.' : 'Sharing turned off. Your mentor stops seeing it now.'); } catch (e) { c.box.checked = !c.box.checked; fail(e); }
        }); root.append(c);
      }
      root.append(el('p', 'mt-note', m.reconfirm_at ? `We will ask you again on ${when(m.reconfirm_at)}.` : 'Levels above 1 are asked again every 90 days.'));
      const actions = el('div', 'btn-row');
      actions.append(btn('Leave space', 'btn-secondary', async () => { if (confirm(`Leave ${m.space_name}? Your mentor stops seeing your data right away. Your journal stays yours.`)) { await act({ action: 'leave' }); toast('You left the space.'); } }));
      actions.append(btn('Report a problem', 'btn-secondary', async () => {
        const cats = ['Not teaching well', 'Not showing up', 'Asked for trades or signals', 'Asked for money outside Ledgerline', 'Pressure or rude behaviour', 'Something else'];
        const pick = prompt('What is the problem? Type the number:\n' + cats.map((c, i) => `${i + 1}. ${c}`).join('\n'));
        const category = cats[Number(pick) - 1]; if (!category) { toast('Choose what happened first.'); return; }
        await act({ action: 'report', category, details: prompt('What happened? (optional)') ?? '' }); toast('Report sent. A reviewer reads it. Your mentor will not see who sent it.');
      }));
      root.append(actions);
      const audit = el('div'); audit.style.display = 'grid'; audit.style.gap = '8px'; root.append(el('strong', '', 'Who looked at your data'), audit);
      try {
        const a = await request(path + '?view=audit', 'GET');
        if (!a.views.length) audit.append(el('p', 'mt-note', 'No one has looked yet.'));
        for (const v of a.views.slice(0, 10)) audit.append(el('p', 'mt-note', `${v.mentor} viewed your ${v.what === 'profile' ? 'profile' : 'summary'} on ${when(v.at)}`));
      } catch { audit.append(el('p', 'mt-note', 'The view log is unavailable right now.')); }
    }

    /* ---- mentor ---- */
    function mentorState() {
      const wrap = el('div'); wrap.style.display = 'grid'; wrap.style.gap = '16px';
      if (!s.checklist.space) { wrap.append(checklist()); return wrap; }
      if (s.space.status !== 'active') wrap.append(el('p', 'n-in mt-row', s.space.status === 'closing' ? `Your space is closed to new members and read-only until ${when(s.space.closing_until)}.` : 'Your mentor plan is not active, so your space is read-only. Members keep their journals.'));
      const tabs = el('div', 'mt-tabs'); tabs.setAttribute('role', 'tablist');
      const panels = { space: el('section', 'n-out ws-card mt-card'), members: el('section', 'n-out ws-card mt-card') };
      const labels = { space: 'My space', members: 'Members' }; let cur = 'space'; const bs = {};
      for (const k of Object.keys(panels)) {
        const b = el('button', 'btn btn-secondary', labels[k]); b.type = 'button'; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(k === cur));
        b.addEventListener('click', async () => { if (k === cur) return; bs[cur].setAttribute('aria-selected', 'false'); b.setAttribute('aria-selected', 'true'); const out = panels[cur]; cur = k; if (k === 'members') await members(panels.members); swapPanels(out, panels[k]); });
        bs[k] = b; tabs.append(b); panels[k].hidden = k !== cur;
      }
      wrap.append(tabs, panels.space, panels.members);
      void space(panels.space);
      return wrap;
    }
    function checklist() {
      const c = s.checklist; const box = el('section', 'n-out ws-card mt-card mt-rise'); box.append(el('h3', '', 'Three steps'));
      const steps = el('div', 'mt-steps');
      const step = (n, done, title, text, action) => {
        const r = el('div', 'n-in mt-step'); r.dataset.done = String(done);
        const l = el('div'); l.style.display = 'flex'; l.style.gap = '12px'; l.style.alignItems = 'center';
        const t = el('div'); t.append(el('strong', '', title), el('p', 'mt-note', text)); l.append(el('span', 'mt-mark', done ? '✓' : String(n)), t); r.append(l);
        if (action && !done) r.append(action); steps.append(r); return r;
      };
      const link = (text, href, primary) => { const a = el('a', 'btn ' + (primary ? 'btn-primary' : 'btn-secondary'), text); a.href = href; return a; };
      const status = s.verification;
      step(1, c.verified, 'Get verified', status === 'pending' ? 'Application in review. We read every application ourselves, usually within 2 working days.' : status === 'rejected' ? 'Your last application was not approved. You can read the reason and reapply after 14 days.' : 'We check this once, by hand, before you can create a space.', link(status === 'none' || status === 'draft' ? 'Start verification' : 'Open application', '/mentor-verification', !c.verified));
      step(2, c.plan, 'Activate your mentor plan', c.verified ? 'Your mentor plan unlocks your space and every mentor tool. Students never pay to join you.' : 'Unlocks after you are verified.', c.verified ? link('See plans', '/billing', true) : null);
      const third = step(3, c.space, 'Create your space', c.verified && c.plan ? 'You lead it, you approve how students join, and you see how each student grows.' : 'Unlocks after steps 1 and 2.');
      if (c.verified && c.plan) {
        const form = el('form', 'ws-form'); form.noValidate = true; form.style.width = '100%'; form.style.display = 'grid'; form.style.gap = '12px';
        const name = el('input'); name.maxLength = 60; const about = el('textarea'); about.maxLength = 400; about.rows = 3;
        const focus = el('input'); focus.maxLength = 100; const lim = el('input'); lim.type = 'number'; lim.min = 1; lim.max = 50; lim.value = 30;
        const f1 = field('Space name', name, true), f2 = field('About', about, true);
        form.append(f1, f2, field('Focus', focus), field('Member limit', lim));
        const go = btn('Create space', 'btn-primary', async () => {
          const ok = [f1.check(), f2.check()].every(Boolean); if (!ok) { (f1.dataset.invalid === 'true' ? name : about).focus(); return; }
          await act({ action: 'create_space', name: name.value, about: about.value, focus: focus.value, member_limit: Number(lim.value) }); toast('Space created.');
        });
        form.append(go); third.after(form);
      }
      box.append(steps); return box;
    }
    async function space(root) {
      root.replaceChildren(el('h3', '', s.space.name), el('p', '', s.space.focus || 'Your mentor space'));
      const writable = s.space.status === 'active';
      const hasLinks = el('div'); hasLinks.style.display = 'grid'; hasLinks.style.gap = '10px';
      root.append(el('h3', '', 'Personal links'), el('p', 'mt-note', 'Make one link per student. The first Ledgerline account that opens it claims it. If it is forwarded, the second person sees "This link has already been used". It expires in 7 days if nobody opens it.'));
      if (writable) {
        const label = el('input'); label.placeholder = 'Student name'; const email = el('input'); email.type = 'email'; email.placeholder = 'Email (optional lock)';
        const out = el('div'); out.style.display = 'grid'; out.style.gap = '8px';
        const row = el('div', 'mt-grid'); row.append(field('Name', label), field('Email lock', email));
        root.append(row, btn('Make a personal link', 'btn-primary', async () => { const r = await request(path, 'POST', { action: 'create_link', kind: 'personal', label: label.value, email: email.value }); label.value = email.value = ''; showNewLink(out, r); await refreshLinks(); }), out);
        root.append(el('h3', '', 'Open-seat link (optional)'), el('p', 'mt-note', 'For a workshop or a new batch. It expires and has a seat limit. A new one kills the old one at once.'));
        const days = el('select'); for (const d of [7, 14, 30]) { const o = el('option', '', d + ' days'); o.value = d; days.append(o); }
        const seats = el('select'); for (const n of [5, 10, 25]) { const o = el('option', '', n + ' seats'); o.value = n; seats.append(o); }
        const r2 = el('div', 'mt-grid'); r2.append(field('Expires after', days), field('Seat limit', seats));
        const out2 = el('div'); root.append(r2, btn('Make an open-seat link', 'btn-secondary', async () => { const r = await request(path, 'POST', { action: 'create_link', kind: 'open', expires_days: Number(days.value), seat_limit: Number(seats.value) }); showNewLink(out2, r); await refreshLinks(); }), out2);
        root.append(btn(s.space.links_paused ? 'Resume all links' : 'Pause all links', 'btn-secondary', async () => { await act({ action: 'pause_links', paused: !s.space.links_paused }); toast(s.space.links_paused ? 'All links paused. Members stay.' : 'Links are working again.'); }));
      }
      root.append(el('h3', '', 'Your links'), hasLinks);
      async function refreshLinks() {
        const d = await request(path + '?view=dashboard', 'GET');
        hasLinks.replaceChildren();
        if (!d.links?.length) hasLinks.append(el('p', 'mt-note', 'No links yet. Make your first personal link above.'));
        for (const l of d.links ?? []) {
          const row = el('div', 'n-in mt-row'); const t = el('div');
          const state = l.revoked ? 'Stopped' : new Date(l.expires_at) < new Date() ? 'Expired' : l.claimed ? `Claimed ${l.claimed_at ? when(l.claimed_at) : ''}` : l.kind === 'open' ? `${l.uses} of ${l.seat_limit} seats used` : 'Waiting to be opened';
          t.append(el('strong', '', (l.kind === 'open' ? 'Open: ' : '') + l.label), el('small', '', ' ' + state + (l.email_locked ? ' · email locked' : '') + ' · expires ' + when(l.expires_at))); row.append(t);
          if (writable && !l.revoked && !l.claimed) {
            const bt = el('div', 'btn-row');
            if (l.kind === 'personal') bt.append(btn('Make a new link', 'btn-secondary', async () => { const r = await request(path, 'POST', { action: 'resend_link', id: l.id }); showNewLink(out2Holder(), r); await refreshLinks(); }));
            bt.append(btn('Stop link', 'btn-secondary', async () => { await request(path, 'POST', { action: 'revoke_link', id: l.id }); await refreshLinks(); }));
            row.append(bt);
          }
          hasLinks.append(row);
        }
      }
      const holder = el('div'); root.append(holder); const out2Holder = () => holder;
      function showNewLink(out, r) {
        const url = location.origin + r.path;
        out.replaceChildren(el('p', 'mt-note', 'Copy it now. For safety the link is shown only once.'));
        const row = el('div', 'n-in mt-row'); row.append(el('small', '', url)); row.append(btn('Copy link', 'btn-primary', () => copyText(url))); out.append(row);
      }
      try { await refreshLinks(); } catch (e) { hasLinks.append(el('p', 'mt-msg', e.message)); }
    }
    async function members(root) {
      root.replaceChildren(el('h3', '', 'Members'));
      let d; try { d = await request(path + '?view=dashboard', 'GET'); } catch (e) { root.append(el('p', 'mt-msg', e.message)); return; }
      if (d.frozen) { root.append(el('p', '', 'Your space is read-only, so student data is hidden.')); return; }
      const t = d.totals; const grid = el('div', 'mt-grid');
      for (const [k, v] of [['Students', t.students], ['New this week', t.new_this_week], ['Waitlist', t.waitlist], ['Gone quiet', t.quiet]]) { const c = el('div', 'n-in mt-stat'); c.append(el('small', '', k), el('strong', '', String(v))); grid.append(c); }
      root.append(grid);
      if (!d.students.length) { root.append(el('p', 'mt-note', 'No students yet. Make a personal link in My space and send it to your first student.')); return; }
      for (const st of d.students) {
        const row = el('div', 'n-in mt-row'); const info = el('div');
        info.append(el('strong', '', st.name));
        const sx = st.stats;
        if (st.status === 'waitlist') info.append(el('small', '', ' On the waitlist'));
        else if (sx === 'not_sharing') info.append(el('small', '', ' Not sharing'));
        else if (sx === 'pro_ended') info.append(el('small', '', ' Pro ended. No data is shown.'));
        else if (sx) {
          const r = typeof sx.rules_followed_pct === 'number' ? sx.rules_followed_pct + '%' : 'Not enough data';
          info.append(el('small', '', ` Rules kept ${r} · Journaled ${sx.journal_days_30} of 30 days · Streak ${sx.streak.current}`));
          info.append(el('small', '', ` · Results ${sx.results === 'not_shared' ? 'Not shared' : sx.results === 'not_enough_data' ? 'Not enough data' : `win ${sx.results.win_rate_pct}%, avg ${sx.results.avg_r}R`}`));
          if (sx.mistakes_30d.length) info.append(el('small', '', ` · Top mistake: ${sx.mistakes_30d[0].kind}`));
        }
        row.append(info);
        const bt = el('div', 'btn-row');
        if (st.status === 'waitlist') bt.append(btn('Let in', 'btn-primary', async () => { await request(path, 'POST', { action: 'let_in', membership_id: st.id }); toast('Let in.'); await members(root); }));
        if (st.remove_after) bt.append(el('small', '', 'Removal on ' + when(st.remove_after)));
        else bt.append(btn('Remove', 'btn-secondary', async () => { const reason = prompt('Why are you removing this student? They get 7 days notice.'); if (!reason?.trim()) { toast('Choose a reason first.'); return; } await request(path, 'POST', { action: 'remove', membership_id: st.id, reason }); toast('The student has been told.'); await members(root); }));
        row.append(bt); root.append(row);
      }
      root.append(el('p', 'mt-note', 'Everything you see is only what each student chose to share, and every view is logged where the student can read it. Win rate and risk to reward are for coaching only.'));
    }

    function render() {
      header(); body.replaceChildren();
      const view = s.role === 'none' ? noneState() : s.role === 'student' ? studentState() : mentorState();
      body.append(view); popIn(view);
    }
    render();
  },
};

/** The page a link opens: /mentor/join?token=... */
export const mentorJoinPage = {
  title: 'Join a mentor',
  description: 'Review what you will share, then join.',
  endpoint: path,
  content: '<section class="n-out ws-card mt-card" data-join></section>',
  bind(page, { data, request }) {
    const root = page.querySelector('[data-join]');
    const token = new URLSearchParams(location.search).get('token') ?? '';
    const go = async () => {
      if (data.role === 'mentor') { root.replaceChildren(el('h3', '', 'You are a mentor'), el('p', '', 'A user cannot be a student and a mentor at once. Change your role first.')); return; }
      if (data.role === 'none') await request(path, 'POST', { action: 'choose_role', role: 'student' });
      await consentFlow(root, { token, request, onDone: () => { location.href = '/mentorship'; } });
    };
    void go().catch((e) => root.replaceChildren(el('p', 'mt-msg', e.message)));
  },
};
