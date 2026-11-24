/* Encrypts a few sensitive text fields (billing address, GST number) before they reach the database, so a leaked
   backup or a read-only database login does not expose them. AES-256-GCM, a new random value each time.
   Needs FIELD_ENCRYPTION_KEY: 32 random bytes, base64 (generate with: node -e "console.log(crypto.randomBytes(32).toString('base64'))").
   Without the key nothing is encrypted, and existing plain values still read fine, so it can be switched on later. */
import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

const PREFIX = 'enc:v1:';

function keyFrom(env) {
  const raw = env.FIELD_ENCRYPTION_KEY;
  if (!raw) return null;
  const key = Buffer.from(raw, 'base64');
  if (key.length !== 32) throw new Error('FIELD_ENCRYPTION_KEY must be 32 bytes, base64 encoded.');
  return key;
}

export function encryptField(value, env = process.env) {
  const key = keyFrom(env);
  if (!key || value === null || value === undefined || value === '' || String(value).startsWith(PREFIX)) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const data = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  return PREFIX + [iv, cipher.getAuthTag(), data].map((part) => part.toString('base64url')).join('.');
}

export function decryptField(value, env = process.env) {
  if (typeof value !== 'string' || !value.startsWith(PREFIX)) return value;
  const key = keyFrom(env);
  if (!key) throw new Error('This value is encrypted but FIELD_ENCRYPTION_KEY is not set.');
  const [iv, tag, data] = value.slice(PREFIX.length).split('.').map((part) => Buffer.from(part, 'base64url'));
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

export const isEncrypted = (value) => typeof value === 'string' && value.startsWith(PREFIX);
