/* The 404 page. The server answers 404 (see write-headers.mjs); this draws the page, hides it from search, and logs only the path and referrer. */
import './screens.css';
import { el, mascot, follow, hop, reducedMotion, gsapOnce } from './mascot.js';

const middle = (text, max = 30) => (text.length <= max ? text : text.slice(0, Math.ceil((max - 1) / 2)) + '…' + text.slice(-Math.floor((max - 1) / 2)));

function words(h1, text) {
  const parts = text.split(' ');
  h1.textContent = '';
  parts.forEach((w, i) => { if (i) h1.append(' '); const a = el('span', 'll-w'), b = el('span', 'll-wi', w); a.append(b); h1.append(a); });
  h1.append(Object.assign(el('span', 'll-sr'), { textContent: '. Error 404, page not found.' }));
}

function log() {
  try {
    let referrer = ''; try { referrer = document.referrer ? new URL(document.referrer).pathname : ''; } catch { /* ignore */ }
    navigator.sendBeacon?.('/api/not-found', new Blob([JSON.stringify({ path: location.pathname, referrer })], { type: 'application/json' }));
  } catch { /* logging must never get in the way */ }
}

export function renderNotFound(landing) {
  document.title = 'Page not found — Ledgerline';
  const robots = document.head.querySelector('meta[name="robots"]') ?? document.head.appendChild(Object.assign(document.createElement('meta'), { name: 'robots' }));
  robots.content = 'noindex';
  document.documentElement.removeAttribute('data-page-loading');   // the page-level skeleton in index.html goes away
  log();

  const pg = el('div', 'll-pg page'), col = el('main', 'll-col');
  const top = el('div', 'll-top'), theme = el('button', 'll-th'); theme.type = 'button';
  const dark = () => document.documentElement.classList.contains('dark');
  const label = () => { theme.textContent = dark() ? 'Light' : 'Dark'; };
  theme.onclick = () => { const next = !dark(); document.documentElement.classList.toggle('dark', next); try { localStorage.setItem('ledgerline-theme', next ? 'dark' : 'light'); } catch { /* ignore */ } label(); };
  label(); top.append(theme);

  const h1 = el('h1'); words(h1, 'This page isn’t in the book');
  const tx = el('p', 'll-tx', 'The link may be old, or the entry was never posted. Your journal is untouched.');
  const tb = el('div', 'll-tb');
  const row = (label, value, strong) => { const r = el('div', 'll-row'), v = el('span', 'll-vl'); if (strong) v.append(el('b', '', value)); else v.textContent = value; r.append(el('span', '', label), el('i', 'll-ld'), v); return { r, v }; };
  const asked = row('You asked for', middle(location.pathname), true), found = row('Found in the book', 'nothing');
  const diff = row('Difference', '', false), df = el('b', 'll-df ll-cn'); df.style.setProperty('--n', '404'); diff.v.append(df);
  const single = el('div', 'll-single'), dbl = el('div', 'll-dbl'); dbl.style.display = 'none';
  const stamp = el('div', 'll-stamp', 'Balanced'); stamp.setAttribute('aria-hidden', 'true');
  tb.append(asked.r, found.r, diff.r, single, dbl, stamp);

  const acts = el('div', 'll-acts'), back = el('a', 'll-btn pri', 'Back to Today'); back.href = '/dashboard';
  const post = el('button', 'll-btn', 'Post a correcting entry'); post.type = 'button';
  acts.append(back, post);
  const note = el('p', 'll-note'); note.setAttribute('aria-live', 'polite');
  const gap = el('div'); gap.style.height = '22px';
  const links = [['Journal', '/journal', 'every entry and trade'], ['Reports', '/reports', 'weekly and monthly'], ['Help', '/support', 'write to support']].map(([name, href, hint]) => {
    const a = el('a', 'll-row ll-link'); a.href = href; const v = el('span', 'll-vl', hint); a.append(el('span', '', name), el('i', 'll-ld'), v); return a; });
  const bot = mascot();
  col.append(h1, tx, tb, acts, note, gap, ...links, bot);
  pg.append(top, col);
  (landing.isConnected ? landing : document.querySelector('body > .n-root'))?.replaceWith(pg);
  if (!pg.isConnected) document.body.append(pg);
  back.focus({ preventScroll: true });

  let gsap = null, balanced = false;
  const final = () => {
    df.style.setProperty('--n', '0'); df.classList.add('ok'); single.style.display = 'none'; dbl.style.display = 'block'; dbl.style.transform = 'scaleX(1)';
    stamp.style.opacity = '1'; bot.querySelector('.b1').style.opacity = '0'; bot.querySelector('.b2').style.opacity = '1';
    post.disabled = true; post.textContent = 'Entry balanced'; note.textContent = 'Balanced. The page is still missing, so head back to Today.';
  };
  post.onclick = () => {                      // a toy: nothing is saved or sent, and it never gets in the way of Back to Today
    if (balanced) return; balanced = true;
    if (!gsap) return final();
    post.disabled = true; post.textContent = 'Entry balanced';
    const o = { v: 404 }, tl = gsap.timeline();
    tl.to(o, { v: 0, duration: 1.5, ease: 'power3.inOut', onUpdate: () => df.style.setProperty('--n', Math.round(o.v)) }, 0)
      .add(() => { df.classList.add('ok'); }, 0.9)
      .add(() => { single.style.display = 'none'; dbl.style.display = 'block'; gsap.fromTo(dbl, { scaleX: 0 }, { scaleX: 1, duration: .7, ease: 'expo.out' }); }, 1.3)
      .to(bot.querySelector('.b1'), { opacity: 0, duration: .2 }, 1.6).to(bot.querySelector('.b2'), { opacity: 1, duration: .2 }, 1.6)
      .fromTo(stamp, { scale: 2.8, opacity: 0, rotation: -20 }, { scale: 1, opacity: 1, rotation: -6, duration: .35, ease: 'back.out(2.2)' }, 1.9)
      .fromTo(tb, { x: 0 }, { x: 3, duration: .04, repeat: 5, yoyo: true, ease: 'none' }, 2.2)
      .add(() => { note.textContent = 'Balanced. The page is still missing, so head back to Today.'; }, 2.4);
    hop(tl, bot.querySelector('.hp'), 1.9);
  };

  if (reducedMotion()) return pg;
  gsapOnce().then((g) => {
    gsap = g;
    const en = g.timeline({ defaults: { ease: 'power3.out' } });
    en.from(pg.querySelectorAll('.ll-wi'), { yPercent: 115, duration: .9, stagger: .09, ease: 'power4.out' }, .1)
      .from(tx, { opacity: 0, y: 12, duration: .6 }, .6)
      .from(tb.querySelectorAll('.ll-row'), { opacity: 0, y: 14, duration: .5, stagger: .12 }, .8)
      .from(single, { scaleX: 0, duration: .8, ease: 'expo.out' }, 1.2)
      .from(acts.children, { opacity: 0, y: 14, duration: .5, stagger: .1 }, 1.3)
      .from(links, { opacity: 0, y: 10, duration: .45, stagger: .1 }, 1.5)
      .from(bot, { opacity: 0, y: -140, duration: 1.1, ease: 'bounce.out' }, .5)
      .add(() => follow(g, bot));
  }).catch(() => {});
  return pg;
}
