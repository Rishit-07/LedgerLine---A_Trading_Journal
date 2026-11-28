// Cloudflare Worker entrypoint: forwards /api/* to the Render backend (API_ORIGIN)
// and serves static assets for all other routes via env.ASSETS.
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (!env.API_ORIGIN || !env.PROXY_KEY) {
        return new Response('{"error":"The API is not connected yet."}', {
          status: 503,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      const upstream = new Request(new URL(url.pathname + url.search, env.API_ORIGIN), request);
      for (const name of [...upstream.headers.keys()]) {
        if (name.startsWith('x-ledgerline-')) upstream.headers.delete(name);
      }
      upstream.headers.set('x-ledgerline-client-ip', request.headers.get('cf-connecting-ip') ?? '');
      upstream.headers.set('x-ledgerline-proxy-key', env.PROXY_KEY);
      return fetch(upstream, { redirect: 'manual' });
    }
    return env.ASSETS.fetch(request);
  },
};
