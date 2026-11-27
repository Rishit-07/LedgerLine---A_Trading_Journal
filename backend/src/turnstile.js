// Cloudflare Turnstile check for public forms. Off unless TURNSTILE_SECRET_KEY is set, so local work and tests are unaffected.
// The browser sends the widget token in the X-Turnstile-Token header; we confirm it with Cloudflare before the handler runs.
// A refused token is rejected. If Cloudflare itself cannot be reached we let the request through (and log it), so an outage
// on their side never blocks someone from contacting support.
import { send } from './http.js';

const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export function createTurnstile(env = process.env, fetchImpl = fetch) {
  const secret = env.TURNSTILE_SECRET_KEY?.trim();

  async function verify(token) {
    if (typeof token !== 'string' || !token || token.length > 2048) return 'refused';
    try {
      const response = await fetchImpl(VERIFY_URL, {
        method: 'POST',
        body: new URLSearchParams({ secret, response: token }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) return 'unavailable';
      const data = await response.json();
      return data?.success === true ? 'ok' : 'refused';
    } catch {
      return 'unavailable';
    }
  }

  const gate = (handler) => async (request, response, ...rest) => {
    if (!secret) return handler(request, response, ...rest);
    const outcome = await verify(request.headers['x-turnstile-token']);
    if (outcome === 'unavailable') console.error('Turnstile check could not be completed; letting the request through.');
    else if (outcome !== 'ok') return send(response, 403, { error: 'Please complete the check and try again.', reason: 'bot_check' });
    return handler(request, response, ...rest);
  };

  return { enabled: Boolean(secret), verify, gate };
}
