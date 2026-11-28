// The append-only record of everything done in the admin role.
import { node } from '../../pages/workspace-ui.js';
import { when, input, primary, table, chips, pager } from './ui.js';

const path = '/api/admin-audit';
const KINDS = [['', 'All'], ['user_', 'Users'], ['mentor_', 'Mentors'], ['ticket_', 'Tickets'], ['billing_', 'Billing'], ['newsletter_', 'Newsletter']];

export const auditPage = {
  title: 'Audit log', description: 'Every action taken in the admin role. Entries cannot be edited or removed.', endpoint: path,
  content: '<section class="n-out ws-card ws-stack" data-admin-audit></section>',
  bind(page, { request }) {
    const root = page.querySelector('[data-admin-audit]');
    const status = node('p'); status.setAttribute('role', 'status');
    const state = { kind: '', q: '', page: 1 };
    async function list() {
      const data = await request(path + '?' + new URLSearchParams({ kind: state.kind, q: state.q, page: String(state.page) }), 'GET');
      const search = input({ type: 'search', placeholder: 'Target, such as an account id', value: state.q, maxLength: 80 });
      search.setAttribute('aria-label', 'Search the audit log');
      const go = () => { state.q = search.value.trim(); state.page = 1; list().catch(fail); };
      search.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      const bar = node('div', '', 'ad-bar'); bar.append(search, primary('Search', go));
      const rows = data.items.map((r) => [when(r.created_at), r.action, r.target, Object.entries(r.detail ?? {}).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ') || '—', r.actor_id]);
      root.replaceChildren(chips(KINDS, state.kind, (v) => { state.kind = v; state.page = 1; list().catch(fail); }), bar,
        rows.length ? table(['When', 'Action', 'Target', 'Detail', 'By'], rows) : node('p', 'Nothing logged yet.', 'ws-empty'),
        pager(data, (n) => { state.page = n; list().catch(fail); }), status);
    }
    const fail = (e) => { status.textContent = e.message || 'Something went wrong.'; };
    list().catch(fail);
  },
};
