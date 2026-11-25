/* Signed links for the newsletter. A token is "<subscriber id>.<expiry>.<MAC>". Confirmation links last 48 hours;
   manage and unsubscribe links do not expire, so an old email can always unsubscribe. */
import { createHmac, timingSafeEqual } from 'node:crypto';

export const CONFIRM_HOURS = 48;
const secret = (env) => {
  const key = env.NEWSLETTER_SECRET ?? env.FIELD_ENCRYPTION_KEY;
  if (!key) throw Object.assign(new Error('not configured'), { code: 'newsletter_unconfigured' });
  return key;
};
export const available = (env = process.env) => Boolean(env.NEWSLETTER_SECRET ?? env.FIELD_ENCRYPTION_KEY);
const mac = (purpose, id, expires, env) => createHmac('sha256', secret(env)).update(`ledgerline-newsletter|${purpose}|${id}|${expires}`).digest('base64url');

export function makeToken(purpose, id, env = process.env, now = Date.now()) {
  const expires = purpose === 'confirm' ? now + CONFIRM_HOURS * 3600_000 : 0;
  return `${id}.${expires}.${mac(purpose, id, expires, env)}`;
}
/** Returns the subscriber id, or null if the token is forged, for another purpose or expired. */
export function readToken(purpose, token, env = process.env, now = Date.now()) {
  if (typeof token !== 'string' || token.length > 200 || !available(env)) return null;
  const [id, expires, given, extra] = token.split('.');
  if (!/^\d{1,15}$/.test(id ?? '') || !/^\d{1,16}$/.test(expires ?? '') || !given || extra !== undefined) return null;
  const good = Buffer.from(mac(purpose, id, expires, env));
  const have = Buffer.from(given);
  if (good.length !== have.length || !timingSafeEqual(good, have)) return null;
  if (purpose === 'confirm' && Number(expires) <= now) return null;
  return id;
}
