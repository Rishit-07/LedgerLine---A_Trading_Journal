import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { decryptField, encryptField, isEncrypted } from '../src/field-crypto.js';
import { configureErrorReport, reportError } from '../src/error-report.js';
import { createSharedLimiter } from '../src/guard.js';
import { createAppCheckGate } from '../src/app-check.js';

const env = { FIELD_ENCRYPTION_KEY: randomBytes(32).toString('base64') };

test('field encryption round trips, hides the value and differs each time', () => {
  const a = encryptField('22AAAAA0000A1Z5', env);
  assert.ok(isEncrypted(a));
  assert.ok(!a.includes('22AAAAA'));
  assert.notEqual(a, encryptField('22AAAAA0000A1Z5', env));
  assert.equal(decryptField(a, env), '22AAAAA0000A1Z5');
});

test('field encryption is off without a key, reads plain values, and rejects tampering', () => {
  assert.equal(encryptField('x', {}), 'x');
  assert.equal(decryptField('plain value', {}), 'plain value');
  assert.equal(encryptField('', env), '');
  const a = encryptField('secret', env);
  const bad = a.slice(0, -2) + (a.endsWith('AA') ? 'BB' : 'AA');
  assert.throws(() => decryptField(bad, env));
  assert.throws(() => decryptField(a, { FIELD_ENCRYPTION_KEY: randomBytes(32).toString('base64') }));
  assert.throws(() => encryptField('x', { FIELD_ENCRYPTION_KEY: 'short' }));
});

test('error reports contain no message text', async () => {
  const sent = [];
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init) => { sent.push({ url, body: JSON.parse(init.body) }); return { ok: true }; };
  try {
    assert.equal(configureErrorReport('https://abc123@o1.ingest.example.io/42', {}), true);
    reportError(Object.assign(new Error('user rishit@example.com failed card 4111'), { code: 'X9' }));
    assert.equal(sent.length, 1);
    assert.equal(sent[0].url, 'https://o1.ingest.example.io/api/42/store/');
    assert.ok(!JSON.stringify(sent[0].body).includes('rishit@example.com'));
    assert.ok(!JSON.stringify(sent[0].body).includes('4111'));
    configureErrorReport('', {});
    reportError(new Error('x'));
    assert.equal(sent.length, 1, 'off without a DSN');
  } finally { globalThis.fetch = original; }
});

test('shared limiter counts through the store and falls back when it is down', async () => {
  let count = 0;
  const up = async () => ({ ok: true, json: async () => [{ result: ++count }, { result: 1 }] });
  const limiter = createSharedLimiter({ url: 'https://r.example', token: 't', windowMs: 60000, max: 2, fallback: () => ({ allowed: true, retryAfter: 1 }), fetchImpl: up });
  assert.equal((await limiter('k')).allowed, true);
  assert.equal((await limiter('k')).allowed, true);
  assert.equal((await limiter('k')).allowed, false);
  const down = createSharedLimiter({ url: 'https://r.example', token: 't', windowMs: 60000, max: 2, fallback: () => ({ allowed: 'fallback', retryAfter: 1 }), fetchImpl: async () => { throw new Error('down'); } });
  assert.equal((await down('k')).allowed, 'fallback');
});

test('app check gate is open when not enforced', async () => {
  const gate = createAppCheckGate({}, { enforce: false });
  assert.equal(await gate({ headers: {} }, {}, '/api/anything'), true);
});
