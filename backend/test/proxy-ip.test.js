import test from 'node:test';
import assert from 'node:assert/strict';
import { clientAddress } from '../src/guard.js';

const req = (headers = {}, ip = '10.0.0.9') => ({ headers, socket: { remoteAddress: ip } });
const env = { PROXY_KEY: 'k'.repeat(32) };

test('the forwarded visitor address is trusted only with the right key', () => {
  const good = req({ 'x-ledgerline-proxy-key': env.PROXY_KEY, 'x-ledgerline-client-ip': '203.0.113.5' });
  assert.equal(clientAddress(good, false, env), '203.0.113.5');
  const wrong = req({ 'x-ledgerline-proxy-key': 'x'.repeat(32), 'x-ledgerline-client-ip': '203.0.113.5' });
  assert.equal(clientAddress(wrong, false, env), '10.0.0.9');
  assert.equal(clientAddress(req({ 'x-ledgerline-client-ip': '203.0.113.5' }), false, env), '10.0.0.9');
});

test('without PROXY_KEY the headers are ignored', () => {
  const spoof = req({ 'x-ledgerline-proxy-key': 'anything', 'x-ledgerline-client-ip': '203.0.113.5' });
  assert.equal(clientAddress(spoof, false, {}), '10.0.0.9');
});

test('a key of a different length does not throw', () => {
  assert.equal(clientAddress(req({ 'x-ledgerline-proxy-key': 'short', 'x-ledgerline-client-ip': '1.1.1.1' }), false, env), '10.0.0.9');
});
