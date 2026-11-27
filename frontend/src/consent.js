// Cookie and storage choice. Ledgerline has no analytics, advertising or tracking storage, so the only optional
// category is "preferences": remembering your theme, the Ledger bot setting and small interface hints on this device.
// Essential storage (sign-in session, security, the payment you are in the middle of) is always on and is not gated here.
import './consent.css';

const KEY = 'ledgerline-consent';
const VERSION = 1;
const OPTIONAL_KEYS = ['ledgerline-theme', 'lp-bot-pop'];
const OPTIONAL_PREFIXES = [];

function read() {
  try {
    const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return saved?.v === VERSION && (saved.choice === 'all' || saved.choice === 'essential') ? saved.choice : null;
  } catch { return null; }
}

export const getChoice = () => read();
export const allowsPreferences = () => read() === 'all';

/** Write an optional preference only when the visitor allowed it. Returns whether it was stored. */
export function remember(key, value) {
  if (!allowsPreferences()) return false;
  try { localStorage.setItem(key, value); return true; } catch { return false; }
}

function clearOptional() {
  try {
    for (const key of Object.keys(localStorage)) {
      if (OPTIONAL_KEYS.includes(key) || OPTIONAL_PREFIXES.some((prefix) => key.startsWith(prefix))) localStorage.removeItem(key);
    }
  } catch { /* storage unavailable: nothing was stored */ }
}

function choose(choice) {
  try { localStorage.setItem(KEY, JSON.stringify({ v: VERSION, choice, at: new Date().toISOString().slice(0, 10) })); } catch { /* choice lasts for this page only */ }
  if (choice !== 'all') clearOptional();
  else {
    const dark = document.documentElement.classList.contains('dark');
    remember('ledgerline-theme', dark ? 'dark' : 'light');
  }
  window.dispatchEvent(new CustomEvent('ledgerline-consent', { detail: choice }));
}

let banner = null;

function close() {
  const closing = banner;
  banner = null;
  if (!closing) return;
  closing.classList.remove('is-open');
  setTimeout(() => closing.remove(), matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 260);
}

export function openConsent({ focus = false } = {}) {
  if (banner) { if (focus) banner.querySelector('button')?.focus(); return; }
  const current = read();
  banner = document.createElement('section');
  banner.className = 'ck n-out';
  banner.setAttribute('role', 'dialog');
  banner.setAttribute('aria-labelledby', 'ck-title');
  banner.setAttribute('aria-describedby', 'ck-body');

  const title = document.createElement('h2');
  title.id = 'ck-title';
  title.textContent = 'Your storage choice';
  const body = document.createElement('p');
  body.id = 'ck-body';
  body.append(
    'Ledgerline keeps what it needs to sign you in and keep your account safe. It uses no analytics, advertising or tracking cookies. ',
    'You can also let it remember your theme and bot setting on this device. ',
  );
  const link = document.createElement('a');
  link.href = '/cookies';
  link.textContent = 'Read the Cookie Policy';
  body.append(link, '.');
  const status = document.createElement('p');
  status.className = 'ck-now';
  status.textContent = current ? 'Right now: ' + (current === 'all' ? 'preferences are remembered.' : 'essential only.') : '';

  const actions = document.createElement('div');
  actions.className = 'ck-actions';
  const essential = document.createElement('button');
  essential.type = 'button';
  essential.className = 'btn btn-secondary';
  essential.textContent = 'Essential only';
  const all = document.createElement('button');
  all.type = 'button';
  all.className = 'btn btn-primary';
  all.textContent = 'Remember my preferences';
  essential.onclick = () => { choose('essential'); close(); };
  all.onclick = () => { choose('all'); close(); };
  actions.append(essential, all);

  banner.append(title, body, status, actions);
  banner.addEventListener('keydown', (event) => { if (event.key === 'Escape' && current) close(); });
  document.body.append(banner);
  requestAnimationFrame(() => banner?.classList.add('is-open'));
  if (focus) all.focus();
}

let started = false;
export function initConsent() {
  if (started) return;
  started = true;
  document.addEventListener('click', (event) => {
    const trigger = event.target.closest?.('[data-cookie-settings]');
    if (!trigger) return;
    event.preventDefault();
    openConsent({ focus: true });
  });
  if (!read()) setTimeout(() => openConsent(), 900);
}
