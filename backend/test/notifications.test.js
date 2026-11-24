import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedText } from '../src/notifications.js';
import { KINDS, lockedKinds, switchableKinds } from '../src/notification-kinds.js';

test('trade results and tips never go in a notification', () => {
  assert.equal(allowedText('community', 'Isha accepted your streak battle', 'Days logged decide it'), true);
  assert.equal(allowedText('streak_risk', 'You made ₹5,000 today'), false);
  assert.equal(allowedText('rewards', 'Buy RELIANCE now'), false);
  assert.equal(allowedText('journal_reminder', 'P&L is up'), false);
});
test('plan prices are allowed on billing notices only', () => {
  assert.equal(allowedText('billing', 'Your Pro plan renews on 14 Dec', 'Rs 149 per month'), true);
  assert.equal(allowedText('community', 'Rs 149 per month'), false);
});
test('safety kinds are locked and cannot be muted', () => {
  assert.deepEqual(lockedKinds().sort(), ['billing', 'loss_limit', 'security']);
  for (const kind of lockedKinds()) assert.ok(!switchableKinds(KINDS[kind].category).includes(kind));
  assert.deepEqual(switchableKinds(0).sort(), ['journal_reminder', 'streak_risk']);
});
