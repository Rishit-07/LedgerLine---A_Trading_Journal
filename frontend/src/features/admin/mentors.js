// Mentor verification: the queue, and for each applicant the live camera photo, the documents they uploaded, links and details.
import { node, button } from '../../pages/workspace-ui.js';
import { fields, validLink } from '../../../../src/config/mentor-form.js';
import { when, day, pill, table, cellWith, chips } from './ui.js';

const path = '/api/mentor-review';
const FILTERS = [['pending', 'Pending'], ['needs_info', 'More info asked'], ['approved', 'Approved'], ['rejected', 'Rejected'], ['revoked', 'Revoked']];
const kindLabel = { certificate: 'Certificate', id: 'ID document', other: 'Other document' };

export const mentorsPage = {
  title: 'Mentor verification', description: 'Check what each applicant uploaded, including the live camera photo, then decide.', endpoint: path,
  content: '<section class="n-out ws-card ws-stack" data-reviewer></section>',
  bind(page, { data, request }) {
    const root = page.querySelector('[data-reviewer]');
    const msg = node('p'); msg.setAttribute('role', 'status');
    const fail = (e) => { msg.textContent = e.message || 'Something went wrong.'; };
    let filter = 'pending';
    const lightbox = node('dialog', '', 'ad-lightbox'); const big = node('img'); big.alt = 'Enlarged upload';
    const closeBtn = button('Close', () => lightbox.close()); lightbox.append(big, closeBtn); page.append(lightbox);
    const zoom = (src) => { big.src = src; lightbox.showModal(); };

    async function queue() {
      data = await request(path + '?status=' + filter, 'GET');
      const c = data.counts ?? {};
      const bar = chips(FILTERS.map(([v, l]) => [v, `${l} (${c[v] ?? 0})`]), filter, (v) => { filter = v; queue().catch(fail); });
      const rows = data.items.map((r) => [
        cellWith(Object.assign(node('button', r.display_name || r.full_name || 'Mentor', 'ad-open'), { type: 'button', onclick: () => open(r.id).catch(fail) }), r.email),
        pill(r.status.replace('_', ' '), r.status), day(r.submitted_at),
        `${r.has_live_photo ? 'Live photo' : 'No live photo'} · ${r.documents} document${r.documents === 1 ? '' : 's'}`,
        r.next_review_at && Date.parse(r.next_review_at) <= Date.now() ? pill('Review due', 'bad') : '—',
      ]);
      root.replaceChildren(bar, rows.length ? table(['Applicant', 'Status', 'Submitted', 'Proof', 'Renewal'], rows) : node('p', 'No applications here.', 'ws-empty'), msg);
    }

    async function open(id) {
      const { record: r, events, reports } = await request(path + '?id=' + encodeURIComponent(id), 'GET');
      const proof = node('div', '', 'ad-proof');
      const shot = (b64, caption) => { const f = node('figure'), im = node('img'); im.src = 'data:image/jpeg;base64,' + b64; im.alt = caption; im.addEventListener('click', () => zoom(im.src)); f.append(im, node('figcaption', caption)); proof.append(f); };
      if (r.live_photo) shot(r.live_photo, 'Live camera photo' + (r.live_photo_at ? ' · taken ' + when(r.live_photo_at) : '')); else proof.append(node('p', 'No live camera photo was submitted.', 'ws-empty'));
      if (r.photo) shot(r.photo, 'Profile photo (shown to students)');
      for (const d of r.documents ?? []) shot(d.image, `${kindLabel[d.kind] ?? 'Document'}${d.label ? ' · ' + d.label : ''} · ${when(d.created_at)}`);
      if (!(r.documents ?? []).length) proof.append(node('p', 'No documents were uploaded.', 'ws-empty'));

      const details = node('div', '', 'ad-panel'); details.append(node('h3', 'Application'));
      const dl = node('dl', '', 'ad-kv');
      for (const [k, label, type] of fields.flat()) {
        const v = r[k]; if (v == null || v === '') continue;
        dl.append(node('dt', label));
        const dd = node('dd');
        if (type === 'url' || type === 'links') { for (const url of [].concat(v)) { if (!validLink(url)) continue; const a = node('a', url); a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer'; dd.append(a, ' '); } }
        else dd.append(Array.isArray(v) ? v.join(', ') : typeof v === 'boolean' ? (v ? 'Yes' : 'No') : String(v));
        dl.append(dd);
      }
      dl.append(node('dt', 'Terms'), node('dd', `${r.terms_version ?? '—'} · code ${r.conduct_version ?? '—'}`));
      details.append(dl);

      const history = node('div', '', 'ad-panel'); history.append(node('h3', 'Review history'));
      if (!events.length && !reports.length) history.append(node('p', 'No history yet.', 'ws-empty'));
      for (const ev of events) history.append(node('p', `${when(ev.created_at)} · ${ev.action} ${ev.reason ?? ''}`));
      for (const t of reports) history.append(node('p', 'Student report · ' + t.reason));

      const reason = node('textarea', '', 'n-in'); reason.maxLength = 600; reason.placeholder = 'Reason or follow-up question (the applicant sees this)'; reason.setAttribute('aria-label', 'Reason');
      const actions = node('div', '', 'btn-row');
      const choices = r.status === 'approved' ? [['approved', 'Renew verification'], ['revoked', 'Revoke badge']] : r.status === 'pending' ? [['approved', 'Approve'], ['needs_info', 'Ask for more information'], ['rejected', 'Reject']] : [];
      for (const [action, label] of choices) actions.append(button(label, async () => {
        if (action !== 'approved' && !reason.value.trim()) { msg.textContent = 'Enter your reason or question.'; return; }
        if (!confirm(label + ' for this applicant?')) return;
        try { await request(path, 'POST', { id, action, reason: reason.value }); await queue(); msg.textContent = 'Decision saved.'; } catch (e) { fail(e); }
      }));
      const decide = node('div', '', 'ad-panel'); decide.append(node('h3', 'Decision'), choices.length ? reason : node('p', 'This application is ' + r.status.replace('_', ' ') + '. No decision is open.'), actions);

      const grid = node('div', '', 'ad-grid'); grid.append(details, history, decide);
      root.replaceChildren(button('Back to queue', () => queue().catch(fail)), node('h2', r.display_name || 'Mentor application'), node('p', `${r.full_name ?? ''} · ${r.email ?? ''}`),
        node('h3', 'What they uploaded'), node('p', 'Opening this record is written to the audit log.'), proof, grid, msg);
    }
    queue().catch(fail);
  },
};
