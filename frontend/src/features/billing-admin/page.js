// Operator billing panel (reviewer only). Everything is built with textContent, so nothing a customer typed can run as markup.
import { node, button } from '../../pages/workspace-ui.js';
import './page.css';

const path = '/api/billing-admin';
const when = (value) => (value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
const usd = (cents) => '$' + (Number(cents) / 100).toFixed(2);
const reasonLabel = { duplicate_payment: 'Paid twice', wrong_amount: 'Wrong amount', service_problem: 'Service problem', goodwill: 'Goodwill', other: 'Other' };
const stateLabel = { paid: 'Paid', waiting: 'Waiting', confirming: 'Confirming', underpaid: 'Underpaid', overpaid: 'Overpaid', expired: 'Expired', failed: 'Failed', cancelled: 'Cancelled', needs_review: 'Needs review' };

function field(label, control) {
  const wrap = node('label', '', 'ws-field');
  wrap.append(node('span', label), control);
  return wrap;
}
function input(attrs = {}) {
  const item = node('input', '', 'n-in');
  Object.assign(item, attrs);
  return item;
}
function primary(text, handler) {
  const item = node('button', text, 'btn btn-primary');
  item.type = 'button';
  item.addEventListener('click', handler);
  return item;
}

export const billingAdminPage = {
  title: 'Billing admin',
  description: 'Payments, refunds and orders that need a look. Reviewer only.',
  endpoint: path,
  content: '<section class="n-out ws-card ws-stack" data-billing-admin></section>',
  bind(page, { data, request }) {
    const root = page.querySelector('[data-billing-admin]');
    const status = node('p');
    status.setAttribute('role', 'status');
    let query = '';
    const asked = new URLSearchParams(location.search).get('filter');
    let filter = ['paid', 'review', 'refunded'].includes(asked) ? asked : 'all';
    const fail = (error) => { status.textContent = error.message || 'Something went wrong.'; };

    async function list() {
      data = await request(path + '?' + new URLSearchParams({ q: query, filter }), 'GET');
      const home = node('a', 'Admin home', 'btn btn-secondary');
      home.href = '/admin';
      root.replaceChildren(home, node('h2', 'Billing admin'));
      const t = data.totals;
      const stats = node('div', '', 'ws-stats');
      for (const [label, value, detail] of [
        ['Paid, last 30 days', String(t.paid_30d), usd(t.paid_30d_cents)],
        ['Needs review', String(t.needs_review), 'Orders to check by hand'],
        ['Refunds owed', String(t.refunds_owed), usd(t.refunds_owed_cents)],
      ]) {
        const item = node('div', '', 'n-in ws-stat');
        item.append(node('span', label), node('strong', value), node('small', detail));
        stats.append(item);
      }
      root.append(stats);

      const search = input({ type: 'search', placeholder: 'Email, order id or account id', value: query, maxLength: 80 });
      search.setAttribute('aria-label', 'Search payments');
      const go = () => { query = search.value.trim(); list().catch(fail); };
      search.addEventListener('keydown', (event) => { if (event.key === 'Enter') go(); });
      const bar = node('div', '', 'btn-row');
      for (const [value, label] of [['all', 'All'], ['paid', 'Paid'], ['review', 'Needs review'], ['refunded', 'Refunded']]) {
        const b = button(label, () => { filter = value; list().catch(fail); });
        if (filter === value) b.setAttribute('aria-pressed', 'true');
        bar.append(b);
      }
      root.append(search, primary('Search', go), bar);

      if (!data.payments.length) root.append(node('p', 'No payments match.', 'ws-empty'));
      for (const p of data.payments) {
        const line = `${when(p.created_at)} · ${p.email ?? p.user_id} · ${p.plan} ${p.months}m · ${usd(p.price_usd_cents)} · ${stateLabel[p.payment_state] ?? p.payment_state}`
          + (p.needs_review ? ' · needs review' : '') + (p.refunded_cents ? ` · refunded ${usd(p.refunded_cents)}` : '');
        root.append(button(line, () => open(p.id).catch(fail)));
      }

      const owed = data.refunds.filter((r) => r.status === 'owed');
      root.append(node('h3', `Refunds owed (${owed.length})`));
      if (!owed.length) root.append(node('p', 'Nothing owed.', 'ws-empty'));
      for (const r of owed) root.append(button(`${usd(r.amount_usd_cents)} · ${r.email ?? ''} · ${reasonLabel[r.reason]} · ${r.refund_to ? 'address on file' : 'needs a wallet address'}`, () => open(r.checkout_id).catch(fail)));
      root.append(status);
    }

    async function open(id) {
      const { order, events, refunds } = await request(path + '?order=' + encodeURIComponent(id), 'GET');
      root.replaceChildren(button('Back to payments', () => list().catch(fail)), node('h2', `${order.plan} ${order.months}m · ${usd(order.price_usd_cents)}`));
      root.append(node('p', `${order.email ?? order.user_id} · ${stateLabel[order.payment_state] ?? order.payment_state} · opened ${when(order.created_at)} · access to ${when(order.paid_until)}`));
      root.append(node('p', 'Order ' + order.id, 'ws-empty'));

      if (order.needs_review) {
        const box = node('div', '', 'n-in ws-stat');
        box.append(node('strong', 'This order needs a decision'), node('small', order.review_note ?? 'No note.'));
        const row = node('div', '', 'btn-row');
        const decide = (action) => async () => {
          try { await request('/api/billing/needs-review', 'POST', { id: order.id, action }); await open(order.id); } catch (error) { fail(error); }
        };
        row.append(primary('Credit the plan', decide('credit')), button('Dismiss', decide('dismiss')));
        box.append(row);
        root.append(box);
      }

      root.append(node('h3', 'History'));
      for (const e of events) root.append(node('p', `${when(e.at)} · ${e.source} · ${e.state}${e.note ? ' · ' + e.note : ''}`));

      root.append(node('h3', 'Refunds'));
      if (!refunds.length) root.append(node('p', 'No refunds on this order.', 'ws-empty'));
      for (const r of refunds) {
        const box = node('div', '', 'n-in ws-stat');
        box.append(node('strong', `${usd(r.amount_usd_cents)} · ${reasonLabel[r.reason]} · ${r.status}`),
          node('small', `${when(r.created_at)}${r.ends_access ? ' · ended the access' : ''}${r.note ? ' · ' + r.note : ''}`),
          node('small', r.refund_to ? 'Send to: ' + r.refund_to : 'No wallet address yet. Ask the customer through support.'));
        if (r.status === 'sent') box.append(node('small', `Sent ${when(r.sent_at)} · ref ${r.tx_ref}`));
        if (r.status === 'owed') {
          const ref = input({ placeholder: 'Transaction reference (hash) of what you sent', maxLength: 200 });
          ref.setAttribute('aria-label', 'Transaction reference');
          const row = node('div', '', 'btn-row');
          row.append(primary('Mark as sent', async () => { try { await request(path, 'POST', { action: 'refund_sent', refundId: r.id, txRef: ref.value }); await open(order.id); } catch (error) { fail(error); } }));
          if (!r.ends_access) row.append(button('Cancel refund', async () => { try { await request(path, 'POST', { action: 'refund_cancel', refundId: r.id }); await open(order.id); } catch (error) { fail(error); } }));
          box.append(ref, row);
        }
        root.append(box);
      }

      if (order.payment_state === 'paid') {
        const spent = refunds.filter((r) => r.status !== 'cancelled').reduce((sum, r) => sum + r.amount_usd_cents, 0);
        const left = order.price_usd_cents - spent;
        if (left > 0) {
          root.append(node('h3', 'Record a refund'));
          root.append(node('p', 'Crypto cannot be reversed from here. This records what you owe; you send the coins from your own wallet, then mark it sent.', 'ws-empty'));
          const requestId = crypto.randomUUID();
          const amount = input({ type: 'number', min: '0.01', max: (left / 100).toFixed(2), step: '0.01', value: (left / 100).toFixed(2) });
          const reason = node('select', '', 'n-in');
          for (const [value, label] of Object.entries(reasonLabel)) { const o = node('option', label); o.value = value; reason.append(o); }
          const to = input({ placeholder: 'Wallet address the customer gave you (optional now)', maxLength: 200 });
          const note = input({ placeholder: 'Note for your records (optional)', maxLength: 500 });
          const ends = input({ type: 'checkbox' });
          const endsLabel = node('label', '', 'ws-field');
          endsLabel.append(ends, node('span', ' End the access this payment gave (full refund only)'));
          root.append(field('Amount (US dollars)', amount), field('Reason', reason), field('Refund address', to),
            node('small', 'A public address only. Never paste a recovery phrase or private key anywhere.'), field('Note', note), endsLabel);
          root.append(primary('Record refund', async () => {
            try {
              await request(path, 'POST', { action: 'refund', checkoutId: order.id, amountUsd: Number(amount.value), reason: reason.value, refundTo: to.value, note: note.value, endsAccess: ends.checked, requestId });
              await open(order.id);
            } catch (error) { fail(error); }
          }));
        }
      }
      root.append(status);
    }

    list().catch(fail);
    void data;
  },
};
