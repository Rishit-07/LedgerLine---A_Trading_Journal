import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import test from 'node:test';
import pg from 'pg';
import {createStreakApi} from '../src/streak-api.js';
import {createStreakStore} from '../src/streak-store.js';
import {createWorkspaceApi} from '../src/workspace.js';

test('badge shelf and portfolio use earned, owner-selected badges only',{skip:!process.env.STREAK_TEST_DATABASE_URL},async()=>{
  const db=new pg.Pool({connectionString:process.env.STREAK_TEST_DATABASE_URL});
  const owner=randomUUID(),other=randomUUID();
  let uid=owner;
  const authenticate=async()=>({uid});
  const streak=createStreakApi(db,authenticate,createStreakStore(db));
  const workspace=createWorkspaceApi(db,authenticate);
  async function call(handler,url,body){
    const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);
    Object.assign(req,{url,headers:{'content-type':'application/json'}});
    let status,result;
    await handler(req,{writeHead:value=>{status=value;},end:value=>{result=JSON.parse(value);}});
    return {status,result};
  }
  try{
    for(const user of [owner,other]){
      await db.query('INSERT INTO ledgerline_accounts(firebase_uid) VALUES($1)',[user]);
      await db.query("INSERT INTO user_profile(user_id,timezone,onboarded_at) VALUES($1,'UTC',now())",[user]);
    }
    const {rows:[{slug}]}=await db.query("INSERT INTO portfolios(user_id,visibility) VALUES($1,'link') RETURNING slug",[owner]);
    await db.query("INSERT INTO badges_earned(user_id,badge_key) VALUES($1,'streak-7')",[owner]);
    const publicPage=()=>call(workspace.publicPortfolio,'/api/portfolio/public?slug='+slug);
    assert.deepEqual((await publicPage()).result.badges,[]);
    const shelf=await call(streak.badgeShelf,'/api/streak/badges');
    assert.equal(shelf.result.items.find(item=>item.key==='streak-7').name,'First week');
    assert.equal(shelf.result.items.some(item=>item.category==='Community'),false);
    const update=(key,shared)=>call(streak.badgeVisibility,'/api/streak/badges',{key,shared});
    uid=other;
    assert.equal((await update('streak-7',true)).status,404);
    uid=owner;
    assert.equal((await update('streak-30',true)).status,404);
    assert.equal((await update('streak-7',true)).result.shared,true);
    const [badge]=(await publicPage()).result.badges;
    assert.deepEqual(Object.keys(badge).sort(),['earnedAt','name']);
    assert.equal(badge.name,'First week');
    await update('streak-7',false);
    assert.deepEqual((await publicPage()).result.badges,[]);
    await db.query("UPDATE portfolios SET visibility='private' WHERE user_id=$1",[owner]);
    assert.equal((await publicPage()).status,404);
  }finally{
    await db.query('DELETE FROM ledgerline_accounts WHERE firebase_uid=ANY($1)',[[owner,other]]);
    await db.end();
  }
});
