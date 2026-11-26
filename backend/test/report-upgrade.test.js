import test from 'node:test';
import assert from 'node:assert/strict';
import {Readable} from 'node:stream';
import {randomUUID,createHmac} from 'node:crypto';
import pg from 'pg';
import {reportApi,generateReport} from '../src/reports.js';

test('an active Pro plan unlocks a cited report; cached reads are idempotent',{skip:!process.env.STREAK_TEST_DATABASE_URL},async()=>{
 const pool=new pg.Pool({connectionString:process.env.STREAK_TEST_DATABASE_URL}),uid='report-test-'+randomUUID();
 const auth=async()=>({uid});
 const api=reportApi(pool,auth,{provider:{model:'fixture'},generate:(input,config)=>generateReport(input,config,async()=>{
   const fact=input.facts[0];return JSON.stringify({summary:'Review your process.',observations:[{text:'Review the recorded checks.',metric:fact.metric,value:fact.value,trade_ids:['e0']}],focus:'Revisit the checklist.'});
 })});
 async function call(handler,url,method,data,headers={}){
   const req=Readable.from(data?[Buffer.from(JSON.stringify(data))]:[]);Object.assign(req,{url,method,headers:{'content-type':'application/json',...headers}});
   let status,body;await handler(req,{writeHead:s=>{status=s;},end:b=>{body=JSON.parse(b);}});return {status,body};
 }
 try{
   await pool.query('INSERT INTO ledgerline_accounts(firebase_uid) VALUES($1)',[uid]);
   await pool.query("INSERT INTO user_profile(user_id,timezone,max_trades_per_day) VALUES($1,'UTC',5)",[uid]);
   await pool.query("INSERT INTO trades(user_id,opened_at,market,symbol,side) SELECT $1,now(),'stocks','QA','long' FROM generate_series(1,10)",[uid]);
   await pool.query("INSERT INTO streak_days(user_id,day,kind) SELECT $1,current_date-i,'trade' FROM generate_series(0,2)i",[uid]);
   const body={kind:'full',period:'month'};
   assert.equal((await call(api,'/api/ai/report','POST',body)).status,403);
   await call(api,'/api/reports/preferences','PUT',{enabled:true});
   assert.equal((await call(api,'/api/ai/report','POST',body)).status,403);
   await pool.query("INSERT INTO report_subscriptions(user_id,plan,valid_until) VALUES($1,'pro',now()+interval '30 days')",[uid]);
   const fresh=await call(api,'/api/ai/report','POST',body);assert.equal(fresh.status,200);
   if(fresh.body.insufficient_data){assert.ok(new Date().getUTCDate()<3);return;}
   assert.equal(fresh.body.output.observations[0].trade_ids.length,10);
   assert.equal((await call(api,'/api/ai/report','POST',body)).body.id,fresh.body.id);
   assert.equal((await pool.query('SELECT * FROM ai_review_usage WHERE user_id=$1',[uid])).rowCount,1);
 }finally{
   await pool.query('DELETE FROM ledgerline_accounts WHERE firebase_uid=$1',[uid]);await pool.end();
 }
});
