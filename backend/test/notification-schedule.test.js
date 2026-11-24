import test from 'node:test';
import assert from 'node:assert/strict';
import { deliverNow, inQuietHours, localHour } from '../src/notification-schedule.js';

const at = (iso) => new Date(iso);
test('local hour follows the time zone', () => {
  assert.equal(localHour(at('2026-11-24T16:30:00Z'), 'Asia/Kolkata'), 22);
  assert.equal(localHour(at('2026-11-24T16:30:00Z'), 'UTC'), 16);
  assert.equal(localHour(at('2026-11-24T16:30:00Z'), 'Not/AZone'), 22);
});
test('quiet hours cross midnight', () => {
  const tz = 'Asia/Kolkata';
  assert.equal(inQuietHours('22-07', at('2026-11-24T16:30:00Z'), tz), true);   // 22:00
  assert.equal(inQuietHours('22-07', at('2026-11-24T01:29:00Z'), tz), true);   // 06:59
  assert.equal(inQuietHours('22-07', at('2026-11-24T01:30:00Z'), tz), false);  // 07:00
  assert.equal(inQuietHours('23-06', at('2026-11-24T16:30:00Z'), tz), false);  // 22:00
  assert.equal(inQuietHours('off', at('2026-11-24T20:00:00Z'), tz), false);
});
test('daily summary waits until 8 pm and respects quiet hours', () => {
  const s = { quiet: 'off', delivery: 'daily', tz: 'Asia/Kolkata' };
  assert.equal(deliverNow(s, at('2026-11-24T09:00:00Z')), false); // 14:30
  assert.equal(deliverNow(s, at('2026-11-24T14:30:00Z')), true);  // 20:00
  assert.equal(deliverNow({ ...s, quiet: '23-06', delivery: 'instant' }, at('2026-11-24T18:00:00Z')), false); // 23:30
  assert.equal(deliverNow({ ...s, delivery: 'instant' }, at('2026-11-24T09:00:00Z')), true);
});
