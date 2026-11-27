/* CoinPayments (crypto only). Requests and webhooks are signed with HMAC-SHA256, Base64. See docs/billing-coinpayments.md.
   The webhook is only a nudge: before crediting we fetch the invoice from CoinPayments over a signed request. */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const coinpaymentsReady = (env) => Boolean(env.COINPAYMENTS_CLIENT_ID && env.COINPAYMENTS_CLIENT_SECRET && /^https:\/\//.test(env.PUBLIC_APP_URL ?? ''));
export const webhookUrl = (env) => env.COINPAYMENTS_WEBHOOK_URL || new URL('/api/billing/coinpayments/webhook', env.PUBLIC_APP_URL).href;
const base = (env) => (env.COINPAYMENTS_API_BASE || 'https://api.coinpayments.com/api/v1').replace(/\/$/, '');

export function sign(secret, { method, url, clientId, timestamp, body = '' }) {
  return createHmac('sha256', secret).update(`${method}${url}${clientId}${timestamp}${body}`).digest('base64');
}
async function call(env, fetcher, method, path, data) {
  const url = base(env) + path, timestamp = new Date().toISOString().split('.')[0], body = data ? JSON.stringify(data) : '';
  const response = await fetcher(url, { method, headers: { 'Content-Type': 'application/json', 'X-CoinPayments-Client': env.COINPAYMENTS_CLIENT_ID, 'X-CoinPayments-Timestamp': timestamp, 'X-CoinPayments-Signature': sign(env.COINPAYMENTS_CLIENT_SECRET, { method, url, clientId: env.COINPAYMENTS_CLIENT_ID, timestamp, body }) }, body: body || undefined, signal: AbortSignal.timeout(12000) });
  if (!response.ok) throw Object.assign(new Error('CoinPayments refused the request'), { status: response.status });
  return response.json();
}
const first = (r) => r?.invoices?.[0] ?? r;

/** Create a hosted invoice priced in USD. `order` is our order id, echoed back as invoiceId. */
export async function createInvoice(env, fetcher, { order, cents, title, email }) {
  const total = (cents / 100).toFixed(2);
  const r = first(await call(env, fetcher, 'POST', '/merchant/invoices', {
    clientId: env.COINPAYMENTS_CLIENT_ID, invoiceId: order, currency: 'USD', description: title,
    buyer: email ? { emailAddress: email } : undefined,
    items: [{ name: title, quantity: { value: 1, type: 2 }, originalAmount: total, amount: total }],
    amount: { breakdown: { subtotal: total }, total },
  }));
  const link = r.checkoutLink ?? r.link;
  if (!r.id || typeof link !== 'string' || !link.startsWith('https://')) throw new Error('Invalid invoice');
  return { id: String(r.id), link };
}
export async function getInvoice(env, fetcher, id) { return first(await call(env, fetcher, 'GET', '/merchant/invoices/' + encodeURIComponent(id))); }

/** Verify a webhook: exact registered URL, client id, timestamp within 5 minutes, signature over the raw bytes. */
export function verifyWebhook(raw, headers, env, now = Date.now()) {
  const secret = env.COINPAYMENTS_CLIENT_SECRET, client = headers['x-coinpayments-client'], ts = headers['x-coinpayments-timestamp'], sig = headers['x-coinpayments-signature'];
  if (!secret || client !== env.COINPAYMENTS_CLIENT_ID || typeof ts !== 'string' || typeof sig !== 'string') return false;
  const at = Date.parse(/Z|[+-]\d\d:?\d\d$/.test(ts) ? ts : ts + 'Z');
  if (!Number.isFinite(at) || Math.abs(now - at) > 5 * 60000) return false;
  const want = Buffer.from(sign(secret, { method: 'POST', url: webhookUrl(env), clientId: client, timestamp: ts, body: raw.toString('utf8') }));
  const got = Buffer.from(sig);
  return want.length === got.length && timingSafeEqual(want, got);
}

/** Map CoinPayments' invoice state to ours. Anything unrecognised is held for review, never credited. */
export function classify(invoice, expectedCents) {
  const state = String(invoice?.state ?? invoice?.status ?? '').toLowerCase();
  const total = Number(invoice?.amount?.total ?? invoice?.amount?.displayValue ?? invoice?.total);
  if (state === 'completed') {
    if (Number.isFinite(total) && Math.round(total * 100) !== expectedCents) return { state: 'needs_review', note: 'Invoice total does not match the order.' };
    return { state: 'paid' };
  }
  if (['unpaid', 'created', 'draft', 'scheduled'].includes(state)) return { state: 'waiting' };
  if (['pending', 'confirming', 'paid'].includes(state)) return { state: 'confirming' };
  if (['timedout', 'expired'].includes(state)) return { state: 'expired' };
  if (['cancelled', 'canceled'].includes(state)) return { state: 'cancelled' };
  if (['partiallypaid', 'underpaid'].includes(state)) return { state: 'underpaid', note: 'Paid less than the invoice total.' };
  if (['overpaid'].includes(state)) return { state: 'needs_review', note: 'Paid more than the invoice total.' };
  return { state: 'needs_review', note: 'Unknown invoice state: ' + state.slice(0, 40) };
}
