// Cloudflare Pages Function: forwards /api/* on the site's own address to the Ledgerline API.
// Settings (Pages > Settings > Variables and secrets): API_ORIGIN (e.g. https://ledgerline-api.onrender.com) and PROXY_KEY (the same secret the API has).
// The API believes the visitor address we send only when PROXY_KEY matches, so rate limits see the real visitor, not Cloudflare.
export async function onRequest({ request, env }) {
  if (!env.API_ORIGIN || !env.PROXY_KEY) return new Response('{"error":"The API is not connected yet."}', { status: 503, headers: { 'Content-Type': 'application/json' } });
  const url = new URL(request.url);
  const upstream = new Request(new URL(url.pathname + url.search, env.API_ORIGIN), request);
  for (const name of [...upstream.headers.keys()]) if (name.startsWith('x-ledgerline-')) upstream.headers.delete(name);
  upstream.headers.set('x-ledgerline-client-ip', request.headers.get('cf-connecting-ip') ?? '');
  upstream.headers.set('x-ledgerline-proxy-key', env.PROXY_KEY);
  return fetch(upstream, { redirect: 'manual' });
}
