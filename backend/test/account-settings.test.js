import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import pg from 'pg';
import { createOnboardingHandler } from '../src/onboarding.js';
test('settings persist to the verified profile without reopening onboarding or editing another user', {
  skip:!process.env.STREAK_TEST_DATABASE_URL
},async()=>{
  const db=new pg.Client({connectionString:process.env.STREAK_TEST_DATABASE_URL});
  await db.connect();
  try {
    await db.query('BEGIN');
    const uid=randomUUID(),other=randomUUID();
    await db.query('INSERT INTO ledgerline_accounts(firebase_uid) SELECT unnest($1::text[])',[[uid,other]]);
    const pool={query:(...args)=>db.query(...args),connect:async()=>({release(){},query:(sql,values)=>db.query(({BEGIN:'SAVEPOINT settings',COMMIT:'RELEASE SAVEPOINT settings',ROLLBACK:'ROLLBACK TO SAVEPOINT settings'})[sql]??sql,values)})};
    const handler=createOnboardingHandler(pool,req=>({uid:req.uid}));
    async function call(user,body){
      const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);
      Object.assign(req,{uid:user,method:body?'PUT':'GET',headers:{'content-type':'application/json'}});
      const res={writeHead(status){this.status=status},end(data){this.data=JSON.parse(data)}};
      await handler(req,res);return res;
    }
    const rules={risk:.5,loss:2,trades:3,hardRules:['loss']};
    for(const body of [{step:1,displayName:'First'},{step:2,markets:['stocks']},{step:3,...rules},{step:4}]) assert.equal((await call(uid,body)).status,200);
    const completed=(await call(uid)).data.completedAt;
    assert.equal((await call(uid,{section:'account',displayName:'New name',markets:['forex'],user_id:other})).status,200);
    assert.equal((await call(uid,{section:'rules',...rules,trades:8})).status,200);
    assert.equal((await call(uid,{section:'broker',broker:'csv'})).status,200);
    assert.equal((await call(uid,{section:'rules',...rules,trades:-1})).status,400);
    assert.equal((await call(other,{section:'broker',broker:'csv'})).status,409);
    const saved=(await call(uid)).data;
    assert.deepEqual([saved.displayName,saved.markets,saved.trades,saved.hardRules,saved.broker,saved.completedAt],['New name',['forex'],8,['loss'],'csv',completed]);
    assert.equal((await call(other)).data.step,1);
  }finally{await db.query('ROLLBACK');await db.end();}
});
