import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {cryptoConfig,validCryptoEvent} from '../src/report-crypto.js';

test('prepaid checkout requires a hosted callback, provider secrets and an approved price',()=>{
 const env={PUBLIC_APP_URL:'https://example.test',NOWPAYMENTS_API_KEY:'test',NOWPAYMENTS_IPN_SECRET:'test',PRO_MONTHLY_PRICE_PAISE:'15000'};
 assert.equal(cryptoConfig(env,'monthly'),15000);assert.equal(cryptoConfig(env,'yearly'),null);
 assert.equal(cryptoConfig({...env,PUBLIC_APP_URL:'http://localhost'},'monthly'),null);
});
test('crypto notification verifies the sorted payload, including amount',()=>{
 const secret='fixture',sig=createHmac('sha512',secret).update('{"amount":100,"order":"test"}').digest('hex');
 assert.ok(validCryptoEvent({order:'test',amount:100},sig,secret));assert.equal(validCryptoEvent({order:'test',amount:90},sig,secret),false);
});
