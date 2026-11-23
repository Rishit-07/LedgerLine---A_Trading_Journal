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
  await createOnboardingHandler({}, async () => ({ uid: 'user', email_verified: true }))(request, response);
  assert.equal(result, 403);
});
