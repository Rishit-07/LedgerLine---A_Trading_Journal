import test from 'node:test';
import assert from 'node:assert/strict';
import {sign,verifyWebhook,classify,webhookUrl} from '../src/coinpayments.js';
import {priceFor,PRICES} from '../src/billing-config.js';

const env={COINPAYMENTS_CLIENT_ID:'cid',COINPAYMENTS_CLIENT_SECRET:'secret',PUBLIC_APP_URL:'https://app.example'};
const now=Date.parse('2026-11-26T10:00:00Z');
const headers=(raw,ts='2026-11-26T10:00:00',secret='secret')=>({'x-coinpayments-client':'cid','x-coinpayments-timestamp':ts,'x-coinpayments-signature':sign(secret,{method:'POST',url:webhookUrl(env),clientId:'cid',timestamp:ts,body:raw.toString()})});

test('webhook signature covers the raw body, the registered URL and a fresh timestamp',()=>{
 const raw=Buffer.from('{"type":"InvoiceCompleted"}');
 assert.ok(verifyWebhook(raw,headers(raw),env,now));
 assert.equal(verifyWebhook(Buffer.from('{"type":"InvoiceCompleted","x":1}'),headers(raw),env,now),false);
 assert.equal(verifyWebhook(raw,headers(raw,'2026-11-26T10:00:00','wrong'),env,now),false);
 assert.equal(verifyWebhook(raw,headers(raw,'2026-11-26T09:50:00'),env,now),false);
 assert.equal(verifyWebhook(raw,{...headers(raw),'x-coinpayments-client':'other'},env,now),false);
 assert.equal(verifyWebhook(raw,headers(raw),{...env,COINPAYMENTS_CLIENT_SECRET:''},now),false);
});
test('only a Completed invoice with the right total is credited',()=>{
 assert.equal(classify({state:'Completed',amount:{total:'4.99'}},499).state,'paid');
 assert.equal(classify({state:'Completed',amount:{total:'4.00'}},499).state,'needs_review');
 assert.equal(classify({state:'Paid'},499).state,'confirming');
 assert.equal(classify({state:'Pending'},499).state,'confirming');
 assert.equal(classify({state:'TimedOut'},499).state,'expired');
 assert.equal(classify({state:'Cancelled'},499).state,'cancelled');
 assert.equal(classify({state:'Mystery'},499).state,'needs_review');
});
test('intro price: one monthly period at a time, twice, never for 3 months or a year',()=>{
 assert.deepEqual(priceFor('pro',1,0),{cents:PRICES.pro.intro,intro:1});
 assert.deepEqual(priceFor('pro',1,1),{cents:PRICES.pro.intro,intro:1});
 assert.deepEqual(priceFor('pro',1,2),{cents:PRICES.pro.monthly,intro:0});
 assert.deepEqual(priceFor('mentor',3,0),{cents:PRICES.mentor.monthly*3,intro:0});
 assert.deepEqual(priceFor('mentor',12,0),{cents:PRICES.mentor.yearly,intro:0});
 assert.equal(priceFor('free',1,0),null);assert.equal(priceFor('pro',2,0),null);
});
