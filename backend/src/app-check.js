/* Firebase App Check on the API. Off unless APP_CHECK_ENFORCE=true, so nothing changes until the website sends tokens.
   Webhooks and the health check are exempt: they are called by other servers, not by the website. */
import { getAppCheck } from 'firebase-admin/app-check';
import { send } from './http.js';

export function createAppCheckGate(app, { enforce = process.env.APP_CHECK_ENFORCE === 'true' } = {}) {
  if (!enforce) return async () => true;
  const appCheck = getAppCheck(app);
  return async function gate(request, response, pathname) {
    if (pathname === '/api/health' || pathname.endsWith('/webhook') || pathname === '/api/metatrader/ingest') return true;
    const token = request.headers['x-firebase-appcheck'];
    try {
      if (typeof token !== 'string' || !token) throw new Error('missing');
      await appCheck.verifyToken(token);
      return true;
    } catch {
      send(response, 401, { error: 'This request could not be verified. Reload the page and try again.' });
      return false;
    }
  };
}
