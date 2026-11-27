/* The opening screen: "Opening your book". Plays once per browser session after sign in, shows real counts, never loops, never blocks the app.
   Minimum 1.2s so it never flashes; slow and failed loads are handled in the open (see below). */
import './screens.css';
import { el, mascot, follow, hop, tick, reducedMotion, gsapOnce } from './mascot.js';

export const OPENED_FLAG = 'ledgerline-opened';
const MIN_MS = 1200, SLOW_MS = 8000, RETRY_MS = 20000;
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function build() {
  const pg = el('div', 'll-pg'), col = el('main', 'll-col');
  col.append(el('h1', '', 'Opening your book'));
  const pen = el('div', 'll-pen'), rows = el('div'), dbl = el('div', 'll-dbl');
  const zr = el('div', 'll-row'); zr.style.cssText = 'margin-top:4px;opacity:0';
  const dv = el('span', 'll-vl'); dv.append(el('b', '', '0')); zr.append(el('span', '', 'Difference'), el('i', 'll-ld'), dv);
  const spacer = el('div'); spacer.style.height = '44px';
  const msg = el('div', 'll-msg'), m1 = el('p', 'll-tx m1', 'Checking that today’s rules are in place.'), m2 = el('p', 'll-tx m2', 'Your book balances. Opening now.');
  m2.setAttribute('role', 'status'); m2.setAttribute('aria-live', 'polite');   // only the final message is announced
  msg.append(m1, m2);
  const bot = mascot();
  col.append(pen, spacer, rows, dbl, zr, msg, bot); pg.append(col);
  return { pg, pen, rows, dbl, zr, m1, m2, bot, col };
}

function rowEl(row, failed) {
  const r = el('div', 'handled ll-row'); r.style.opacity = '0';
  const vl = el('span', 'll-vl'), b = el('b', failed ? '' : 'll-cn', failed ? '–' : '');
  if (!failed) b.style.setProperty('--n', '0');
  vl.append(b, document.createTextNode(failed ? '' : ' ' + row.unit));
  r.append(el('span', '', row.label), el('i', 'll-ld'), vl);
  if (failed) { const w = el('span', 'll-warn', '!'); w.setAttribute('aria-label', 'could not load'); r.append(w); } else r.append(tick());
  return { r, b, row };
}

export async function showOpening(request) {
  try { sessionStorage.setItem(OPENED_FLAG, '1'); } catch { /* private mode: it may show again, which is harmless */ }
  const ui = build();
  document.body.append(ui.pg);
  const started = performance.now();
  const reduced = reducedMotion();
  let gsap = null;
  if (!reduced) { try { gsap = await gsapOnce(); } catch { gsap = null; } }

  const slow = setTimeout(() => { ui.m1.textContent = 'Still opening. Your connection is slow.'; if (gsap) gsap.to(ui.pen, { scaleX: .9, duration: .6 }); else ui.pen.style.transform = 'scaleX(.9)'; }, SLOW_MS);
  const retry = setTimeout(() => { const b = el('button', 'll-btn ll-retry', 'Try again'); b.type = 'button'; b.onclick = () => location.reload(); ui.col.append(b); }, RETRY_MS);

  const result = await request('/api/opening', 'GET').then((r) => ({ rows: r.rows })).catch(() => ({ rows: null }));
  clearTimeout(slow); clearTimeout(retry);
  const failed = result.rows === null;
  const rows = failed ? [{ label: 'Your rules' }, { label: 'Journal' }] : result.rows;
  const items = rows.map((row) => rowEl(row, failed));
  ui.rows.append(...items.map((i) => i.r));

  if (failed) { ui.m1.textContent = 'Opened with one problem.'; ui.m1.style.opacity = '1'; ui.m2.style.display = 'none'; const info = el('p', 'll-tx', 'The counts could not load. Everything else is fine.'); ui.col.append(info); }

  const finish = () => { ui.pg.remove(); };
  if (!gsap) {
    for (const i of items) { i.r.style.opacity = '1'; if (!failed) i.b.style.setProperty('--n', String(i.row.value)); const p = i.r.querySelector('.ll-tk path'); if (p) p.style.strokeDashoffset = '0'; }
    ui.pen.style.transform = 'scaleX(1)'; ui.dbl.style.transform = 'scaleX(1)'; ui.zr.style.opacity = '1';
    ui.m1.style.opacity = '0'; ui.m2.style.opacity = '1'; ui.bot.querySelector('.b1').style.opacity = '0'; ui.bot.querySelector('.b2').style.opacity = '1';
    await wait(Math.max(600, MIN_MS - (performance.now() - started)));
    return finish();
  }

  // Rows appear as the data lands; the line is the share of rows done.
  const tl = gsap.timeline();
  items.forEach((i, n) => {
    const at = n * .18, o = { v: 0 };
    tl.to(i.r, { opacity: 1, y: 0, duration: .4, ease: 'power3.out' }, at).from(i.r, { y: 14, duration: .4, ease: 'power3.out' }, at);
    if (!failed) {
      tl.to(o, { v: i.row.value, duration: .6, ease: 'power2.out', onUpdate: () => i.b.style.setProperty('--n', Math.round(o.v)) }, at + .1);
      const path = i.r.querySelector('.ll-tk path'); gsap.set(path, { strokeDashoffset: 1 });
      tl.to(path, { strokeDashoffset: 0, duration: .3, ease: 'power2.out' }, at + .5)
        .fromTo(i.r.querySelector('.ll-tk'), { scale: 1, transformOrigin: '50% 50%' }, { scale: 1.3, duration: .12, yoyo: true, repeat: 1, ease: 'power1.inOut' }, at + .7);
    }
    tl.to(ui.pen, { scaleX: (n + 1) / items.length * .9, duration: .35, ease: 'power1.inOut' }, at);
  });
  await tl.then?.() ?? await wait(tl.duration() * 1000);
  await wait(Math.max(0, MIN_MS - (performance.now() - started) - 700));

  // Finish: the double rule, Difference 0, the message, the cheerful bot with one hop.
  const end = gsap.timeline();
  end.to(ui.pen, { scaleX: 1, duration: .4 }, 0)
    .to(ui.dbl, { scaleX: 1, duration: .6, ease: 'expo.out' }, 0)
    .to(ui.zr, { opacity: 1, duration: .3, ease: 'power3.out' }, .25);
  if (!failed) end.to(ui.m1, { opacity: 0, duration: .2 }, .5).to(ui.m2, { opacity: 1, duration: .3 }, .55);
  end.to(ui.bot.querySelector('.b1'), { opacity: 0, duration: .2 }, .5).to(ui.bot.querySelector('.b2'), { opacity: 1, duration: .2 }, .5);
  hop(end, ui.bot.querySelector('.hp'), .5);
  end.to(ui.pg, { opacity: 0, duration: .4, ease: 'power1.in' }, '+=.2');
  follow(gsap, ui.bot);
  await end.then?.() ?? await wait(end.duration() * 1000);
  finish();
}
