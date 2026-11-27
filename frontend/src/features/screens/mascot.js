import '@fontsource/instrument-serif/latin-400.css';
import think from '../ledger-bot/assets/ledger-think.svg?url';
import cheer from '../ledger-bot/assets/ledger-cheer.svg?url';

export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export const coarsePointer = () => matchMedia('(pointer: coarse)').matches;
export const gsapOnce = () => import('gsap').then((m) => m.gsap ?? m.default);

const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text !== undefined) n.textContent = text; return n; };
export { el };

export function mascot() {
  const bot = el('div', 'll-bot'), fl = el('div', 'fl'), hp = el('div', 'hp');
  for (const [cls, src] of [['b1', think], ['b2', cheer]]) { const img = el('img', cls); img.src = src; img.alt = ''; img.width = 230; img.height = 178; hp.append(img); }
  fl.append(hp); bot.append(fl);
  return bot;
}
/** The bot follows the cursor a little (max 12px sideways, 5 degrees) and bobs 5px. No cursor follow on touch screens. */
export function follow(gsap, bot) {
  const fl = bot.querySelector('.fl');
  if (!coarsePointer()) {
    const qx = gsap.quickTo(fl, 'x', { duration: .5, ease: 'power3' }), qr = gsap.quickTo(fl, 'rotation', { duration: .6, ease: 'power3' });
    addEventListener('pointermove', (e) => { const r = bot.getBoundingClientRect(), c = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / 500)); qx(c * 12); qr(c * 5); });
  }
  gsap.to(bot, { y: -5, duration: 1.7, repeat: -1, yoyo: true, ease: 'sine.inOut' });
}
/** One hop with squash and stretch. */
export function hop(tl, hp, at) {
  tl.set(hp, { transformOrigin: '50% 100%' }, 0)
    .to(hp, { y: -34, scaleX: .95, scaleY: 1.07, duration: .24, ease: 'power2.out' }, at)
    .to(hp, { y: 0, scaleX: 1.08, scaleY: .92, duration: .18, ease: 'power2.in' })
    .to(hp, { scaleX: 1, scaleY: 1, duration: .7, ease: 'elastic.out(1,.35)' });
}
export const tick = () => {
  const ns = 'http://www.w3.org/2000/svg', svg = document.createElementNS(ns, 'svg');
  for (const [k, v] of Object.entries({ width: 22, height: 22, viewBox: '0 0 24 24', fill: 'none', stroke: 'var(--acc)', 'stroke-width': 2.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': 'true' })) svg.setAttribute(k, v);
  svg.setAttribute('class', 'll-tk');
  const path = document.createElementNS(ns, 'path'); path.setAttribute('d', 'M5 12.5l4.5 4.5L19 7.5'); path.setAttribute('pathLength', '1'); svg.append(path);
  return svg;
};
