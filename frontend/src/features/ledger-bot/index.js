/* Ledger, the small animated blob that replaces the old mascot. It only ever sits inside existing screens.
   Behaviour: peeks in with a spring bounce, stays about 12 seconds, drops away, returns 5 minutes after the cycle began.
   While visible: leans and looks toward the cursor, plays a random idle every 3 to 6 seconds, and reacts to clicks.
   With the setting off, or with reduced motion, the bot stays on screen and still. */
import { botSvg } from './svg.js';
import { animated, localPop, rememberPop } from './prefs.js';
import './ledger-bot.css';

const STAY = 12000, CYCLE = 5 * 60000, FLOATING = ['/dashboard', '/journal', '/badges'];
const bots = new Set();
let pointer = null, queued = false;

addEventListener('pointermove', (e) => {
  pointer = { x: e.clientX, y: e.clientY };
  if (queued) return;
  queued = true;
  requestAnimationFrame(() => { queued = false; for (const bot of bots) bot.track(); });
}, { passive: true });
addEventListener('lp-bot-pop', () => { for (const bot of bots) bot.refresh(); });

const IDLES = [
  [[{ transform: 'rotate(0)' }, { transform: 'rotate(-7deg)' }, { transform: 'rotate(6deg)' }, { transform: 'rotate(-4deg)' }, { transform: 'rotate(0)' }], 650],       // wiggle
  [[{ transform: 'translateY(0) scale(1,1)' }, { transform: 'translateY(-16px) scale(.96,1.05)' }, { transform: 'translateY(0) scale(1.05,.94)' }, { transform: 'none' }], 560], // hop
  [[{ transform: 'translateY(0)' }, { transform: 'translateY(7px) scale(1.02,.93)' }, { transform: 'translateY(0)' }], 480],                                           // nod
  [[{ transform: 'rotate(0)' }, { transform: 'rotate(-10deg) translateX(-3px)' }, { transform: 'rotate(-10deg) translateX(-3px)' }, { transform: 'rotate(0)' }], 900],     // head tilt
];
const REACTIONS = [
  [[{ transform: 'translateY(0) scale(1,1)' }, { transform: 'translateY(-30px) scale(.94,1.08)' }, { transform: 'translateY(0) scale(1.1,.88)' }, { transform: 'none' }], 620], // bounce
  [[{ transform: 'rotate(0) scale(1)' }, { transform: 'rotate(180deg) scale(1.08)' }, { transform: 'rotate(360deg) scale(1)' }], 680],                                     // spin
  [[{ transform: 'scale(1,1)' }, { transform: 'scale(1.22,.76)' }, { transform: 'scale(.92,1.12)' }, { transform: 'scale(1,1)' }], 520],                                   // squish
];

class Bot {
  constructor({ state = 'calm', size = 110, interactive = true } = {}) {
    this.el = document.createElement('div');
    this.el.className = 'lb';
    this.el.style.setProperty('--lb-size', size + 'px');
    this.lean = document.createElement('div'); this.lean.className = 'lb-lean';
    this.body = document.createElement('div'); this.body.className = 'lb-body';
    this.lean.append(this.body); this.el.append(this.lean);
    this.interactive = interactive;
    this.el.addEventListener('click', () => this.react());
    if (interactive) {   // a bot with no text beside it is a labelled, focusable control
      this.el.tabIndex = 0;
      this.el.setAttribute('role', 'button');
      this.el.setAttribute('aria-label', 'Ledger');
      this.el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this.react(); } });
    } else this.el.setAttribute('aria-hidden', 'true');   // decorative: a note or heading sits beside it
    this.visible = true; this.reaction = 0; this.timer = 0;
    this.set(state);
    bots.add(this);
    this.refresh();
  }
  set(state) {
    this.state = state;
    this.art = botSvg(state);
    this.body.replaceChildren(this.art.svg);
    this.refresh();
  }
  refresh() {            // called when the setting, the state or visibility changes
    const on = animated();
    this.el.classList.toggle('lb-still', !on);
    clearTimeout(this.timer);
    if (!on) { this.resetLook(); return; }
    if (this.art.look) this.art.look.style.animation = 'none';
    if (this.visible) this.scheduleIdle();
  }
  scheduleIdle() {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      if (!this.visible || !animated() || !this.el.isConnected) return;
      const [frames, duration] = IDLES[Math.floor(Math.random() * IDLES.length)];
      this.body.animate(frames, { duration, easing: 'ease-in-out' });
      this.scheduleIdle();
    }, 3000 + Math.random() * 3000);
  }
  react() {
    if (!animated() || !this.visible) return;
    const [frames, duration] = REACTIONS[this.reaction++ % REACTIONS.length];
    this.body.animate(frames, { duration, easing: 'cubic-bezier(.3,1.4,.5,1)' });
  }
  track() {
    if (!this.visible || !animated() || !pointer || !this.el.isConnected) return this.resetLook();
    const r = this.el.getBoundingClientRect();
    const dx = pointer.x - (r.left + r.width / 2), dy = pointer.y - (r.top + r.height / 2);
    const dist = Math.hypot(dx, dy) || 1, k = Math.min(1, dist / 320), ux = dx / dist, uy = dy / dist;
    this.lean.style.transform = `translate(${(ux * 12 * k).toFixed(1)}px, ${(uy * 6 * k).toFixed(1)}px) rotate(${(ux * 4 * k).toFixed(1)}deg)`;
    if (this.art.eyes) this.art.eyes.style.transform = `translate(${(ux * 6 * k).toFixed(1)}px, ${(uy * 4 * k).toFixed(1)}px)`;
  }
  resetLook() {
    this.lean.style.transform = '';
    if (this.art.eyes) this.art.eyes.style.transform = '';
  }
  destroy() { clearTimeout(this.timer); bots.delete(this); this.el.remove(); }
}

