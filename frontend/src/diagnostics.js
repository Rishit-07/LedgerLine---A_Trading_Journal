/* Technical details attached to a support ticket so the team can reproduce a problem.
   Nothing is read from the account, journal or storage; the user sees the list before sending. */
const recent = [];
const keep = (text) => { recent.push(String(text).replace(/\s+/g, ' ').slice(0, 240)); if (recent.length > 5) recent.shift(); };
let started = false;

export function startErrorCapture() {
  if (started) return;
  started = true;
  addEventListener('error', (event) => keep((event.message || 'Error') + (event.filename ? ' @ ' + new URL(event.filename, location.href).pathname.split('/').pop() + ':' + (event.lineno ?? '') : '')));
  addEventListener('unhandledrejection', (event) => keep('Unhandled: ' + (event.reason?.message ?? event.reason ?? 'rejection')));
}

export function collectDiagnostics() {
  const connection = navigator.connection;
  const theme = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  let referrer = '';
  try { referrer = document.referrer ? new URL(document.referrer).pathname : ''; } catch { /* ignore */ }
  return {
    page: location.pathname,
    appVersion: typeof __APP_VERSION__ === 'string' ? __APP_VERSION__ : '',
    userAgent: navigator.userAgent,
    platform: navigator.userAgentData?.platform || navigator.platform || '',
    language: navigator.language,
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    screen: screen.width + 'x' + screen.height,
    viewport: innerWidth + 'x' + innerHeight,
    pixelRatio: String(devicePixelRatio),
    theme,
    online: navigator.onLine ? 'yes' : 'no',
    connection: connection ? [connection.effectiveType, connection.saveData ? 'data-saver' : ''].filter(Boolean).join(' ') : '',
    cookiesEnabled: navigator.cookieEnabled ? 'yes' : 'no',
    touch: navigator.maxTouchPoints > 0 ? 'yes' : 'no',
    referrer,
    recentErrors: [...recent],
  };
}

export const describeDiagnostics = (details) => Object.entries(details)
  .filter(([, value]) => Array.isArray(value) ? value.length : value !== '')
  .map(([key, value]) => key + ': ' + (Array.isArray(value) ? value.join(' | ') : value)).join('\n');
