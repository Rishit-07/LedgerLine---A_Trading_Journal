import { node, button } from '../../pages/workspace-ui.js';
import './newsletter.css';

const path = '/api/newsletter-admin';
const TOPICS = ['Market wrap', 'Process lessons', 'Journal and sizing tips', 'Product updates'];
const when = (v) => (v ? new Date(v).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '');
const el = (tag, className, text) => node(tag, text ?? '', className);

export const newsletterAdminPage = {
  title: 'Newsletter', description: 'Write, preview, test and schedule issues.', endpoint: path,
  content: '<section class="n-out ws-card ws-stack nl-admin" data-nl-admin></section>',
  bind(page, { data, request }) {
    const root = page.querySelector('[data-nl-admin]');
    const msg = el('p', 'nl-status'); msg.setAttribute('role', 'status');
    const say = (e) => { msg.textContent = e.message ?? String(e); };
    async function list() {
      data = await request(path, 'GET');
      root.replaceChildren(el('h2', '', 'Newsletter issues'));
      const c = data.counts ?? {};
      root.append(el('p', '', `Subscribed ${c.subscribed ?? 0} · Pending ${c.pending ?? 0} · Unsubscribed ${c.unsubscribed ?? 0} · Bounced ${c.bounced ?? 0}`));
      if (!data.ready || !data.hasAddress) root.append(el('p', '', 'Sending is off: ' + (!data.ready ? 'email is not set up. ' : '') + (!data.hasAddress ? 'Set NEWSLETTER_POSTAL_ADDRESS.' : '')));
      root.append(button('New issue', () => edit()));
      for (const i of data.items) root.append(button(`#${i.number} · ${i.status} · ${i.title}${i.scheduled_at ? ' · ' + when(i.scheduled_at) : ''}${i.status === 'sent' ? ` · sent ${i.sent_count}, failed ${i.failed_count}` : ''}`, () => edit(i.id).catch(say)));
      root.append(msg);
    }
    async function edit(id) {
      const issue = id ? (await request(path + '?id=' + id, 'GET')).issue : { title: '', topic: TOPICS[0], body_md: '', status: 'draft' };
      const locked = issue.status !== 'draft';
      root.replaceChildren(button('Back to list', () => list().catch(say)), el('h2', '', id ? `Issue #${issue.number} (${issue.status})` : 'New issue'));
      const title = el('input', 'n-in'); title.value = issue.title; title.maxLength = 120; title.placeholder = 'Title'; title.setAttribute('aria-label', 'Title');
      const topic = el('select', 'n-in'); topic.setAttribute('aria-label', 'Topic'); for (const t of TOPICS) { const o = el('option', '', t); o.value = t; topic.append(o); } topic.value = issue.topic;
      const body = el('textarea', 'n-in'); body.value = issue.body_md; body.maxLength = 20000; body.placeholder = 'Write in Markdown. Use ## for sections. No trade tips or profit claims.'; body.setAttribute('aria-label', 'Issue text');
      const preview = el('div', 'nl-preview is-light'); preview.hidden = true;
      const bar = el('div', 'btn-row');
      const act = async (body2, ok) => { try { const r = await request(path, 'POST', body2); msg.textContent = ok; return r; } catch (e) { say(e); } };
      const save = async () => {
        const r = await act({ action: 'save', id, title: title.value, topic: topic.value, body_md: body.value }, 'Saved.');
        return r?.id ?? id;
      };
      bar.append(button('Save draft', async () => { const n = await save(); if (n) edit(n).catch(say); }));
      bar.append(button('Preview light', async () => { const r = await act({ action: 'preview', body_md: body.value }, ''); if (r) { preview.className = 'nl-preview is-light'; preview.innerHTML = r.html; preview.hidden = false; } }));
      bar.append(button('Preview dark', async () => { const r = await act({ action: 'preview', body_md: body.value }, ''); if (r) { preview.className = 'nl-preview is-dark'; preview.innerHTML = r.html; preview.hidden = false; } }));
      if (!locked) {
        const stamp = el('input', 'n-in'); stamp.type = 'datetime-local'; stamp.setAttribute('aria-label', 'Send time');
        bar.append(button('Send test to me', async () => { const n = await save(); if (n) { const r = await act({ action: 'test', id: n }, ''); if (r) msg.textContent = 'Test sent to ' + r.to; } }));
        bar.append(stamp, button('Schedule', async () => {
          if (!stamp.value) { msg.textContent = 'Choose a send time.'; return; }
          if (!confirm('Schedule this issue? It goes to every confirmed subscriber who chose this topic.')) return;
          const n = await save(); if (n && await act({ action: 'schedule', id: n, when: new Date(stamp.value).toISOString() }, 'Scheduled.')) list().catch(say);
        }));
      }
      if (issue.status === 'scheduled') bar.append(button('Unschedule', async () => { if (await act({ action: 'unschedule', id }, 'Back to draft.')) edit(id).catch(say); }));
      if (locked) { title.disabled = topic.disabled = body.disabled = true; }
      root.append(title, topic, body, bar, preview, msg);
    }
    list().catch((e) => { say(e); root.append(msg); });
  },
};
