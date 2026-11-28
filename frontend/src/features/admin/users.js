// Every registered account: search, filter by plan, open one to see it and use the admin controls.
import { node, button } from '../../pages/workspace-ui.js';
import { when, day, pill, primary, field, input, select, table, cellWith, chips, pager } from './ui.js';

const path = '/api/admin-users';
const usd = (cents) => '$' + (Number(cents) / 100).toFixed(2);

export const usersPage = {
  title: 'Users', description: 'Every account that has registered. Filter by plan and open one for the controls.', endpoint: path,
  content: '<section class="n-out ws-card ws-stack" data-admin-users></section>',
  bind(page, { data, request }) {
    const root = page.querySelector('[data-admin-users]');
    const status = node('p'); status.setAttribute('role', 'status');
    const state = { q: new URLSearchParams(location.search).get('q') ?? '', plan: new URLSearchParams(location.search).get('plan') ?? '', page: 1 };
    const fail = (error) => { status.textContent = error.message || 'Something went wrong.'; };

    async function list() {
      data = await request(path + '?' + new URLSearchParams({ q: state.q, plan: state.plan, page: String(state.page) }), 'GET');
      const c = data.counts;
      const search = input({ type: 'search', placeholder: 'Name, email or account id', value: state.q, maxLength: 100 });
      search.setAttribute('aria-label', 'Search users');
      const go = () => { state.q = search.value.trim(); state.page = 1; list().catch(fail); };
      search.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      const bar = node('div', '', 'ad-bar'); bar.append(search, primary('Search', go));
      const rows = data.items.map((u) => [
        cellWith(Object.assign(node('button', u.name || '(no name yet)', 'ad-open'), { type: 'button', onclick: () => open(u.uid).catch(fail) }), u.email ?? 'email unavailable'),
        pill(u.plan, u.plan), day(u.createdAt), u.lastSignIn ? day(u.lastSignIn) : '—',
        u.disabled ? pill('Suspended', 'bad') : u.onboarded ? pill('Active') : pill('Not set up'),
      ]);
      root.replaceChildren(
        chips([['', `All (${c.all})`], ['free', `Free (${c.free})`], ['pro', `Pro (${c.pro})`], ['mentor', `Mentor (${c.mentor})`]], state.plan, (v) => { state.plan = v; state.page = 1; list().catch(fail); }),
        bar, rows.length ? table(['Account', 'Plan', 'Joined', 'Last sign-in', 'Status'], rows) : node('p', 'No accounts match.', 'ws-empty'),
        pager(data, (n) => { state.page = n; list().catch(fail); }), status);
    }

    async function open(uid) {
      const d = await request(path + '?uid=' + encodeURIComponent(uid), 'GET');
      const a = d.account;
      const act = async (body, ask) => {
        if (ask && !confirm(ask)) return;
        try { await request(path, 'POST', { uid, ...body }); status.textContent = 'Saved.'; await open(uid); status.textContent = 'Saved.'; } catch (e) { status.textContent = e.message; }
      };
      const kv = (pairs) => { const dl = node('dl', '', 'ad-kv'); for (const [k, v] of pairs) dl.append(node('dt', k), node('dd', v ?? '—')); return dl; };

      const account = node('div', '', 'ad-panel'); account.append(node('h3', 'Account'), kv([
        ['Name', a.name], ['Email', a.email], ['Account id', a.uid], ['Joined', when(a.createdAt)], ['Last sign-in', when(a.lastSignIn)],
        ['Email verified', a.verified == null ? '—' : a.verified ? 'Yes' : 'No'], ['Sign-up finished', a.onboarded ? 'Yes' : 'No'], ['Status', a.disabled ? 'Suspended' : 'Active']]));
      const use = node('div', '', 'ad-panel'); use.append(node('h3', 'Usage'), kv([
        ['Trades logged', String(d.stats.trades)], ['Support tickets', String(d.stats.tickets)], ['MetaTrader links', String(d.stats.mt_links)], ['AI runs this month', String(d.stats.ai_runs_month)],
        ['Mentor application', d.mentor ? d.mentor.status : 'None']]));

      const plan = node('div', '', 'ad-panel');
      plan.append(node('h3', 'Plan'), kv([['Current plan', d.plan.plan], ['Pro runs to', d.plan.proUntil ? when(d.plan.proUntil) : '—'], ['Mentor runs to', d.plan.mentorUntil ? when(d.plan.mentorUntil) : (d.plan.plan === 'mentor' ? 'No end date' : '—')]]));
      const which = select([['pro', 'Pro'], ['mentor', 'Mentor']], 'pro'), days = input({ type: 'number', min: 1, max: 366, value: 30 }), why = input({ type: 'text', maxLength: 300, placeholder: 'Reason (kept in the audit log)' });
      const form = node('div', '', 'ad-form');
      form.append(field('Give plan', which), field('Days', days), field('Reason', why),
        primary('Give plan', () => act({ action: 'grant', plan: which.value, days: Number(days.value), reason: why.value }, `Give ${which.value} for ${days.value} days?`)),
        button('End paid plan now', () => act({ action: 'end_plan', reason: why.value }, 'End this account’s paid plan right now, with no grace period? This does not refund anything.')));
      plan.append(form, node('small', 'Giving a plan adds days to whatever is left. Ending one does not refund; use Billing for refunds.'));

      const access = node('div', '', 'ad-panel'); access.append(node('h3', 'Sign-in access'));
      const why2 = input({ type: 'text', maxLength: 300, placeholder: 'Reason (kept in the audit log)' });
      access.append(field('Reason', why2), a.disabled
        ? button('Allow sign-in again', () => act({ action: 'unsuspend', reason: why2.value }, 'Let this account sign in again?'))
        : button('Suspend account', () => act({ action: 'suspend', reason: why2.value }, 'Suspend this account? It cannot sign in, and changes it makes stop straight away.')),
        node('small', 'Suspending uses Firebase: the account cannot sign in or refresh, and open sessions stop writing at once. Pages already open can read for up to an hour.'));

      const orders = node('div', '', 'ad-panel'); orders.append(node('h3', 'Recent orders'));
      orders.append(d.orders.length ? table(['Date', 'Plan', 'Months', 'Price', 'State'], d.orders.map((o) => [day(o.created_at), o.plan ?? '—', String(o.months ?? '—'), usd(o.price_usd_cents), o.payment_state])) : node('p', 'No orders.', 'ws-empty'));
      const billing = node('a', 'Open Billing', 'btn btn-secondary'); billing.href = '/admin/billing'; orders.append(billing);

      const notes = node('div', '', 'ad-panel'); notes.append(node('h3', 'Private notes'));
      for (const n of d.notes) { const item = node('div', '', 'ad-note'); item.append(node('span', n.body), node('small', when(n.created_at))); notes.append(item); }
      const box = node('textarea', '', 'n-in'); box.maxLength = 1000; box.placeholder = 'Add a note only you can see'; box.setAttribute('aria-label', 'New note');
      notes.append(box, primary('Save note', () => { if (!box.value.trim()) { status.textContent = 'Write the note first.'; return; } act({ action: 'note', body: box.value }); }));

      const grid = node('div', '', 'ad-grid'); grid.append(account, use, plan, access, orders, notes);
      root.replaceChildren(button('Back to users', () => list().catch(fail)), node('h2', a.name || a.email || a.uid), grid, status);
    }

    list().catch(fail);
  },
};
