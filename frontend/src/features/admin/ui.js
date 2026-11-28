// Small builders shared by the admin pages. Everything uses textContent, so nothing a customer typed can run as markup.
import { node, button } from '../../pages/workspace-ui.js';

export const when = (value) => (value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—');
export const day = (value) => (value ? new Date(value).toLocaleDateString('en-IN', { dateStyle: 'medium' }) : '—');
export const pill = (text, tone = '') => { const p = node('span', text, 'ad-pill'); if (tone) p.dataset.tone = tone; return p; };
export const primary = (text, handler) => { const b = node('button', text, 'btn btn-primary'); b.type = 'button'; b.addEventListener('click', handler); return b; };
export function field(label, control) { const wrap = node('label'); wrap.append(node('span', label), control); return wrap; }
export function input(attrs = {}) { const item = node('input', '', 'n-in'); Object.assign(item, attrs); return item; }
export function select(options, value) { const item = node('select', '', 'n-in'); for (const [v, l] of options) item.append(new Option(l, v)); if (value !== undefined) item.value = value; return item; }
export function table(headers, rows) {
  const wrap = node('div', '', 'ad-table-wrap'), t = node('table', '', 'ad-table'), head = node('tr');
  for (const h of headers) head.append(node('th', h));
  const body = node('tbody');
  for (const cells of rows) { const tr = node('tr'); for (const cell of cells) { const td = node('td'); td.append(cell instanceof Node ? cell : document.createTextNode(cell ?? '—')); tr.append(td); } body.append(tr); }
  t.append(node('thead')); t.firstChild.append(head); t.append(body); wrap.append(t);
  return wrap;
}
export function cellWith(main, sub) { const f = document.createDocumentFragment(); f.append(main); if (sub) f.append(node('span', sub, 'ad-sub')); return f; }
export function chips(options, current, onPick) {
  const bar = node('div', '', 'ad-bar');
  for (const [value, label] of options) { const b = button(label, () => onPick(value)); if (value === current) b.setAttribute('aria-pressed', 'true'); bar.append(b); }
  return bar;
}
export function pager(data, go) {
  const bar = node('div', '', 'ad-pager');
  bar.append(node('span', `Page ${data.page} of ${data.pages} · ${data.total} total`));
  const prev = button('Previous', () => go(data.page - 1)), next = button('Next', () => go(data.page + 1));
  prev.disabled = data.page <= 1; next.disabled = data.page >= data.pages;
  bar.append(prev, next);
  return bar;
}
