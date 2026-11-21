import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID,createHmac} from 'node:crypto';
import {Readable} from 'node:stream';
import pg from 'pg';
import {billingApi} from '../src/report-billing.js';

test('billing scopes mentor checkout, invoices and prepaid state to the owner',{skip:!process.env.STREAK_TEST_DATABASE_URL},async()=>{
 const db=new pg.Pool({connectionString:process.env.STREAK_TEST_DATABASE_URL}),uid='billing-test-'+randomUUID();
 const env={NOWPAYMENTS_IPN_SECRET:'test-secret'};
 const api=billingApi(db,async()=>({uid}),env);
 async function call(path,body,sig){
  const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);Object.assign(req,{url:'/api/billing/'+path,method:body?'POST':'GET',headers:{'content-type':'application/json','x-nowpayments-sig':sig}});
  let status,result;await api(req,{writeHead:s=>{status=s;},end:b=>{result=JSON.parse(b);}});return {status,result};
 }
 try{
  await db.query('INSERT INTO ledgerline_accounts(firebase_uid) VALUES($1)',[uid]);
  assert.equal((await call('checkout',{plan:'mentor',method:'Card',term:'monthly'})).result.reason,'needs_verification');
  const {rows:[order]}=await db.query("INSERT INTO report_checkouts(user_id,term,plan_ref,method,provider_ref,price_paise,months) VALUES($1,'monthly','crypto-pro','Crypto',$2,14900,3) RETURNING id",[uid,uid]);
  const event={order_id:order.id,payment_id:uid,pay_currency:'usdcmatic',price_currency:'inr',price_amount:149,pay_amount:2,actually_paid:1};
  for(const [input,state] of [['finished','underpaid'],['expired','expired'],['finished','paid'],['finished','paid']]){
   event.payment_status=input;if(state==='paid')event.actually_paid=2;
   const sorted=Object.fromEntries(Object.entries(event).sort(([a],[b])=>a.localeCompare(b)));
   const sig=createHmac('sha512',env.NOWPAYMENTS_IPN_SECRET).update(JSON.stringify(sorted)).digest('hex');
   assert.equal((await call('crypto/webhook',event,sig)).status,200);
   const {result}=await call('status?id='+order.id);assert.equal(result.payment_state,state);assert.equal(result.confirmed,state==='paid');
  }
  const {result}=await call('overview');assert.equal(result.current,'pro');assert.equal(result.invoices.length,1);
  const {result:pdf}=await call('invoice?id='+result.invoices[0].id);assert.equal(Buffer.from(pdf.pdf,'base64').subarray(0,4).toString(),'%PDF');
 }finally{await db.query('DELETE FROM ledgerline_accounts WHERE firebase_uid=$1',[uid]);await db.end();}
});
import {legacyBillingRoute} from '../../frontend/src/features/billing/route.js';
test('legacy billing paths and tab links redirect once',()=>{
 assert.equal(legacyBillingRoute('/settings/billing',''),true);
 assert.equal(legacyBillingRoute('/settings','?tab=billing'),true);
 assert.equal(legacyBillingRoute('/billing',''),false);
 assert.equal(legacyBillingRoute('/settings','?tab=privacy'),false);
});
