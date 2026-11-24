import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { base32Decode, base32Encode, codeAt, matchStep, newSecret, otpauthUrl } from '../src/totp.js';
import { checkSession, mintSession, newRecoveryCodes } from '../src/two-step.js';

const env = { FIELD_ENCRYPTION_KEY: randomBytes(32).toString('base64') };

test('matches the RFC 6238 test vector (SHA-1)', () => {
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  assert.equal(codeAt(secret, Math.floor(59 / 30), 8), '94287082');
  assert.equal(codeAt(secret, Math.floor(1111111109 / 30), 8), '07081804');
  assert.equal(codeAt(secret, Math.floor(20000000000 / 30), 8), '65353130');
});

test('base32 round trips', () => {
  const bytes = randomBytes(20);
  assert.deepEqual(base32Decode(base32Encode(bytes)), bytes);
});

test('a code is accepted one step either side and not beyond', () => {
  const secret = newSecret();
  const now = 1_700_000_000_000;
  const step = Math.floor(now / 30000);
  assert.equal(matchStep(secret, codeAt(secret, step), now), step);
  assert.equal(matchStep(secret, codeAt(secret, step - 1), now), step - 1);
  assert.equal(matchStep(secret, codeAt(secret, step + 1), now), step + 1);
  assert.equal(matchStep(secret, codeAt(secret, step + 3), now), null);
  assert.equal(matchStep(secret, '12345', now), null);
  assert.equal(matchStep(secret, 'abcdef', now), null);
});

test('otpauth link names the app and the account', () => {
  const url = otpauthUrl('ABC234', 'me@example.com');
  assert.match(url, /^otpauth:\/\/totp\/Ledgerline:me%40example\.com\?secret=ABC234&issuer=Ledgerline/);
});

test('second-step session is bound to the person, the sign-in and the clock', () => {
  const now = 1_700_000_000_000;
  const token = mintSession('u1', 1234, env, now);
  assert.equal(checkSession(token, 'u1', 1234, env, now + 1000), true);
  assert.equal(checkSession(token, 'u2', 1234, env, now + 1000), false, 'other person');
  assert.equal(checkSession(token, 'u1', 9999, env, now + 1000), false, 'a newer sign-in must ask again');
  assert.equal(checkSession(token, 'u1', 1234, env, now + 13 * 3600_000), false, 'expired');
  assert.equal(checkSession(token + 'x', 'u1', 1234, env, now), false, 'tampered');
  assert.equal(checkSession(token, 'u1', 1234, { FIELD_ENCRYPTION_KEY: randomBytes(32).toString('base64') }, now), false, 'other key');
  assert.equal(checkSession(undefined, 'u1', 1234, env, now), false);
  assert.equal(checkSession(token, 'u1', 1234, {}, now), false, 'no key');
});

test('recovery codes look right and are unique', () => {
  const codes = newRecoveryCodes();
  assert.equal(codes.length, 8);
  assert.equal(new Set(codes).size, 8);
  for (const code of codes) assert.match(code, /^[a-f0-9]{5}-[a-f0-9]{5}$/);
});
