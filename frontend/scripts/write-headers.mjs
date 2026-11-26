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
  `script-src 'self' ${hashes.join(' ')} https://apis.google.com https://checkout.razorpay.com https://www.google.com/recaptcha/ https://www.gstatic.com/recaptcha/`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://www.googleapis.com https://firebaseappcheck.googleapis.com https://fcmregistrations.googleapis.com https://firebaseinstallations.googleapis.com https://lumberjack.razorpay.com",
  'frame-src https://ledger-line-d2e8c.firebaseapp.com https://accounts.google.com https://api.razorpay.com https://www.google.com/recaptcha/ https://recaptcha.google.com',
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
  '  Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com")',
  '  Cross-Origin-Opener-Policy: same-origin-allow-popups',
  '  X-Frame-Options: DENY',
  '',
  '/assets/*',
  '  Cache-Control: public, max-age=31536000, immutable',
  '',
].join('\n');
await writeFile(new URL('_headers', dist), rules);
console.log(`Wrote dist/_headers (${header}).`);
