import {createHmac,timingSafeEqual} from 'node:crypto';
import {cryptoConfig,createCrypto,cryptoWebhook} from './report-crypto.js';
import {verified,overview,grant,invoice,invoicePdf} from './billing-ledger.js';
import {readJson,send} from './http.js';

export function verifySignature(raw,signature,secret){
 if(!secret||!/^\w{64}$/.test(signature??''))return false;
 const expected=createHmac('sha256',secret).update(raw).digest('hex');
 return timingSafeEqual(Buffer.from(expected),Buffer.from(signature));
}

export function billingApi(pool,authenticate,env=process.env,fetcher=fetch){
 return async(req,res)=>{
  let db;
  try{
   const url=new URL(req.url,'http://localhost');
   if(url.pathname.endsWith('/crypto/webhook'))return await cryptoWebhook(req,res,pool,env);
   if(url.pathname.endsWith('/webhook')){
    const chunks=[];let size=0;
    for await(const chunk of req){size+=chunk.length;if(size>262144)return send(res,413,{error:'Event too large.'});chunks.push(chunk);}
    const raw=Buffer.concat(chunks);
    if(!verifySignature(raw,req.headers['x-razorpay-signature'],env.RAZORPAY_WEBHOOK_SECRET))return send(res,401,{error:'Invalid signature.'});
    const event=JSON.parse(raw),sub=event.payload?.subscription?.entity,payment=event.payload?.payment?.entity;
    if(event.event==='subscription.pending'&&sub?.id){
      db=await pool.connect();await db.query('BEGIN');
      const {rows:[order]}=await db.query("UPDATE report_checkouts SET grace_until=paid_until+interval '7 days' WHERE provider_ref=$1 AND paid_until IS NOT NULL AND grace_until IS NULL AND (paid_until+interval '7 days')>now() RETURNING *",[sub.id]);
      if(order)await grant(db,order,order.grace_until);
      await db.query('COMMIT');return send(res,200,{received:true});
    }
    if(event.event!=='subscription.charged')return send(res,200,{received:true});
    if(!sub?.id||!Number.isSafeInteger(sub.current_end)||payment?.status!=='captured'||payment.currency!=='INR'||!Number.isSafeInteger(payment.amount)||payment.amount<=0||!payment.id)return send(res,400,{error:'Incomplete payment event.'});
    db=await pool.connect();await db.query('BEGIN');
    const {rows:[order]}=await db.query('SELECT * FROM report_checkouts WHERE provider_ref=$1 AND plan_ref=$2 FOR UPDATE',[sub.id,sub.plan_id]);
    if(order && (await db.query('INSERT INTO report_payment_events(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id',[payment.id])).rowCount){
      await db.query("UPDATE report_checkouts SET payment_state='paid',grace_until=NULL,reminder_sent=false,paid_until=greatest(paid_until,to_timestamp($2)) WHERE id=$1",[order.id,sub.current_end]);
      await grant(db,order,new Date(sub.current_end*1000));
      if(Number.isSafeInteger(payment.amount)&&payment.amount>0)await invoice(db,order,payment.id,payment.amount);
    }
    await db.query('COMMIT');return send(res,200,{received:true});
   }
   const claims=await authenticate(req,res);if(!claims)return;
   if(url.pathname.endsWith('/overview'))return send(res,200,await overview(pool,claims));
   if(url.pathname.endsWith('/invoice')){
    const {rows:[row]}=await pool.query('SELECT i.* FROM billing_invoices i JOIN report_checkouts o ON o.id=i.checkout_id WHERE i.id::text=$1 AND o.user_id=$2',[url.searchParams.get('id'),claims.uid]);
    if(!row)return send(res,404,{error:'Invoice not found.'});
    return send(res,200,{pdf:(await invoicePdf(row)).toString('base64')});
   }
   if(url.pathname.endsWith('/manage')){
    const {data}=await readJson(req,2048);
    if(!['pause','cancel'].includes(data?.action))return send(res,400,{error:'Choose pause or cancel.'});
    const {rows:[order]}=await pool.query("SELECT * FROM report_checkouts WHERE id::text=$1 AND user_id=$2 AND method<>'Crypto' AND paid_until>now()",[data.id,claims.uid]);
    if(!order)return send(res,404,{error:'No active recurring subscription.'});
    if(!order.renewal_action){
     const result=await fetcher('https://api.razorpay.com/v1/subscriptions/'+encodeURIComponent(order.provider_ref)+'/'+data.action,{method:'POST',headers:{Authorization:'Basic '+Buffer.from(env.RAZORPAY_KEY_ID+':'+env.RAZORPAY_KEY_SECRET).toString('base64'),'Content-Type':'application/json'},body:JSON.stringify(data.action==='pause'?{pause_at:'cycle_end'}:{cancel_at_cycle_end:1}),signal:AbortSignal.timeout(12000)});
     if(!result.ok)return send(res,502,{error:'The provider could not update your subscription.'});
     await pool.query('UPDATE report_checkouts SET renewal_action=$2 WHERE id=$1',[order.id,data.action]);
    }
    return send(res,200,{action:order.renewal_action??data.action});
   }
   if(url.pathname.endsWith('/status')){
    const {rows:[order]}=await pool.query('SELECT plan,method,provider_ref,hosted_url,quote,payment_state,coalesce(paid_until>now(),false) confirmed FROM report_checkouts WHERE id::text=$1 AND user_id=$2',[url.searchParams.get('id'),claims.uid]);
    if(!order)return send(res,404,{error:'Checkout not found.'});
    const {provider_ref,...status}=order;
    if(order.method==='Card'&&provider_ref&&env.RAZORPAY_KEY_ID){
     status.cardCheckout={key:env.RAZORPAY_KEY_ID,subscriptionId:provider_ref};
    }
    return send(res,200,status);
   }
   const available=Boolean(env.RAZORPAY_KEY_ID&&env.RAZORPAY_KEY_SECRET&&env.RAZORPAY_WEBHOOK_SECRET);
   const terms={monthly:env.RAZORPAY_PRO_MONTHLY_PLAN_ID,yearly:env.RAZORPAY_PRO_YEARLY_PLAN_ID};
   if(req.method==='GET')return send(res,200,{monthly:available&&Boolean(terms.monthly),yearly:available&&Boolean(terms.yearly),crypto:{monthly:Boolean(cryptoConfig(env,'monthly')),yearly:Boolean(cryptoConfig(env,'yearly'))}});
   const {data}=await readJson(req,2048);
   const plan=data?.plan??'pro';
   if(!['pro','mentor'].includes(plan))return send(res,400,{error:'Unknown plan.'});
   if(plan==='mentor'){
    if(!await verified(pool,claims.uid))return send(res,403,{reason:'needs_verification',error:'Verify your mentor account first.'});
    terms.monthly=env.RAZORPAY_MENTOR_MONTHLY_PLAN_ID;terms.yearly=env.RAZORPAY_MENTOR_YEARLY_PLAN_ID;
   }
   if(!['monthly','yearly'].includes(data?.term)||!['Card','UPI','Net banking','Crypto'].includes(data.method))return send(res,400,{error:'Unsupported checkout option.'});
   if(data.method==='Crypto'){
    if(!cryptoConfig(env,data.term,plan))return send(res,503,{error:'Crypto payments are awaiting a provider.'});
    return send(res,201,await createCrypto(pool,claims.uid,data.term,env,fetcher,{...data,plan,email:claims.email}));
   }
   if(!available||!terms[data.term])return send(res,503,{error:'Checkout is awaiting a payment provider.'});
   const subscription=await fetcher('https://api.razorpay.com/v1/subscriptions',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(env.RAZORPAY_KEY_ID+':'+env.RAZORPAY_KEY_SECRET).toString('base64'),'Content-Type':'application/json'},body:JSON.stringify({plan_id:terms[data.term],quantity:1,total_count:data.term==='monthly'?120:10,customer_notify:true}),signal:AbortSignal.timeout(12000)});
   if(!subscription.ok)return send(res,502,{error:'Could not open checkout. Please try again.'});
   const sub=await subscription.json();
   if(!sub.short_url?.startsWith('https://')||!sub.id)throw Error('Invalid checkout');
   const {rows:[order]}=await pool.query('INSERT INTO report_checkouts(user_id,term,plan_ref,provider_ref,plan,method,recipient,hosted_url) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id',[claims.uid,data.term,terms[data.term],sub.id,plan,data.method,claims.email,sub.short_url]);
   send(res,201,{id:order.id,url:sub.short_url,...(data.method==='Card'?{cardCheckout:{key:env.RAZORPAY_KEY_ID,subscriptionId:sub.id}}:{})});
  }catch{if(db)await db.query('ROLLBACK').catch(()=>{});send(res,503,{error:'Billing is temporarily unavailable.'});}
  finally{db?.release();}
 };
}
