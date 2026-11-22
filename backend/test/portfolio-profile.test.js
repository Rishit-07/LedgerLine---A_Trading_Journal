import test from 'node:test';
import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
import {Readable} from 'node:stream';
import pg from 'pg';
import sharp from 'sharp';
import {createWorkspaceApi} from '../src/workspace.js';
import {createProfilePictureHandler} from '../src/profile-picture.js';

test('portfolio uses the saved owner settings and keeps photos private by default',{skip:!process.env.STREAK_TEST_DATABASE_URL},async()=>{
  const pool=new pg.Pool({connectionString:process.env.STREAK_TEST_DATABASE_URL});
  const client=await pool.connect();
  const owner=randomUUID(),visitor=randomUUID();
  let uid=owner;
  const authenticate=async()=>({uid});
  const workspace=createWorkspaceApi(client,authenticate);
  const writePicture=createProfilePictureHandler(client,authenticate);
  async function call(fn,url,method='GET',body){
    const req=Readable.from(body?[Buffer.from(JSON.stringify(body))]:[]);
    Object.assign(req,{url,method,headers:{'content-type':'application/json'}});
    let status,data;
    await fn(req,{writeHead:code=>{status=code;},end:result=>{data=JSON.parse(result);}});
    return {status,data};
  }
  const endpoint='/api/workspace?page=portfolio';
  const preference={streak:false,adherence:false,reviews:false};
  const draft={displayName:'A trader',headline:'Before',about:'A saved portfolio',design:'marginalia',visibility:'link',sections:preference};
  try{
    await client.query('BEGIN');
    for(const id of [owner,visitor]){
      await client.query('INSERT INTO ledgerline_accounts(firebase_uid) VALUES($1)',[id]);
      await client.query("INSERT INTO user_profile(user_id,timezone,onboarded_at) VALUES($1,'UTC',now())",[id]);
    }
    const img=await sharp({create:{width:160,height:140,channels:3,background:'#5161bb'}}).png().toBuffer();
    assert.equal((await call(writePicture,'/api/profile-picture','PUT',{image:'invalid'})).status,400);
    const upload=await call(writePicture,'/api/profile-picture','PUT',{image:img.toString('base64')});
    assert.equal(upload.status,200);
    assert.equal((await sharp(Buffer.from(upload.data.avatar,'base64')).metadata()).width,128);
    const saved=await call(workspace.workspace,endpoint,'POST',draft);
    assert.equal(saved.status,200);
    const {slug}=saved.data.portfolio;
    const shared=()=>call(workspace.publicPortfolio,'/api/portfolio/public?slug='+slug);
    assert.equal((await shared()).data.avatar,null);
    uid=visitor;
    assert.equal((await call(workspace.workspace,endpoint)).data.portfolio,null);
    await call(workspace.workspace,endpoint,'POST',{...draft,slug,headline:'Visitor attempt'});
    assert.equal((await shared()).data.headline,'Before');
    uid=owner;
    await call(workspace.workspace,endpoint,'POST',{action:'visibility',visibility:'public',sections:{...preference,photo:true}});
    const published=(await shared()).data;
    assert.equal(published.headline,'Before');
    assert.equal(published.avatar.replace(/\s/g,''),upload.data.avatar);
    await call(workspace.workspace,endpoint,'POST',{...draft,action:'customize',headline:'Saved change'});
    assert.equal((await shared()).data.headline,'Saved change');
    assert.equal((await shared()).data.visibility,'public');
    assert.equal((await shared()).data.avatar.replace(/\s/g,''),upload.data.avatar);
    const content = {
      cover:'', location:'', playbookTitle:'', markets:'Index options', courses:'', tools:'Journal', rules:'Wait for a planned entry',
      books:'', playbook:'Opening range | Set an alert', lessons:'Review before the next session', closing:'',
    };
    const customize = (content) => call(workspace.workspace,endpoint,'POST',{...draft,action:'customize',content});
    assert.equal((await customize(content)).status,200);
    assert.deepEqual((await shared()).data.sections.content,content);
    const addTrade = (id, setup) => client.query("INSERT INTO trades(user_id,market,symbol,side,setup,opened_at) VALUES($1,'stocks','PRIVATE','long',$2,'2026-01-03T23:00:00Z') RETURNING id",[id,setup]);
    const trade = (await addTrade(owner,' opening RANGE ')).rows[0].id;
    await addTrade(owner,'Opening range');
    await addTrade(visitor,'Opening range');
    await addTrade(owner,'Unpublished setup');
    const rule = await client.query("INSERT INTO rules(user_id,rule_key,text,hard,position) VALUES($1,'rule','Private rule',false,0) RETURNING id",[owner]);
    await client.query('INSERT INTO trade_checks(user_id,trade_id,rule_id,kept) VALUES($1,$2,$3,false)',[owner,trade,rule.rows[0].id]);
    assert.deepEqual((await shared()).data.setupStats,[]);
    await call(workspace.workspace,endpoint,'POST',{action:'visibility',visibility:'link',sections:{...preference,setupStats:true}});
    assert.deepEqual((await shared()).data.setupStats,[{name:'Opening range',logged:2,adherence:0,sessions:[{day:'2026-01-03',logged:2,adherence:0}]}]);
    await call(workspace.workspace,endpoint,'POST',{action:'visibility',visibility:'link',sections:{...preference,setupStats:false}});
    assert.deepEqual((await shared()).data.setupStats,[]);
    await call(workspace.workspace,endpoint,'POST',{action:'visibility',visibility:'link',sections:{...preference,photo:true}});
    assert.deepEqual((await shared()).data.sections.content,content);
    assert.equal((await customize({...content,playbook:'x'.repeat(1501)})).status,400);
    assert.deepEqual((await shared()).data.sections.content,content);
    const removed = {...content,playbook:''};
    assert.equal((await customize(removed)).status,200);
    assert.deepEqual((await shared()).data.sections.content,removed);
    const setups=['Opening range','Pullback','Fade'].map(name=>({name,rule:'Wait',how:'',tag:'',hard:'',checks:'',note:'',chart:'bars',color:'#17724a'}));
    const presentation={frame:'card',theme:'sage',hidden:[],setups};
    const savePresentation=(hidden)=>call(workspace.workspace,endpoint,'POST',{...draft,action:'customize',content,presentation:{...presentation,hidden}});
    assert.equal((await savePresentation([])).status,200);
    assert.deepEqual((await shared()).data.sections.presentation.setups,setups);
    await client.query("INSERT INTO badges_earned(user_id,badge_key,portfolio_visible) VALUES($1,'streak-7',false),($1,'streak-14',true)",[owner]);
    const owned=(await call(workspace.workspace,endpoint)).data;
    assert.ok(owned.badges.some(b=>b.key==='streak-7' && !b.shared && b.iconPath));
    assert.deepEqual((await shared()).data.badges.map(b=>b.key),['streak-14']);
    await savePresentation(['playbook','hello','education']);
    const hidden=(await shared()).data;
    assert.equal(hidden.sections.content.playbook,undefined);
    assert.deepEqual(hidden.sections.presentation.setups,[]);
    assert.deepEqual(hidden.badges,[]);
    assert.equal(hidden.about,'');
    await call(writePicture,'/api/profile-picture','PUT',{image:null});
    assert.equal((await shared()).data.avatar,null);
    await call(workspace.workspace,endpoint,'POST',{action:'visibility',visibility:'private',sections:preference});
    assert.equal((await shared()).status,404);
  }finally{
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
  }
});
