/* Request guards shared by the HTTP server: rate limiting, client address, safe handler wrapper.
   Kept free of database and Firebase imports so it can be unit tested. */
import { send } from './http.js';

/** Fixed-window counter per key. In memory, so it limits one server process; use the host's limiter for several. */
export function createRateLimiter({ windowMs, max, now = Date.now, maxKeys = 10_000 }) {
  const hits = new Map();
  return function check(key) {
    const time = now();
    let entry = hits.get(key);
    if (!entry || entry.reset <= time) {
      if (hits.size >= maxKeys) {
        for (const [k, v] of hits) if (v.reset <= time) hits.delete(k);
        if (hits.size >= maxKeys) hits.delete(hits.keys().next().value);
      }
      entry = { count: 0, reset: time + windowMs };
      hits.set(key, entry);
    }
    entry.count += 1;
    return { allowed: entry.count <= max, retryAfter: Math.max(1, Math.ceil((entry.reset - time) / 1000)) };
  };
}

/** The client address. X-Forwarded-For is only believed when TRUST_PROXY=true (the server sits behind a proxy). */
export function clientAddress(request, trustProxy = process.env.TRUST_PROXY === 'true') {
  if (trustProxy) {
    const forwarded = String(request.headers['x-forwarded-for'] ?? '').split(',').pop().trim();
    if (forwarded) return forwarded;
  }
  return request.socket?.remoteAddress ?? 'unknown';
}

/** Routes that cost money, send email or are open to anyone get tighter limits than ordinary reads. */
export const LIMITS = {
  strict: { windowMs: 60_000, max: 5 },
  costly: { windowMs: 60_000, max: 20 },
  general: { windowMs: 60_000, max: 240 },
};
export function limitClassFor(pathname, method) {
  if (pathname === '/api/newsletter' || pathname === '/api/support') return 'strict';
  if (pathname.endsWith('/webhook')) return 'general';
  if (pathname === '/api/ai/report' || pathname.startsWith('/api/billing/checkout') || pathname === '/api/mentor-verification'
    || pathname === '/api/account/export' || (pathname === '/api/account' && method === 'DELETE')
    || pathname === '/api/profile-picture') return 'costly';
  if (pathname.startsWith('/api/coach')) return 'costly';
  return 'general';
}

/** Run a route handler so a thrown error or rejected promise becomes a 500 instead of an unhandled rejection. */
export function safely(handler) {
  return async (request, response) => {
    try {
      await handler(request, response);
    } catch (error) {
      console.error('A request failed (' + (error?.code ?? error?.name ?? 'unknown error') + ').');
      if (!response.headersSent) send(response, 500, { error: 'Something went wrong. Try again in a moment.' });
      else response.end();
    }
  };
}
