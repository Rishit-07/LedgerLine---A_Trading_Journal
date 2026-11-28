import {node} from './workspace-ui.js';

/* One small AI card used by the trade view and the Mistake lab. `run()` calls the server and resolves {output, usage}.
   The server enforces the monthly limit; this only shows it and links Free accounts to Pro. */
export function aiPanel({title, intro, label, usage, last, run}) {
  const card = node('section', '', 'n-out ws-card ai-panel');
  const out = node('div', last?.output ?? '', 'ai-output'), meter = node('p', '', 'ai-meter'), status = node('p', '');
  status.setAttribute('role', 'status');
  const go = node('button', label, 'btn btn-secondary'); go.type = 'button';
  const paint = (u) => {
    meter.textContent = `${u.used} of ${u.limit} used this month. `;
    if (u.plan === 'free') { const a = node('a', 'Get more with Pro', 'ai-more'); a.href = '/billing?from=reports'; meter.append(a); }
  };
  paint(usage);
  go.onclick = async () => {
    go.classList.add('is-loading'); go.disabled = true; status.textContent = '';
    card.setAttribute('aria-busy', 'true');
    const prevOutput = out.textContent;
    const loaderLabel = node('small', 'Analyzing your records…');
    const bar = node('div', '', 'ux-indeterminate-bar');
    bar.setAttribute('role', 'progressbar');
    const sk1 = node('div', '', 'ux-skeleton-line');
    const sk2 = node('div', '', 'ux-skeleton-line is-short');
    out.replaceChildren(loaderLabel, bar, sk1, sk2);
    const t = setTimeout(() => { if (loaderLabel.isConnected) loaderLabel.textContent = 'Still analyzing — almost ready…'; }, 5000);
    try { const r = await run(); out.textContent = r.output; paint(r.usage); go.textContent = 'Run again'; }
    catch (e) { out.textContent = prevOutput; status.textContent = e.message; }
    finally { clearTimeout(t); card.removeAttribute('aria-busy'); go.classList.remove('is-loading'); go.disabled = false; }
  };
  if (last) go.textContent = 'Run again';
  card.append(node('h2', title), node('p', intro), go, meter, out, status);
  return card;
}
