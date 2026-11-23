import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { createOnboardingHandler } from '../src/onboarding.js';

test('onboarding requires the verified phone claim even when the request includes a phone number', async () => {
  const request = Readable.from([Buffer.from(JSON.stringify({ step: 4, phone_number: '+15555550100' }))]);
  request.method = 'PUT';
  request.headers = { 'content-type': 'application/json' };
  let result;
  const response = { writeHead(status) { result = status; }, end() {} };
  await createOnboardingHandler({}, async () => ({ uid: 'user', email_verified: true }), true)(request, response);
  assert.equal(result, 403);
});

test('Spark onboarding saves a contact number without an SMS claim', async () => {
  const request = Readable.from([Buffer.from(JSON.stringify({step: 1, displayName: 'Trader', contactPhone: '+15555550100'}))]);
  request.method = 'PUT';
  request.headers = { 'content-type': 'application/json' };
  let saved;
  const db = {
    async query(sql, values) {
      if (sql.includes('INSERT INTO user_profile')) saved = values;
      return {rowCount: 1, rows: []};
    },
    release() {}
  };
  const response = {writeHead(status) { assert.equal(status, 200); }, end() {}};
  await createOnboardingHandler({connect: async () => db}, async () => ({uid: 'user', email_verified: true}), false)(request, response);
  assert.deepEqual(saved, ['user', 'Trader', '+15555550100']);
});
