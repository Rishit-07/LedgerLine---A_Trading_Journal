/* Billing: crypto only, through CoinPayments. Prepaid periods, nothing renews by itself.
   Access is granted only after CoinPayments says the invoice is Completed, checked by our own signed request. */
import {createHash} from 'node:crypto';
import {verified,overview,grant,invoice,invoicePdf} from './billing-ledger.js';
import {PERIODS,GRACE_DAYS,QUOTE_MINUTES,REMIND_DAYS,priceFor} from './billing-config.js';
import {coinpaymentsReady,createInvoice,getInvoice,verifyWebhook,classify} from './coinpayments.js';
import {eligibleReviewer} from './mentor-verification.js';
import {notify} from './notifications.js';
import {readJson,send} from './http.js';

const labelOf=plan=>plan==='mentor'?'Mentor':'Pro';
const fmt=d=>new Date(d).toISOString().slice(0,10);

const log=(db,id,source,state,note=null)=>db.query('INSERT INTO payment_events(checkout_id,source,state,note) VALUES($1,$2,$3,$4)',[id,source,state,note]);

/** Add the paid months to whatever the account already has, then record the invoice.
 *  Runs inside the caller's transaction, so access, intro use, invoice and log either all happen or none do. */
async function credit(db,order,transactionId,now,source){
 await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,21))',[order.user_id]);
 const {rows:[s]}=await db.query(`SELECT greatest($3::timestamptz,coalesce((SELECT valid_until FROM report_subscriptions WHERE user_id=$1),$3::timestamptz),
   coalesce((SELECT expires_at FROM mentor_entitlements WHERE user_id=$1 AND active),$3::timestamptz))+make_interval(months=>$2) until`,[order.user_id,order.months,now]);
 await grant(db,order,s.until);
 await db.query("UPDATE report_checkouts SET paid_until=$2,payment_state='paid',needs_review=false,review_note=NULL WHERE id=$1",[order.id,s.until]);
 if(order.intro_months>0)await db.query('INSERT INTO intro_usage(user_id,plan,months_used) VALUES($1,$2,$3) ON CONFLICT(user_id,plan) DO UPDATE SET months_used=least(2,intro_usage.months_used+$3)',[order.user_id,order.plan,order.intro_months]);
 await invoice(db,order,transactionId,order.price_usd_cents);
 await log(db,order.id,source,'paid','Access until '+fmt(s.until));
 return s.until;
}
// Sent only after the transaction commits, so a rolled-back payment never produces a notice.
const paidNotice=(pool,order,until)=>notify(pool,order.user_id,'billing',{title:labelOf(order.plan)+' is active',body:'Your access runs until '+fmt(until)+'.',target:'/billing',dedupe:'paid:'+order.id}).catch(()=>{});

