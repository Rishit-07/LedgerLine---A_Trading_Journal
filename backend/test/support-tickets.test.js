import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanDiagnostics, reference } from '../src/support-tickets.js';

test('diagnostics keep only known fields, as short plain text', () => {
  const out = cleanDiagnostics({ page: '/journal\n', userAgent: 'U'.repeat(999), secret: 'no', token: 'no', recentErrors: Array(9).fill('boom') });
  assert.equal(out.page, '/journal');
  assert.equal(out.userAgent.length, 300);
  assert.equal(out.secret, undefined);
  assert.equal(out.token, undefined);
  assert.equal(out.recentErrors.length, 5);
});
test('diagnostics tolerate junk input', () => {
  assert.deepEqual(cleanDiagnostics(null), {});
  assert.deepEqual(cleanDiagnostics([1, 2]), {});
  assert.deepEqual(cleanDiagnostics('x'), {});
});
test('ticket reference', () => assert.equal(reference(42), 'LL-42'));
