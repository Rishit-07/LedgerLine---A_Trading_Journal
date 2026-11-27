/* After `vite build`: writes dist/_headers (Netlify and Cloudflare Pages read this file) with security headers.
   The Content-Security-Policy hashes the one inline script in index.html, so it needs no 'unsafe-inline' for scripts.
   By default the policy is sent as Report-Only, so nothing breaks while you check the browser console.
   Set CSP_MODE=enforce when building to turn it on. On other hosts, copy these headers into the host's settings. */
import { createHash } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';

const dist = new URL('../dist/', import.meta.url);
const html = await readFile(new URL('index.html', dist), 'utf8');
const hashes = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)]
  .map((m) => `'sha256-${createHash('sha256').update(m[1]).digest('base64')}'`);

const policy = [
  "default-src 'self'",
  `script-src 'self' 'inline-speculation-rules' ${hashes.join(' ')} https://apis.google.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/ https://challenges.cloudflare.com`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://firebaseappcheck.googleapis.com https://fcmregistrations.googleapis.com https://firebaseinstallations.googleapis.com https://lumberjack.razorpay.com",
  'frame-src https://ledger-line-d2e8c.firebaseapp.com https://accounts.google.com https://www.google.com/recaptcha/ https://recaptcha.google.com https://challenges.cloudflare.com',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const header = process.env.CSP_MODE === 'enforce' ? 'Content-Security-Policy' : 'Content-Security-Policy-Report-Only';
const rules = [
  '/*',
  `  ${header}: ${policy}`,
  '  Strict-Transport-Security: max-age=31536000; includeSubDomains',
  '  X-Content-Type-Options: nosniff',
  '  Referrer-Policy: strict-origin-when-cross-origin',
  '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=()',
  '  Cross-Origin-Opener-Policy: same-origin-allow-popups',
  '  X-Frame-Options: DENY',
  '',
  '/assets/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
  '/metatrader/*',
  '  Cache-Control: public, max-age=3600',
  '',
  '/404.html',
  '  X-Robots-Tag: noindex',
  '',
].join('\n');
await writeFile(new URL('_headers', dist), rules);

// Real 404 status. Known pages are rewritten to index.html with a 200; there is deliberately NO catch-all rule, so any other address gets
// 404.html (a copy of the app shell that draws the "not in the book" page) with a genuine 404 status. Netlify and Cloudflare Pages both work this way.
import { appPages, publicPages, prefixPages } from '../src/routes.js';
const known = [...new Set([...Object.keys(appPages), ...publicPages.filter((p) => p !== '/'), ...prefixPages])];
await writeFile(new URL('_redirects', dist), known.map((p) => `${p} /index.html 200`).join('\n') + '\n');
await writeFile(new URL('404.html', dist), html);
console.log(`Wrote dist/_redirects (${known.length} pages) and dist/404.html.`);

// Search engines: sitemap and robots need the real address, so they are written only when SITE_URL is set (for example SITE_URL=https://ledgerline.app).
const site = (process.env.SITE_URL ?? '').replace(/\/$/, '');
const crawlable = ['/', '/about', '/support', '/terms', '/privacy'];
const robots = ['User-agent: *', 'Allow: /', ...Object.keys(appPages).concat(['/auth', '/onboarding']).map((p) => `Disallow: ${p}`), ...(site ? [`Sitemap: ${site}/sitemap.xml`] : []), ''].join('\n');
await writeFile(new URL('robots.txt', dist), robots);
if (site) {
  await writeFile(new URL('sitemap.xml', dist), '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' + crawlable.map((p) => `  <url><loc>${site}${p === '/' ? '/' : p}</loc></url>`).join('\n') + '\n</urlset>\n');
  const withCanonical = html.replace('</head>', `    <link rel="canonical" href="${site}/" />\n    <meta property="og:url" content="${site}/" />\n  </head>`);
  await writeFile(new URL('index.html', dist), withCanonical);
  console.log('Wrote sitemap.xml and canonical for', site);
} else console.log('SITE_URL not set: skipped sitemap.xml and canonical (robots.txt still written).');

// Speed: start downloading the main font before the page asks for it.
import { readdir } from 'node:fs/promises';
const font = (await readdir(new URL('assets/', dist))).find((f) => /^schibsted-grotesk-latin-wght-normal.*\.woff2$/.test(f));
if (font) {
  const current = await readFile(new URL('index.html', dist), 'utf8');
  await writeFile(new URL('index.html', dist), current.replace('</head>', `    <link rel="preload" href="/assets/${font}" as="font" type="font/woff2" crossorigin />\n  </head>`));
  console.log('Preloaded', font);
}
console.log(`Wrote dist/_headers (${header}).`);
