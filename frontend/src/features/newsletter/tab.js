import { node } from '../../pages/workspace-ui.js';
import { toast } from '../notifications/toast.js';
import { pressFeel } from '../notifications/motion.js';
import './newsletter.css';

const path = '/api/newsletter/me';
const TOPICS = ['Market wrap', 'Process lessons', 'Journal and sizing tips', 'Product updates'];
const FREQ = [['weekly', 'Weekly'], ['weekdays', 'Weekdays'], ['monthly', 'Monthly']];
const PROMISES = ['One email per issue, never more than your chosen frequency.', 'No trade tips, no profit or loss claims.', 'We do not track opens or clicks, and never sell or share your email.', 'One tap to unsubscribe, any time.'];
const el = (tag, className, text) => node(tag, text ?? '', className);
const fail = (error) => toast(error?.message || 'Could not do that. Try again.');

function chipGroup(label, items, selected, multi, onChange) {
  const group = el('div', 'nl-chips'); group.setAttribute('role', 'group'); group.setAttribute('aria-label', label);
  const picked = new Set(selected);
  const paint = () => group.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(picked.has(b.dataset.value))));
  for (const [value, text] of items) {
    const b = el('button', 'btn btn-secondary', text); b.type = 'button'; b.dataset.value = value;
    b.addEventListener('click', () => {
      if (multi) { if (picked.has(value)) { if (picked.size === 1) { toast('Keep at least one topic.'); return; } picked.delete(value); } else picked.add(value); }
      else { picked.clear(); picked.add(value); }
      paint(); onChange([...picked]);
    });
    pressFeel?.(b);
    group.append(b);
  }
  paint();
  return group;
}

export async function buildNewsletter(root, { request }) {
  const [me, list] = await Promise.all([request(path, 'GET'), fetch('/api/newsletter/issues').then((r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] }))]);
  const grid = el('div', 'nl-grid');
  const left = el('div'); const right = el('div');
  grid.append(left, right); root.append(grid);

  const card = el('section', 'n-out ws-card nl-card nl-rise');
  left.append(card);
  let topics = me.topics, frequency = me.frequency;
  const status = el('p', 'nl-status'); status.setAttribute('role', 'status');
  const run = async (body, done) => {
    try { Object.assign(me, await request(path, 'POST', body)); paint(); if (done) status.textContent = done; } catch (error) { status.textContent = ''; fail(error); }
  };
  function paint() {
    topics = me.topics; frequency = me.frequency;
    card.replaceChildren(el('h2', '', 'Ledgerline newsletter'), el('p', '', 'Process notes for traders. Confirm once, change or stop any time.'));
    const email = el('div', 'n-in nl-email', me.email); email.setAttribute('aria-label', 'Your account email');
    card.append(email);
    if (me.status === 'pending') {
      card.append(el('p', '', 'Check your inbox and tap the link to confirm. Nothing is sent until you do.'));
      const row = el('div', 'btn-row');
      const resend = el('button', 'btn btn-primary', 'Resend email'); resend.type = 'button'; resend.addEventListener('click', () => run({ action: 'resend' }, 'Sent again. Check spam too.'));
      const cancel = el('button', 'btn btn-secondary', 'Cancel'); cancel.type = 'button'; cancel.addEventListener('click', () => run({ action: 'cancel' }, 'Cancelled.'));
      row.append(resend, cancel); card.append(row, status); return;
    }
    const subscribed = me.status === 'subscribed';
    card.append(el('strong', '', 'Topics'), chipGroup('Topics', TOPICS.map((t) => [t, t]), topics, true, (v) => { topics = v; if (subscribed) run({ action: 'update', topics, frequency }, 'Saved.'); }));
    card.append(el('strong', '', 'How often'), chipGroup('Frequency', FREQ, [frequency], false, (v) => { frequency = v[0]; if (subscribed) run({ action: 'update', topics, frequency }, 'Saved.'); }));
    const row = el('div', 'btn-row');
    if (subscribed) {
      card.append(el('p', '', `You are subscribed: ${topics.join(', ')}, ${FREQ.find((f) => f[0] === frequency)[1].toLowerCase()}.`));
      const latest = el('button', 'btn btn-primary', 'Send me the latest issue'); latest.type = 'button'; latest.addEventListener('click', () => run({ action: 'send_latest' }, 'On its way.'));
      const stop = el('button', 'btn btn-secondary', 'Unsubscribe'); stop.type = 'button'; stop.addEventListener('click', () => { if (confirm('Unsubscribe from the newsletter?')) run({ action: 'unsubscribe' }, 'You are unsubscribed.'); });
      row.append(latest, stop);
    } else {
      if (me.status === 'unsubscribed') card.append(el('p', '', 'You are unsubscribed. You can sign up again any time.'));
      const join = el('button', 'btn btn-primary', 'Subscribe'); join.type = 'button';
      join.addEventListener('click', () => run({ action: 'subscribe', topics, frequency }, 'Check your inbox to confirm.'));
      row.append(join);
    }
    card.append(row, status);
  }
  paint();

  const issues = list.items ?? [];
  const sample = el('section', 'n-out ws-card nl-card');
  sample.append(el('h3', '', issues.length ? `Latest: #${issues[0].number} ${issues[0].title}` : 'Sample issue'));
  const box = el('div', 'n-in nl-sample');
  const sections = issues.length ? issues[0].sections : [{ title: 'Market wrap', text: 'How the week moved, without calls to buy or sell.' }, { title: 'Process lessons', text: 'One habit worth keeping this week.' }];
  const ul = el('ul'); for (const s of sections) { const li = el('li'); li.append(el('strong', '', s.title + ': '), s.text); ul.append(li); }
  box.append(ul); if (!issues.length) box.append(el('small', '', 'Sample only. Real issues will look like this.'));
  sample.append(box); left.append(sample);

  const past = el('section', 'n-out ws-card nl-card');
  past.append(el('h3', '', 'Past issues'));
  const wrap = el('div', 'nl-past');
  if (!issues.length) wrap.append(el('p', '', 'No issues yet.'));
  for (const issue of issues) {
    const row = el('div', 'n-in nl-past-row'); row.append(el('span', '', `#${issue.number} ${issue.title}`));
    const read = el('a', 'btn btn-secondary', 'Read'); read.href = '/newsletter/' + issue.slug; row.append(read); wrap.append(row);
  }
  past.append(wrap); left.append(past);

  const promises = el('section', 'n-out ws-card nl-card');
  promises.append(el('h3', '', 'Our promises'));
  const pl = el('ul', 'nl-promises'); for (const p of PROMISES) pl.append(el('li', '', p));
  promises.append(pl); right.append(promises);
}
