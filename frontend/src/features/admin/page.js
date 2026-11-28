// Operator home: what needs attention now (most urgent first), a few numbers, and every admin tool. Reviewer only.
import { node } from '../../pages/workspace-ui.js';
import './page.css';

const number = new Intl.NumberFormat('en-IN');
const levelLabel = { urgent: 'Urgent', normal: 'To do', info: 'For your information' };

function link(title, detail, href, className = 'btn btn-secondary') {
  const item = node('a', '', className + ' ad-link');
  item.href = href;
  item.append(node('strong', title), node('small', detail));
  return item;
}

export const adminPage = {
  title: 'Admin',
  description: 'What needs you now, and every admin tool. Reviewer only.',
  endpoint: '/api/admin',
  content: '<section class="n-out ws-card ws-stack" data-admin-home></section>',
  bind(page, { data }) {
    const root = page.querySelector('[data-admin-home]');
    root.append(node('h2', 'Needs you now'));
    if (!data.attention.length) root.append(node('p', 'Nothing needs you right now.', 'ws-empty'));
    const list = node('div', '', 'ad-list');
    for (const item of data.attention) {
      const row = link(item.title, item.detail, item.href);
      row.dataset.level = item.level;
      row.prepend(node('span', levelLabel[item.level] ?? '', 'ad-level'));
      list.append(row);
    }
    root.append(list);

    root.append(node('h3', 'Admin tools'));
    const tools = node('div', '', 'ad-list');
    for (const tool of data.tools) tools.append(link(tool.title, tool.detail, tool.href));
    root.append(tools);

    root.append(node('h3', 'The platform'));
    const s = data.stats;
    const grid = node('div', '', 'ws-stats');
    for (const [label, value, detail] of [
      ['Accounts', s.users, `${s.new_7d} new this week`],
      ['Finished sign-up', s.onboarded, 'Completed the first-run steps'],
      ['Trades logged', s.trades_7d, 'In the last 7 days'],
      ['Paid plans active', s.paid_now, `${s.mentors_now} with a Mentor space`],
      ['MetaTrader connected', s.mt_connected, 'Seen in the last 10 minutes'],
      ['AI reviews', s.ai_runs_month, 'Replay and habit runs this month'],
      ['Newsletter', s.subscribers, 'Confirmed subscribers'],
    ]) {
      const cell = node('div', '', 'n-in ws-stat');
      cell.append(node('span', label), node('strong', number.format(value)), node('small', detail));
      grid.append(cell);
    }
    root.append(grid);
  },
};