/** A bot that lives inside a card, where the old mascot picture used to be. */
export function mountInline(host, options) {
  const bot = new Bot(options);
  host.replaceChildren(bot.el);
  return bot;
}

/** Mount a bot for every `<span data-ledger="calm" data-size="110" data-decor>` under root. */
export function mountDeclared(root) {
  for (const host of root.querySelectorAll('[data-ledger]:not([data-ledger-ready])')) {
    host.dataset.ledgerReady = '';
    const bot = mountInline(host, { state: host.dataset.ledger, size: Number(host.dataset.size) || 110, interactive: host.dataset.decor === undefined });
    host.ledgerBot = bot;
  }
}

/** The small bot at the bottom-right of Dashboard, Journal, Badges and sign-in. */
function mountFloating({ note }) {
  const wrap = document.createElement('div');
  wrap.className = 'lb-float';
  const bubble = document.createElement('p');
  bubble.className = 'lb-note'; bubble.setAttribute('role', 'status');
  bubble.textContent = note ?? '';
  const bot = new Bot({ state: 'calm', size: 112 });
  wrap.append(...(note ? [bubble] : []), bot.el);
  document.body.append(wrap);
  let noteShown = false, timers = [];
  const clear = () => { timers.forEach(clearTimeout); timers = []; };
  const later = (fn, ms) => timers.push(setTimeout(fn, Math.max(0, ms)));
  const showNote = () => { if (note && !noteShown) { noteShown = true; bubble.dataset.on = ''; later(() => delete bubble.dataset.on, STAY - 600); } };

  const peek = () => {
    wrap.hidden = false; bot.visible = true; bot.refresh();
    wrap.animate([{ transform: 'translateY(190px)' }, { transform: 'translateY(0)' }], { duration: 750, easing: 'cubic-bezier(.3,1.5,.5,1)', fill: 'both' });
    later(showNote, 450);
  };
  const drop = () => {
    delete bubble.dataset.on; bot.visible = false; bot.resetLook();
    wrap.animate([{ transform: 'translateY(0)' }, { transform: 'translateY(190px)' }], { duration: 450, easing: 'ease-in', fill: 'both' });
    later(() => { if (!bot.visible) wrap.hidden = true; }, 460);
  };
  const cycle = () => {
    clear();
    if (!animated()) {          // setting off or reduced motion: always on screen, still
      wrap.hidden = false; bot.visible = true; bot.refresh(); wrap.getAnimations().forEach((a) => a.cancel());
      showNote();
      return;
    }
    let began = Number(sessionStorage.getItem('lp-bot-cycle')) || 0;
    const now = Date.now();
    if (!began || now - began >= CYCLE) { began = now; try { sessionStorage.setItem('lp-bot-cycle', String(began)); } catch { /* ignore */ } }
    const age = now - began;
    if (age < STAY) { peek(); later(drop, STAY - age); }
    else { wrap.hidden = true; bot.visible = false; }
    later(() => { try { sessionStorage.setItem('lp-bot-cycle', String(Date.now())); } catch { /* ignore */ } cycle(); }, CYCLE - age);
  };
  addEventListener('lp-bot-pop', cycle);
  cycle();
  return bot;
}

/** Signed-in pages. Syncs the saved setting, then shows the floating bot where the design puts it. */
export async function startLedgerBot({ request, path }) {
  const floats = FLOATING.includes(path);
  let note = null;
  try {
    const result = await request('/api/ledger-bot' + (floats ? '?note=1' : ''), 'GET');
    if (result.pop !== localPop()) rememberPop(result.pop); else try { localStorage.setItem('lp-bot-pop', result.pop ? 'on' : 'off'); } catch { /* ignore */ }
    note = result.note;
  } catch { /* the bot still works with the local setting */ }
  if (floats) mountFloating({ note });
}

/** Sign-in page: no account yet, so a fixed welcome and no numbers. */
export function startWelcome() { mountFloating({ note: 'Welcome back. Pick up where you left off.' }); }

/** Save the setting for the signed-in user, then apply it right away. */
export async function savePop(request, on) {
  await request('/api/ledger-bot', 'PUT', { pop: on });
  rememberPop(on);
}
export { localPop };
