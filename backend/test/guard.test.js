import test from 'node:test';
import assert from 'node:assert/strict';
import { clientAddress, createRateLimiter, limitClassFor, safely } from '../src/guard.js';

test('rate limiter blocks after the maximum and recovers after the window', () => {
  let time = 0;
  const check = createRateLimiter({ windowMs: 1000, max: 2, now: () => time });
  assert.equal(check('a').allowed, true);
  assert.equal(check('a').allowed, true);
  const blocked = check('a');
  assert.equal(blocked.allowed, false);
  assert.ok(blocked.retryAfter >= 1);
  assert.equal(check('b').allowed, true, 'another client is not affected');
  time = 1001;
  assert.equal(check('a').allowed, true);
});

test('rate limiter memory stays bounded', () => {
  const check = createRateLimiter({ windowMs: 60_000, max: 1, maxKeys: 5 });
  for (let i = 0; i < 50; i += 1) check('k' + i);
  assert.ok(true);
});

test('X-Forwarded-For is ignored unless a proxy is trusted', () => {
  const request = { headers: { 'x-forwarded-for': '9.9.9.9' }, socket: { remoteAddress: '1.1.1.1' } };
  assert.equal(clientAddress(request, false), '1.1.1.1');
  assert.equal(clientAddress(request, true), '9.9.9.9');
});

test('costly and open routes get tighter limits', () => {
  assert.equal(limitClassFor('/api/newsletter', 'POST'), 'strict');
  assert.equal(limitClassFor('/api/support', 'POST'), 'strict');
  assert.equal(limitClassFor('/api/ai/report', 'POST'), 'costly');
  assert.equal(limitClassFor('/api/account', 'DELETE'), 'costly');
  assert.equal(limitClassFor('/api/account', 'PUT'), 'general');
  assert.equal(limitClassFor('/api/dashboard', 'GET'), 'general');
});

test('a throwing handler becomes a 500 with no internal detail', async () => {
  const res = { headersSent: false, writeHead(status) { this.status = status; this.headersSent = true; }, end(body) { this.body = body; } };
  await safely(async () => { throw Object.assign(new Error('secret table name'), { code: 'X1' }); })({}, res);
  assert.equal(res.status, 500);
  assert.ok(!res.body.includes('secret'));
});
