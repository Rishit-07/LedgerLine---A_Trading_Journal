import { mountPage } from '../../pages/shared.js';
import { node } from '../../pages/workspace-ui.js';
import './newsletter.css';

const el = (tag, className, text) => node(tag, text ?? '', className);
const api = async (url, options) => {
  const response = await fetch(url, { signal: AbortSignal.timeout(10000), ...options });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || 'Something went wrong. Try again.');
  return data;
};
const post = (url, body) => api(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const FREQ = { weekly: 'weekly', weekdays: 'on weekdays', monthly: 'monthly' };

export function renderNewsletterPublic(landing, path) {
  const page = mountPage(landing, '<div class="n-root nl-public"><header><a href="/">Ledgerline</a><a href="/notifications">Newsletter settings</a></header><main data-main aria-live="polite"></main></div>');
  const main = page.querySelector('[data-main]');
  const params = new URLSearchParams(location.search);
  const token = params.get('token') ?? '';
  const message = (title, text) => { document.title = title + ' | Ledgerline'; const card = el('section', 'n-out ws-card nl-card'); card.append(el('h1', '', title), el('p', '', text)); main.replaceChildren(card); return card; };
  const home = (card) => { const a = el('a', 'btn btn-primary', 'Back to Ledgerline'); a.href = '/'; card.append(a); };

  if (path === '/newsletter/confirm') {
    message('Confirming', 'One moment.');
    // Scanners prefetch links, so the subscription is only confirmed by this POST.
    post('/api/newsletter/confirm', { token }).then((r) => { const c = message('You are subscribed', `You will get ${r.topics.join(', ')} ${FREQ[r.frequency] ?? ''}. Every email has an unsubscribe link.`); home(c); }).catch((e) => home(message('Could not confirm', e.message)));
  } else if (path === '/newsletter/manage') {
    const url = '/api/newsletter/manage?token=' + encodeURIComponent(token);
    const show = (sub) => {
      const card = message('Newsletter preferences', sub.status === 'subscribed' ? `${sub.email} gets ${sub.topics.join(', ')} ${FREQ[sub.frequency] ?? ''}.` : `${sub.email} is ${sub.status}.`);
      if (sub.status === 'subscribed') {
        const row = el('div', 'btn-row'); const stop = el('button', 'btn btn-primary', 'Unsubscribe'); stop.type = 'button';
        stop.addEventListener('click', () => post(url, { action: 'unsubscribe' }).then(() => home(message('You are unsubscribed', 'We will not email you again.'))).catch((e) => { stop.after(el('p', 'nl-status', e.message)); }));
        row.append(stop); card.append(row);
      } else home(card);
    };
    const run = params.get('unsubscribe') === '1' ? post(url, { action: 'unsubscribe' }).then((sub) => home(message('You are unsubscribed', 'We will not email you again.'))) : api(url).then(show);
    run.catch((e) => home(message('Link problem', e.message)));
  } else {
    const slug = decodeURIComponent(path.replace('/newsletter/', ''));
    message('Loading', '');
    api('/api/newsletter/issues?slug=' + encodeURIComponent(slug)).then((issue) => {
      document.title = issue.title + ' | Ledgerline';
      const article = el('article', 'n-out ws-card nl-card nl-rise');
      article.append(el('small', '', `Issue #${issue.number}`), el('h1', '', issue.title));
      const body = el('div'); body.innerHTML = issue.html; // server-rendered from escaped markdown
      article.append(body, el('p', '', issue.promise));
      const join = el('a', 'btn btn-primary', 'Get this by email'); join.href = '/notifications#newsletter'; article.append(join);
      main.replaceChildren(article);
    }).catch((e) => home(message('Not found', e.message)));
  }
  return page;
}
