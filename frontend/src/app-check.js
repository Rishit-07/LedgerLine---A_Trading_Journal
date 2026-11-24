/* Firebase App Check: proves API calls come from this website, not a script. Off until VITE_APPCHECK_SITE_KEY is set.
   Adds the App Check token to every same-origin /api request, so no page code has to change. */
import { initializeAppCheck, getToken, ReCaptchaEnterpriseProvider } from 'firebase/app-check';
import { app } from './firebase-session.js';

export function startAppCheck() {
  const key = import.meta.env.VITE_APPCHECK_SITE_KEY;
  if (!key) return;
  if (import.meta.env.DEV && import.meta.env.VITE_APPCHECK_DEBUG_TOKEN) self.FIREBASE_APPCHECK_DEBUG_TOKEN = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN;
  const appCheck = initializeAppCheck(app, { provider: new ReCaptchaEnterpriseProvider(key), isTokenAutoRefreshEnabled: true });
  const nativeFetch = window.fetch.bind(window);
  window.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.url, location.href);
    if (url.origin !== location.origin || !url.pathname.startsWith('/api/')) return nativeFetch(input, init);
    try {
      const { token } = await getToken(appCheck, false);
      const headers = new Headers(init.headers ?? (typeof input === 'string' ? undefined : input.headers));
      headers.set('X-Firebase-AppCheck', token);
      return nativeFetch(input, { ...init, headers });
    } catch {
      return nativeFetch(input, init); // the server decides; with enforcement off the call still works
    }
  };
}
