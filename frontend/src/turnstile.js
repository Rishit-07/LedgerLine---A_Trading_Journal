// Cloudflare Turnstile widget for public forms. It only appears when VITE_TURNSTILE_SITE_KEY is set at build time,
// and the server only enforces it when TURNSTILE_SECRET_KEY is set. Set both, or neither.
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY;
let loading;

function loadScript() {
  loading ??= new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.onload = () => resolve(window.turnstile);
    script.onerror = () => { loading = undefined; reject(new Error('Turnstile could not load')); };
    document.head.append(script);
  });
  return loading;
}

/** Puts the check inside `container`. Returns helpers; with no site key it does nothing and headers() is empty. */
export function mountTurnstile(container) {
  if (!SITE_KEY || !container) return { headers: () => ({}), reset() {}, active: false };
  let token = '', widget;
  container.className = (container.className + ' ts-box').trim();
  loadScript().then((api) => {
    widget = api.render(container, { sitekey: SITE_KEY, callback: (value) => { token = value; }, 'expired-callback': () => { token = ''; }, 'error-callback': () => { token = ''; } });
  }).catch(() => { /* the form still tries; the server decides */ });
  return {
    active: true,
    headers: () => (token ? { 'X-Turnstile-Token': token } : {}),
    reset() { token = ''; if (widget !== undefined) window.turnstile?.reset(widget); },
  };
}
