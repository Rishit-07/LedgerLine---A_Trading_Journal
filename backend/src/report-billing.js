import {createHmac,timingSafeEqual} from 'node:crypto';
import {cryptoConfig,createCrypto,cryptoWebhook} from './report-crypto.js';
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
    if(event.event!=='subscription.charged')return send(res,200,{received:true});
    if(!sub?.id||!Number.isSafeInteger(sub.current_end)||payment?.status!=='captured'||payment.currency!=='INR'||!payment.id)return send(res,400,{error:'Incomplete payment event.'});
    db=await pool.connect();await db.query('BEGIN');
    const {rows:[order]}=await db.query('SELECT * FROM report_checkouts WHERE provider_ref=$1 AND plan_ref=$2 FOR UPDATE',[sub.id,sub.plan_id]);
    if(order && (await db.query('INSERT INTO report_payment_events(id) VALUES($1) ON CONFLICT DO NOTHING RETURNING id',[payment.id])).rowCount){
      await db.query('UPDATE report_checkouts SET paid_until=greatest(paid_until,to_timestamp($2)) WHERE id=$1',[order.id,sub.current_end]);
      await db.query(`INSERT INTO report_subscriptions VALUES($1,'pro',to_timestamp($2)) ON CONFLICT(user_id) DO UPDATE SET valid_until=greatest(report_subscriptions.valid_until,excluded.valid_until)`,[order.user_id,sub.current_end]);
    }
    await db.query('COMMIT');return send(res,200,{received:true});
   }
   const claims=await authenticate(req,res);if(!claims)return;
   if(url.pathname.endsWith('/status')){
    const {rows:[order]}=await pool.query('SELECT payment_state,coalesce(paid_until>now(),false) confirmed FROM report_checkouts WHERE id::text=$1 AND user_id=$2',[url.searchParams.get('id'),claims.uid]);
    return send(res,order?200:404,order??{error:'Checkout not found.'});
   }
   const available=Boolean(env.RAZORPAY_KEY_ID&&env.RAZORPAY_KEY_SECRET&&env.RAZORPAY_WEBHOOK_SECRET);
   const terms={monthly:env.RAZORPAY_PRO_MONTHLY_PLAN_ID,yearly:env.RAZORPAY_PRO_YEARLY_PLAN_ID};
   if(req.method==='GET')return send(res,200,{monthly:available&&Boolean(terms.monthly),yearly:available&&Boolean(terms.yearly),crypto:{monthly:Boolean(cryptoConfig(env,'monthly')),yearly:Boolean(cryptoConfig(env,'yearly'))}});
   const {data}=await readJson(req,2048);
   if(!['monthly','yearly'].includes(data?.term)||!['Card','UPI','Crypto'].includes(data.method))return send(res,400,{error:'Unsupported checkout option.'});
   if(data.method==='Crypto'){
    if(!cryptoConfig(env,data.term))return send(res,503,{error:'Crypto payments are awaiting a provider.'});
    return send(res,201,await createCrypto(pool,claims.uid,data.term,env,fetcher));
   }
   if(!available||!terms[data.term])return send(res,503,{error:'Checkout is awaiting a payment provider.'});
   const subscription=await fetcher('https://api.razorpay.com/v1/subscriptions',{method:'POST',headers:{Authorization:'Basic '+Buffer.from(env.RAZORPAY_KEY_ID+':'+env.RAZORPAY_KEY_SECRET).toString('base64'),'Content-Type':'application/json'},body:JSON.stringify({plan_id:terms[data.term],quantity:1,total_count:data.term==='monthly'?120:10,customer_notify:false}),signal:AbortSignal.timeout(12000)});
   if(!subscription.ok)return send(res,502,{error:'Could not open checkout. Please try again.'});
   const sub=await subscription.json();
   if(!sub.short_url?.startsWith('https://')||!sub.id)throw Error('Invalid checkout');
   const {rows:[order]}=await pool.query('INSERT INTO report_checkouts(user_id,term,plan_ref,provider_ref) VALUES($1,$2,$3,$4) RETURNING id',[claims.uid,data.term,terms[data.term],sub.id]);
   send(res,201,{id:order.id,url:sub.short_url});
  }catch{if(db)await db.query('ROLLBACK').catch(()=>{});send(res,503,{error:'Billing is temporarily unavailable.'});}
  finally{db?.release();}
 };
}
