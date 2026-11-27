import test from 'node:test';
import assert from 'node:assert/strict';
import { createTurnstile } from '../src/turnstile.js';

const reply = () => { const r = { status: 0, body: '' , writeHead(s) { this.status = s; }, setHeader() {}, end(b) { this.body = b; } }; return r; };
const req = (token) => ({ headers: token ? { 'x-turnstile-token': token } : {} });
const answer = (body, ok = true) => async () => ({ ok, json: async () => body });

test('off without a secret: the handler always runs', async () => {
  const t = createTurnstile({}, () => assert.fail('must not call Cloudflare'));
  let ran = 0;
  await t.gate(() => { ran++; })(req(), reply());
  assert.equal(ran, 1);
  assert.equal(t.enabled, false);
});

test('missing or refused token is rejected with 403', async () => {
  const t = createTurnstile({ TURNSTILE_SECRET_KEY: 's' }, answer({ success: false }));
  let ran = 0; const res = reply();
  await t.gate(() => { ran++; })(req(), res);
  assert.equal(res.status, 403);
  const res2 = reply();
  await t.gate(() => { ran++; })(req('bad'), res2);
  assert.equal(res2.status, 403);
  assert.equal(ran, 0);
});

test('a good token lets the handler run', async () => {
  const t = createTurnstile({ TURNSTILE_SECRET_KEY: 's' }, answer({ success: true }));
  let ran = 0;
  await t.gate(() => { ran++; })(req('good'), reply());
  assert.equal(ran, 1);
});

test('if Cloudflare cannot be reached the request is let through', async () => {
  const down = createTurnstile({ TURNSTILE_SECRET_KEY: 's' }, async () => { throw new Error('offline'); });
  const bad = createTurnstile({ TURNSTILE_SECRET_KEY: 's' }, answer({}, false));
  let ran = 0;
  await down.gate(() => { ran++; })(req('x'), reply());
  await bad.gate(() => { ran++; })(req('x'), reply());
  assert.equal(ran, 2);
});

test('an oversized token is refused without calling Cloudflare', async () => {
  const t = createTurnstile({ TURNSTILE_SECRET_KEY: 's' }, () => assert.fail('no call'));
  const res = reply();
  await t.gate(() => {})(req('a'.repeat(3000)), res);
  assert.equal(res.status, 403);
});
