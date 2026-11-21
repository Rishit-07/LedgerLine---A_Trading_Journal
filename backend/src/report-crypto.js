import {createHmac,timingSafeEqual} from 'node:crypto';
import {grant,invoice} from './billing-ledger.js';
import {readJson,send} from './http.js';

export function cryptoConfig(env,term,plan='pro'){
 const price=Number(env[plan.toUpperCase()+'_'+term.toUpperCase()+'_PRICE_PAISE']);
 return env.NOWPAYMENTS_API_KEY && env.NOWPAYMENTS_IPN_SECRET && /^https:\/\//.test(env.PUBLIC_APP_URL??'')&&Number.isSafeInteger(price)&&price>0?price:null;
}
export async function createCrypto(pool,uid,term,env,fetcher,options={}){
 const {plan='pro',coin='USDC',network='Polygon',months=term==='yearly'?12:1,email}=options;
 const currencies={USDC:{Polygon:'usdcmatic',Base:'usdcbase'},USDT:{Polygon:'usdtmatic',Tron:'usdttrc20'}};
 const currency=currencies[coin]?.[network];
 if(!currency||![1,3,12].includes(months))throw Error('Unsupported currency or period');
 const unit=cryptoConfig(env,months===12?'yearly':'monthly',plan);
 if(!unit)throw Error('No configured merchant price');
 const price=unit*(months===3?3:1);
 const {rows:[order]}=await pool.query("INSERT INTO report_checkouts(user_id,term,plan,method,months,plan_ref,price_paise,recipient) VALUES($1,$2,$3,'Crypto',$4,'crypto-'+$3,$5,$6) RETURNING id",[uid,term,plan,months,price,email]);
 const response=await fetcher('https://api.nowpayments.io/v1/payment',{method:'POST',headers:{'x-api-key':env.NOWPAYMENTS_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({price_amount:price/100,price_currency:'inr',pay_currency:currency,order_id:order.id,is_fixed_rate:true,ipn_callback_url:new URL('/api/billing/crypto/webhook',env.PUBLIC_APP_URL).href}),signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Quote unavailable');
 const result=await response.json();
 if(!result.payment_id||!result.pay_address||!(Number(result.pay_amount)>0)||result.pay_currency!==currency)throw Error('Invalid quote');
 const expiry=Math.min(Date.now()+900000,Date.parse(result.expiration_estimate_date)||Infinity);
 const quote={address:result.pay_address,amount:String(result.pay_amount),coin,network,currency,expiresAt:new Date(expiry).toISOString()};
 await pool.query('UPDATE report_checkouts SET provider_ref=$2,quote=$3 WHERE id=$1',[order.id,String(result.payment_id),quote]);
 return {id:order.id,quote};
}
function sorted(value){
 if(Array.isArray(value))return value.map(sorted);
 if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(key=>[key,sorted(value[key])]));
 return value;
}
export function validCryptoEvent(data,sig,secret){
 if(!secret||!/^([a-f0-9]{128})$/.test(sig??''))return false;
 return timingSafeEqual(Buffer.from(sig,'hex'),createHmac('sha512',secret).update(JSON.stringify(sorted(data))).digest());
}
export async function cryptoWebhook(req,res,pool,env){
 const {data}=await readJson(req,32768);
 if(!data||!validCryptoEvent(data,req.headers['x-nowpayments-sig'],env.NOWPAYMENTS_IPN_SECRET))return send(res,401,{error:'Invalid payment event.'});
 const db=await pool.connect();
 try{
  await db.query('BEGIN');
  const {rows:[order]}=await db.query("SELECT * FROM report_checkouts WHERE id::text=$1 AND provider_ref=$2 AND method='Crypto' FOR UPDATE",[data.order_id,String(data.invoice_id||data.payment_id)]);
  if(order&&!order.paid_until){
    let state=({waiting:'waiting',confirming:'confirming',confirmed:'confirming',sending:'confirming',partially_paid:'underpaid',expired:'expired',failed:'failed',finished:'paid'})[data.payment_status];
    if(state==='paid'){
      const matches=(!order.quote||data.pay_currency===order.quote.currency)&&data.price_currency?.toLowerCase()==='inr'&&Math.round(Number(data.price_amount)*100)===Number(order.price_paise);
      const amounts=[Number(data.pay_amount),Number(data.actually_paid)];
      if(!matches||!amounts.every(n=>Number.isFinite(n)&&n>0))throw Error('Unmatched payment amount');
      if(amounts[1]<amounts[0])state='underpaid';
      else{
       await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,21))',[order.user_id]);
       const months=order.months??(order.term==='monthly'?1:12);
       const {rows:[sub]}=await db.query("SELECT greatest(now(),(SELECT valid_until FROM report_subscriptions WHERE user_id=$1)) + make_interval(months=>$2) valid_until",[order.user_id,months]);
       await grant(db,order,sub.valid_until);
       await db.query('UPDATE report_checkouts SET paid_until=$2 WHERE id=$1',[order.id,sub.valid_until]);
       const credit=Math.max(0,amounts[1]-amounts[0]);
       await invoice(db,order,String(data.payin_hash||data.payment_id),Number(order.price_paise),credit);
       if(credit>0)state='overpaid';
      }
    }
    if(state)await db.query('UPDATE report_checkouts SET payment_state=$2 WHERE id=$1',[order.id,state]);
  }
  await db.query('COMMIT');return send(res,200,{received:true});
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
