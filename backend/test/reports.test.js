import test from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {authorize,checkQuota,insufficient,validateReport,generateReport} from '../src/reports.js';
import {verifySignature} from '../src/report-billing.js';

test('AI off and free direct calls are rejected before generation',()=>{
 assert.throws(()=>authorize({plan:'pro',enabled:false},'full'),{status:403});
 assert.throws(()=>authorize({plan:'free',enabled:true},'full'),{status:403});
 authorize({plan:'free',enabled:true},'summary');
});
test('both minimum sample thresholds and weekly/monthly budgets are enforced',()=>{
 assert.ok(insufficient({trades:9,days:4}));assert.ok(insufficient({trades:12,days:2}));assert.equal(insufficient({trades:10,days:3}),false);
 assert.throws(()=>checkQuota({plan:'free',weekly_used:true}),{status:429});
 assert.throws(()=>checkQuota({plan:'mentor',used:30}),{status:429});
});
const facts=[{metric:'process_score',value:72,ids:['517']}];
const output=()=>({summary:'Review your checklist.',observations:[{text:'Look at process consistency.',metric:'process_score',value:72,trade_ids:['e0']}],focus:'Revisit your written rules.'});
test('validate evidence, citations and prose before replacing aliases with real trade links',()=>{
 assert.deepEqual(validateReport(JSON.stringify(output()),facts).observations[0].trade_ids,['517']);
 for(const edit of [r=>r.observations[0].value++,r=>r.focus='Score rose 90%',r=>r.observations[0].trade_ids=['foreign']]){
  const r=output();edit(r);assert.throws(()=>validateReport(JSON.stringify(r),facts));
 }
});
test('invalid model output is retried once',async()=>{
 let calls=0;await assert.rejects(generateReport({kind:'full',facts},{},async()=>{calls++;return '{}';}),{status:502});assert.equal(calls,2);
});
test('webhook signature binds raw bytes and requires a configured secret',()=>{
 const raw=Buffer.from('{"event":"subscription.charged"}'),sig=createHmac('sha256','test').update(raw).digest('hex');
 assert.ok(verifySignature(raw,sig,'test'));assert.equal(verifySignature(Buffer.from('{}'),sig,'test'),false);assert.equal(verifySignature(raw,sig,''),false);
});
