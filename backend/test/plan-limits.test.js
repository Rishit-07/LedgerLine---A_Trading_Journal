import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FEATURE_LIMITS, FREE_MT_IMPORTS_PER_MONTH } from '../src/billing-config.js';

const plans = readFileSync(new URL('../../src/config/plans.ts', import.meta.url), 'utf8');
const landing = readFileSync(new URL('../../frontend/index.html', import.meta.url), 'utf8');

test('plan copy quotes the same limits the server enforces', () => {
  for (const text of [plans, landing]) {
    assert.ok(text.includes(`${FEATURE_LIMITS.replay.paid}`) && text.includes(`${FEATURE_LIMITS.mistake.paid}`) && text.includes(`${FEATURE_LIMITS.coach.paid}`));
    assert.ok(text.includes(`${FREE_MT_IMPORTS_PER_MONTH} trades a month`));
    assert.ok(new RegExp(`${FEATURE_LIMITS.replay.free} uses each a month`).test(text));
  }
});
