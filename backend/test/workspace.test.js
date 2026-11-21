import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import pg from 'pg';
import { createWorkspaceApi } from '../src/workspace.js';
import { createCalendarHandlers } from '../src/calendar.js';

async function call(handler, uid, url, body) {
  const request = Readable.from(body ? [Buffer.from(JSON.stringify(body))] : []);
  Object.assign(request, { uid, url, method:body?'POST':'GET', headers:{'content-type':'application/json'} });
  const response = {
    writeHead(status) { this.status=status; },
    end(payload) { this.body=JSON.parse(payload); },
  };
  await handler(request,response);
  return response;
}

test('workspace uses real records, enforces ownership and only publishes selected portfolio fields', {
  skip:!process.env.STREAK_TEST_DATABASE_URL,
}, async () => {
  const db=new pg.Client({connectionString:process.env.STREAK_TEST_DATABASE_URL,connectionTimeoutMillis:5000});
  await db.connect();
  try {
    await db.query('BEGIN');
    const owner='workspace-test-'+randomUUID(),other='workspace-test-'+randomUUID();
    await db.query('INSERT INTO ledgerline_accounts (firebase_uid) SELECT unnest($1::text[])',[[owner,other]]);
    await db.query(`INSERT INTO user_profile (user_id,display_name,markets,onboarded_at)
      SELECT uid,name,ARRAY['stocks'],now() FROM unnest($1::text[],ARRAY['Portfolio Example','Second Account']) AS u(uid,name)`,[[owner,other]]);
    const {rows:[trade]}=await db.query(`INSERT INTO trades(user_id,market,symbol,side,opened_at,closed_at,r_multiple,reviewed_at)
      VALUES($1,'stocks','PRIVATE SYMBOL','long',now(),now(),1.3,now()) RETURNING id::text`,[owner]);
    const api=createWorkspaceApi(db,(req,res)=>{
      if(req.uid)return {uid:req.uid};
      res.writeHead(401);res.end('{}');
    });
    const work=(page,user=owner,body)=>call(api.workspace,user,'/?page='+page,body);
    for(const page of ['history','replay','mistake','sizing','forecast','reports','portfolio','clubs','coach','plan','calendar']){
      assert.equal((await work(page)).status,200,page);
    }
    assert.equal((await work('history',other)).body.trades.length,0);
    const chatId = randomUUID();
    const coachApi = createWorkspaceApi(db,req=>({uid:req.uid}),{
      coachConfig:{provider:'Groq',key:'test',model:'test'},
      fetchCoach:async (_,options)=>{
        const {messages} = JSON.parse(options.body);
        const payload = JSON.parse(messages.at(-1).content);
        if (!payload.trades) return Response.json({usage:{total_tokens:50},choices:[{message:{content:'ALLOW'}}]});
        assert.equal(payload.trades[0].symbol,'PRIVATE SYMBOL');
        assert.ok(payload.workspace.limits);
        return Response.json({usage:{total_tokens:150},choices:[{message:{content:'Review your entry checklist [Trade 1].'}}]});
      },
    });
    const sendTurn=(question,newChat=false)=>call(coachApi.workspace,owner,'/?page=coach',{chatId,newChat,question});
    assert.equal((await sendTurn('How did I trade?',true)).status,200);
    assert.equal((await sendTurn('What can I review?')).status,200);
    assert.equal((await sendTurn('Write me a Python trading bot')).status,422);
    assert.equal((await work('coach&chatId='+chatId)).body.messages.length,2);
    assert.equal((await work('coach')).body.tokens.remaining,19600);
    const busyApi=createWorkspaceApi(db,req=>({uid:req.uid}),{coachConfig:{provider:'Groq'},fetchCoach:async()=>new Response(null,{status:429})});
    assert.equal((await call(busyApi.workspace,owner,'/?page=coach',{chatId,question:'How did I trade?'})).status,429);
    assert.equal((await work('coach')).body.tokens.remaining,19600);
    const chatAction = (user,action,values={}) => work('coach',user,{chatId,action,...values});
    assert.equal((await chatAction(other,'rename',{title:'Changed'})).status,404);
    assert.equal((await chatAction(other,'pin',{pinned:true})).status,404);
    assert.equal((await chatAction(other,'delete')).status,404);
    assert.equal((await work('coach&chatId='+chatId,other)).status,404);
    assert.equal((await chatAction(owner,'rename',{title:'My November review'})).body.title,'My November review');
    assert.equal((await chatAction(owner,'pin',{pinned:true})).body.pinned,true);
    assert.equal((await work('coach')).body.chats[0].pinned,true);
    assert.equal((await work('coach')).body.trades,undefined);
    assert.equal((await chatAction(owner,'pin',{pinned:false})).body.pinned,false);
    assert.equal((await chatAction(owner,'delete')).status,200);
    assert.equal((await work('coach&chatId='+chatId)).status,404);
    assert.equal((await db.query('SELECT id FROM coach_messages WHERE user_id=$1 AND chat_id=$2',[owner,chatId])).rowCount,0);
    assert.equal((await db.query('SELECT created_at FROM coach_requests WHERE user_id=$1',[owner])).rowCount,2);
    assert.equal((await work('coach')).body.tokens.remaining,19600);
    assert.equal((await work('coach',other)).body.tokens.remaining,20000);
    await db.query('UPDATE coach_daily_tokens SET spent=20000 WHERE user_id=$1',[owner]);
    assert.equal((await sendTurn('Review my rules',true)).status,429);
    assert.equal((await work('history')).body.trades[0].symbol,'PRIVATE SYMBOL');
    const candles=[{at:new Date().toISOString(),open:100,high:105,low:98,close:103}];
    assert.equal((await work('replay',other,{tradeId:trade.id,candles})).status,404);
    assert.equal((await work('replay',owner,{tradeId:trade.id,candles,lesson:'Keep the checklist visible.'})).status,200);
    assert.equal((await work('replay',owner,{tradeId:trade.id,lesson:'Use the checklist again.'})).status,200);
    assert.equal((await work('replay',other,{tradeId:trade.id,action:'rule',lesson:'Use the checklist.'})).status,404);
    const savedRule=(await work('replay',owner,{tradeId:trade.id,action:'rule',lesson:'Use the checklist.'})).body.rule;
    assert.ok(savedRule.id);
    assert.equal((await work('replay',owner,{tradeId:trade.id,action:'rule',lesson:'Keep the checklist handy.'})).body.rule.id,savedRule.id);
    assert.equal((await work('replay&tradeId='+trade.id)).body.candles[0].close,103);
    assert.equal((await work('history')).body.trades[0].note,'Use the checklist again.');
    assert.equal((await work('mistake',owner,{tradeId:trade.id,kind:'Early exit',note:''})).status,200);
    assert.equal((await work('sizing',owner,{win:45,payoff:2,risk:1,events:7,needed:4})).body.preset.win,45);
    const {rows:[{due}]}=await db.query("SELECT ((now() AT TIME ZONE 'Asia/Kolkata')::date+1)::text AS due");
    assert.equal((await work('forecast',owner,{symbol:'NIFTY',category:'Technical',direction:'up',probability:65,thesis:'Test',dueOn:due})).status,200);
    const forecast=(await work('forecast')).body.forecasts[0];
    assert.equal((await work('forecast',owner,{action:'resolve',id:forecast.id,outcome:true})).status,409);
    await db.query('UPDATE forecasts SET due_on=due_on-1 WHERE user_id=$1',[owner]);
    assert.equal((await work('forecast',other,{action:'resolve',id:forecast.id,outcome:true})).status,409);
    assert.equal((await work('forecast',owner,{action:'resolve',id:forecast.id,outcome:true})).status,200);
    const club=(await work('clubs',owner,{action:'create',name:'Replay review '+randomUUID().slice(0,6),description:'Review trades together.',location:''})).body.clubs.find((club)=>club.owner);
    assert.equal(club.members,1);
    assert.equal((await work('clubs',other,{action:'join',id:club.id})).body.clubs.find(({id})=>id===club.id).members,2);
    const space=(await work('spaces',owner,{action:'create',name:'Study group',description:'Review checklists',location:''})).body.clubs.find(g=>g.owner);
    const groupWrite=(uid,action,payload={})=>work('spaces',uid,{id:space.id,action,...payload});
    assert.equal((await work('clubs',other,{action:'join',id:space.id})).status,403);
    await groupWrite(owner,'goal',{body:'Review entries'});
    assert.equal((await work('spaces',other)).body.topics.some(t=>t.groupId===space.id),false);
    await groupWrite(other,'join');
    assert.equal((await groupWrite(other,'goal',{body:'Another goal'})).status,403);
    const goal=(await work('spaces',other)).body.topics.find(t=>t.groupId===space.id);
    assert.equal((await groupWrite(other,'check',{topicId:goal.id})).body.topics.find(t=>t.id===goal.id).completions,1);
    const topic=(await groupWrite(other,'discussion',{body:'How was your review?'})).body.topics.find(t=>t.kind==='discussion'&&t.groupId===space.id);
    assert.equal((await groupWrite(owner,'reply',{topicId:topic.id,body:'Done'})).body.topics.find(t=>t.id===topic.id).replies[0].body,'Done');
    await groupWrite(other,'leave');
    assert.equal((await groupWrite(other,'reply',{topicId:topic.id,body:'Outside'})).status,403);
    const draft={visibility:'private',design:'marginalia',headline:'Study the process',displayName:'Public Alias',about:'My methods',
      sections:{streak:false,adherence:false,reviews:true}};
    const saved=(await work('portfolio',owner,draft)).body.portfolio;
    const readPublic=()=>call(api.publicPortfolio,null,'/?slug='+saved.slug);
    assert.equal((await readPublic()).status,404);
    assert.equal((await work('portfolio',null,{...draft,visibility:'link'})).status,401);
    await work('portfolio',owner,{...draft,visibility:'link'});
    const published=await readPublic();
    assert.deepEqual(published.body.stats,{reviews:1});
    assert.equal(published.body.displayName,'Public Alias');
    assert.doesNotMatch(JSON.stringify(published.body),/PRIVATE SYMBOL|checklist|1\.3|workspace-test/);
    assert.equal((await work('people',other)).body.profiles.some(p=>p.slug===saved.slug),false);
    await work('portfolio',owner,{...draft,visibility:'public'});
    assert.equal((await work('people',other)).body.profiles.find(p=>p.slug===saved.slug).name,'Public Alias');
    await work('portfolio',owner,draft);
    assert.equal((await readPublic()).status,404);
    const {rows:[position]}=await db.query(`INSERT INTO trades(user_id,market,symbol,side,opened_at,entry)
      VALUES($1,'stocks','POSITION','long',now()-interval '1 day',100) RETURNING id::text,
      (opened_at AT TIME ZONE 'Asia/Kolkata')::date::text AS day`,[owner]);
    const calendar=createCalendarHandlers(db,req=>({uid:req.uid}));
    const month=await call(calendar.month,owner,'/?month='+position.day.slice(0,7));
    assert.equal(month.body.days.find(day=>day.date===position.day).opened,1);
    const close={action:'close',tradeId:position.id,result:-0.5,exit:99};
    assert.equal((await work('history',other,close)).status,409);
    assert.equal((await work('history',owner,close)).status,200);
    assert.equal((await work('history',owner,close)).status,409);
    const savedPosition=(await work('history')).body.trades.find(t=>t.id===position.id);
    assert.ok(savedPosition.closedAt);
    assert.equal(savedPosition.exit,99);
    assert.equal(savedPosition.result,-0.5);
  } finally {
    await db.query('ROLLBACK');
    await db.end();
  }
});
