/* The "Ledger bot pops in and out" setting. The server copy is the truth; local storage mirrors it so it applies instantly. */
const KEY = 'lp-bot-pop';
export const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
export function localPop() {
  try { return localStorage.getItem(KEY) !== 'off'; } catch { return true; }
}
export function rememberPop(on) {
  try { localStorage.setItem(KEY, on ? 'on' : 'off'); } catch { /* storage unavailable */ }
  window.dispatchEvent(new CustomEvent('lp-bot-pop', { detail: on }));
}
/** True when the bot should move: setting on and the visitor has not asked for reduced motion. */
export const animated = () => localPop() && !reducedMotion();
