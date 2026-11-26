/* GSAP motion for notifications. Every helper is a no-op under reduced motion, so end states are always correct. */
import { gsap } from 'gsap';

const still = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

export function enterRows(rows) {
  if (still() || !rows.length) return;
  gsap.from(rows, { y: 26, opacity: 0, duration: .55, ease: 'power3.out', stagger: .06, clearProps: 'transform,opacity' });
}
export function slideInRow(row) {
  if (still()) return;
  gsap.from(row, { height: 0, y: -18, opacity: 0, paddingTop: 0, paddingBottom: 0, overflow: 'hidden', duration: .6, ease: 'power3.out', clearProps: 'all' });
}
export function removeRow(row, done) {
  if (still()) { row.remove(); done?.(); return; }
  gsap.to(row, { height: 0, opacity: 0, x: 24, paddingTop: 0, paddingBottom: 0, overflow: 'hidden', duration: .35, ease: 'power2.in', onComplete: () => { row.remove(); done?.(); } });
}
export function dotState(dot, unread) {
  if (still()) { dot.style.opacity = unread ? '1' : '0'; return; }
  gsap.to(dot, { scale: unread ? 1 : 0, opacity: unread ? 1 : 0, duration: .3, ease: unread ? 'back.out(2.4)' : 'power2.out' });
}
export function ringBell(bell) {
  if (still() || !bell) return;
  const icon = bell.querySelector('svg');
  gsap.timeline().to(icon, { rotation: 18, transformOrigin: '50% 0', duration: .08 })
    .to(icon, { rotation: -16, duration: .12 }).to(icon, { rotation: 10, duration: .1 })
    .to(icon, { rotation: -6, duration: .1 }).to(icon, { rotation: 0, duration: .1 });
  gsap.fromTo(bell.querySelector('[data-bell-dot]'), { scale: .4 }, { scale: 1, duration: .5, ease: 'back.out(3)' });
}
export function pressFeel(root) {
  if (still()) return;
  const down = (event) => { const el = event.target.closest('.btn'); if (el && !el.disabled) gsap.to(el, { scale: .95, duration: .1, ease: 'power2.out' }); };
  const up = (event) => { const el = event.target.closest('.btn'); if (el) gsap.to(el, { scale: 1, duration: .35, ease: 'elastic.out(1, .5)' }); };
  root.addEventListener('pointerdown', down);
  for (const type of ['pointerup', 'pointercancel', 'pointerleave']) root.addEventListener(type, up, true);
}
export function flashText(el) {
  if (still()) return;
  gsap.fromTo(el, { y: 6, opacity: 0 }, { y: 0, opacity: 1, duration: .35, ease: 'power2.out' });
}
export function popIn(el) {
  if (still()) return;
  gsap.fromTo(el, { y: 22, opacity: 0, scale: .96 }, { y: 0, opacity: 1, scale: 1, duration: .45, ease: 'back.out(1.6)' });
}
export function moveKnob(knob, on, instant = false) {
  const x = on ? (innerWidth <= 640 ? 16 : 24) : 0;
  if (instant || still()) { gsap.set(knob, { x }); return; }
  gsap.to(knob, { x, duration: .35, ease: 'back.out(1.8)' });
  gsap.fromTo(knob, { scale: .8 }, { scale: 1, duration: .3, ease: 'power2.out', delay: .05 });
}
export function swapPanels(out, into) {
  out.hidden = true; into.hidden = false;
  if (still()) return;
  gsap.fromTo(into, { y: 18, opacity: 0 }, { y: 0, opacity: 1, duration: .45, ease: 'power3.out', clearProps: 'transform,opacity' });
}