export function createBillingApi(pool,{authenticate,env=process.env,fetcher=fetch,now=()=>new Date()}){
 /** Apply what CoinPayments says about one order. Never trusts a webhook body for amounts or state.
  *  The provider is asked first, outside any transaction, so no database lock is held during a network call. */
 async function settle(orderId,source='webhook'){
  const {rows:[peek]}=await pool.query("SELECT provider_ref,price_usd_cents,paid_until FROM report_checkouts WHERE id=$1 AND method='Crypto'",[orderId]);
  if(!peek||peek.paid_until||!peek.provider_ref)return null;
  const result=classify(await getInvoice(env,fetcher,peek.provider_ref),peek.price_usd_cents);
  const db=await pool.connect();let until=null,order;
  try{
   await db.query('BEGIN');
   ({rows:[order]}=await db.query("SELECT * FROM report_checkouts WHERE id=$1 FOR UPDATE",[orderId]));
   if(order.paid_until){await db.query('COMMIT');return 'paid';}   // another delivery got here first
   if(result.state==='paid')until=await credit(db,order,'cp-'+order.provider_ref,now(),source);
   else{
    const flag=['needs_review','underpaid'].includes(result.state);
    if(order.payment_state!==result.state||order.needs_review!==flag){
     await db.query('UPDATE report_checkouts SET payment_state=$2,needs_review=$3,review_note=$4 WHERE id=$1',[order.id,result.state==='needs_review'?'needs_review':result.state,flag,result.note??null]);
     await log(db,order.id,source,result.state,result.note);
    }
   }
   await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
  if(until)await paidNotice(pool,order,until);
  return result.state;
 }

 async function webhook(req,res){
  const chunks=[];let size=0;
  for await(const chunk of req){size+=chunk.length;if(size>65536)return send(res,413,{error:'Event too large.'});chunks.push(chunk);}
  const raw=Buffer.concat(chunks);
  if(!verifyWebhook(raw,req.headers,env,now().getTime()))return send(res,401,{error:'Invalid signature.'});
  let event;try{event=JSON.parse(raw);}catch{return send(res,400,{error:'Unreadable event.'});}
  const id=String(event.invoice?.id??event.invoiceId??event.id??''),key=createHash('sha256').update(raw).digest('hex');
  if((await pool.query("SELECT 1 FROM webhook_events WHERE provider='coinpayments' AND event_id=$1",[key])).rowCount)return send(res,200,{received:true,duplicate:true});
  const {rows:[order]}=await pool.query("SELECT id FROM report_checkouts WHERE provider_ref=$1 AND method='Crypto'",[id]);
  if(order)await settle(order.id);   // throws on failure, so the caller gets a 503 and CoinPayments retries
  await pool.query("INSERT INTO webhook_events(provider,event_id) VALUES('coinpayments',$1) ON CONFLICT DO NOTHING",[key]);   // only after it was handled
  send(res,200,{received:true});
 }

 async function checkout(req,res,claims){
  if(!coinpaymentsReady(env))return send(res,503,{error:'Checkout is awaiting the payment provider.'});
  const {data}=await readJson(req,2048);
  const plan=data?.plan??'pro',months=Number(data?.months??1);
  if(!['pro','mentor'].includes(plan)||!PERIODS.includes(months))return send(res,400,{error:'Choose a plan and a period.'});
  if(plan==='mentor'&&!await verified(pool,claims.uid))return send(res,403,{reason:'needs_verification',error:'Verify your mentor account first.'});
  // One transaction per account: pick the price and reserve the order, so two tabs cannot both get an intro price that is already spoken for.
  const db=await pool.connect();let order,price;
  try{
   await db.query('BEGIN');
   await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,21))',[claims.uid]);
   const {rows:[open]}=await db.query("SELECT id,hosted_url FROM report_checkouts WHERE user_id=$1 AND plan=$2 AND months=$3 AND method='Crypto' AND payment_state IN ('waiting','confirming') AND expires_at>$4 AND hosted_url IS NOT NULL",[claims.uid,plan,months,now()]);
   if(open){await db.query('COMMIT');return send(res,200,{id:open.id,url:open.hosted_url});}
   const {rows:[u]}=await db.query(`SELECT coalesce((SELECT months_used FROM intro_usage WHERE user_id=$1 AND plan=$2),0)
     +coalesce((SELECT sum(intro_months) FROM report_checkouts WHERE user_id=$1 AND plan=$2 AND paid_until IS NULL AND payment_state IN ('waiting','confirming') AND expires_at>$3),0) n`,[claims.uid,plan,now()]);
   price=priceFor(plan,months,Number(u.n));
   ({rows:[order]}=await db.query("INSERT INTO report_checkouts(user_id,term,plan,method,months,plan_ref,price_usd_cents,intro_months,recipient,expires_at) VALUES($1,$2,$3,'Crypto',$4,'coinpayments',$5,$6,$7,$8) RETURNING id",
    [claims.uid,months===12?'yearly':'monthly',plan,months,price.cents,price.intro,claims.email,new Date(now().getTime()+QUOTE_MINUTES*60000)]));
   await log(db,order.id,'checkout','waiting',`${months} month(s), ${price.cents} cents${price.intro?' (intro)':''}`);
   await db.query('COMMIT');
  }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
  try{
   const inv=await createInvoice(env,fetcher,{order:order.id,cents:price.cents,title:`Ledgerline ${labelOf(plan)} · ${months} month${months===1?'':'s'}`,email:claims.email});
   await pool.query('UPDATE report_checkouts SET provider_ref=$2,hosted_url=$3 WHERE id=$1',[order.id,inv.id,inv.link]);
   send(res,201,{id:order.id,url:inv.link,cents:price.cents,intro:price.intro>0});
  }catch{
   await pool.query("UPDATE report_checkouts SET payment_state='failed' WHERE id=$1",[order.id]);await log(pool,order.id,'checkout','failed','Provider refused the invoice').catch(()=>{});
   send(res,502,{error:'Could not open checkout. Please try again.'});
  }
 }

 const handler=async(req,res)=>{
  try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname.endsWith('/webhook'))return await webhook(req,res);
   const claims=await authenticate(req,res);if(!claims)return;
   if(url.pathname.endsWith('/overview'))return send(res,200,{...await overview(pool,claims),ready:coinpaymentsReady(env)});
   if(url.pathname.endsWith('/invoice')){
    const {rows:[row]}=await pool.query('SELECT i.* FROM billing_invoices i JOIN report_checkouts o ON o.id=i.checkout_id WHERE i.id::text=$1 AND o.user_id=$2',[url.searchParams.get('id'),claims.uid]);
    if(!row)return send(res,404,{error:'Invoice not found.'});
    return send(res,200,{pdf:(await invoicePdf(row)).toString('base64')});
   }
   if(url.pathname.endsWith('/status')){
    const {rows:[order]}=await pool.query('SELECT id,plan,months,hosted_url,payment_state,expires_at,coalesce(paid_until>now(),false) confirmed FROM report_checkouts WHERE id::text=$1 AND user_id=$2',[url.searchParams.get('id'),claims.uid]);
    if(!order)return send(res,404,{error:'Checkout not found.'});
    return send(res,200,order);
   }
   if(url.pathname.endsWith('/needs-review')){
    if(!eligibleReviewer(claims))return send(res,403,{error:'Reviewers only.'});
    if(req.method==='GET')return send(res,200,{items:(await pool.query('SELECT id,user_id,plan,months,price_usd_cents,payment_state,review_note,provider_ref,created_at FROM report_checkouts WHERE needs_review ORDER BY created_at DESC LIMIT 100')).rows});
    const {data}=await readJson(req,1024);
    if(!['credit','dismiss'].includes(data?.action))return send(res,400,{error:'Choose credit or dismiss.'});
    const db=await pool.connect();let until=null,order;
    try{
     await db.query('BEGIN');
     ({rows:[order]}=await db.query('SELECT * FROM report_checkouts WHERE id::text=$1 AND needs_review FOR UPDATE',[String(data.id)]));
     if(!order){await db.query('ROLLBACK');return send(res,404,{error:'Nothing to review.'});}
     if(data.action==='credit')until=await credit(db,order,'manual-'+order.id,now(),'reviewer');
     else{await db.query("UPDATE report_checkouts SET needs_review=false,payment_state='cancelled' WHERE id=$1",[order.id]);await log(db,order.id,'reviewer','cancelled','Dismissed');}
     await db.query('INSERT INTO admin_audit_log(actor_id,action,target,detail) VALUES($1,$2,$3,$4)',[claims.uid,'billing_review_'+data.action,order.id,JSON.stringify({plan:order.plan,months:order.months})]);
     await db.query('COMMIT');
     if(until)await paidNotice(pool,order,until);
     return send(res,200,{ok:true});
    }catch(e){await db.query('ROLLBACK').catch(()=>{});throw e;}finally{db.release();}
   }
   if(req.method==='POST')return await checkout(req,res,claims);
   send(res,200,{ready:coinpaymentsReady(env),periods:PERIODS});
  }catch{send(res,503,{error:'Billing is temporarily unavailable.'});}
 };

 /** Scheduled: close unpaid checkouts, re-check ones stuck confirming, remind before a period ends, say when grace starts. */
 async function sweep(){
  const t=now();
  const {rows:gone}=await pool.query("UPDATE report_checkouts SET payment_state='expired' WHERE method='Crypto' AND payment_state='waiting' AND expires_at<$1 AND paid_until IS NULL RETURNING id",[new Date(t.getTime()-30*60000)]);
  for(const g of gone)await log(pool,g.id,'sweep','expired','Checkout window closed');
  const {rows:stuck}=await pool.query("SELECT id FROM report_checkouts WHERE method='Crypto' AND payment_state IN ('waiting','confirming') AND provider_ref IS NOT NULL AND paid_until IS NULL AND created_at>$1 LIMIT 20",[new Date(t.getTime()-24*36e5)]);
  for(const o of stuck)await settle(o.id,'sweep').catch(()=>{});
  // The latest paid order per account and plan decides whether to remind.
  const {rows:latest}=await pool.query("SELECT DISTINCT ON (user_id,plan) id,user_id,plan,paid_until,renewal_action FROM report_checkouts WHERE method='Crypto' AND paid_until IS NOT NULL ORDER BY user_id,plan,paid_until DESC");
  for(const o of latest){
   if(o.renewal_action==='cancel')continue;
   const days=(new Date(o.paid_until)-t)/864e5;
   for(const d of REMIND_DAYS)if(days>0&&days<=d)await notify(pool,o.user_id,'billing',{title:`Your ${labelOf(o.plan)} plan ends ${d===1?'tomorrow':'in '+d+' days'}`,body:'Extend it to keep access. Nothing renews by itself.',target:'/billing',dedupe:`remind${d}:${o.id}:${fmt(o.paid_until)}`});
   if(days<=0&&days>-GRACE_DAYS)await notify(pool,o.user_id,'billing',{title:`Your ${labelOf(o.plan)} plan has ended`,body:`You have until ${fmt(new Date(new Date(o.paid_until).getTime()+GRACE_DAYS*864e5))} to extend it.`,target:'/billing',dedupe:`grace:${o.id}:${fmt(o.paid_until)}`});
  }
 }

 /** Hooks the mentor system calls. Prepaid periods cannot be refunded or cut short, so cancelling only stops reminders. */
 const cancelMentorPlan=async uid=>{await pool.query("UPDATE report_checkouts SET renewal_action='cancel' WHERE user_id=$1 AND plan='mentor' AND paid_until>$2",[uid,now()]);};
 const planTerm=async uid=>{const {rows:[o]}=await pool.query("SELECT months FROM report_checkouts WHERE user_id=$1 AND plan='mentor' AND paid_until IS NOT NULL ORDER BY paid_until DESC LIMIT 1",[uid]);return o?.months===12?'yearly':'monthly';};
 return {handler,sweep,cancelMentorPlan,planTerm};
}
