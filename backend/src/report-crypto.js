import {createHmac,timingSafeEqual} from 'node:crypto';
import {readJson,send} from './http.js';

export function cryptoConfig(env,term){
 const price=Number(term==='monthly'?env.PRO_MONTHLY_PRICE_PAISE:env.PRO_YEARLY_PRICE_PAISE);
 return env.NOWPAYMENTS_API_KEY && env.NOWPAYMENTS_IPN_SECRET && /^https:\/\//.test(env.PUBLIC_APP_URL??'')&&Number.isSafeInteger(price)&&price>0?price:null;
}
export async function createCrypto(pool,uid,term,env,fetcher){
 const price=cryptoConfig(env,term);
 if(!price)throw Error('Crypto is unavailable');
 const {rows:[order]}=await pool.query("INSERT INTO report_checkouts(user_id,term,plan_ref,price_paise) VALUES($1,$2,'crypto-pro',$3) RETURNING id",[uid,term,price]);
 const base=new URL(env.PUBLIC_APP_URL).origin;
 const response=await fetcher('https://api.nowpayments.io/v1/invoice',{method:'POST',headers:{'x-api-key':env.NOWPAYMENTS_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({price_amount:price/100,price_currency:'inr',order_id:order.id,order_description:'Ledgerline Pro prepaid '+term,is_fixed_rate:true,ipn_callback_url:base+'/api/billing/crypto/webhook',success_url:base+'/reports?checkout='+order.id,cancel_url:base+'/reports'}),signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Invoice unavailable');
 const invoice=await response.json(),url=new URL(invoice.invoice_url);
 if(url.protocol!=='https:'||!['nowpayments.io','www.nowpayments.io'].includes(url.hostname)||!invoice.id)throw Error('Invalid invoice');
 await pool.query('UPDATE report_checkouts SET provider_ref=$2 WHERE id=$1',[order.id,String(invoice.id)]);
 return {id:order.id,url:url.href};
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
  const {rows:[order]}=await db.query("SELECT * FROM report_checkouts WHERE id::text=$1 AND provider_ref=$2 AND plan_ref='crypto-pro' FOR UPDATE",[data.order_id,String(data.invoice_id)]);
  if(order&&!order.paid_until){
    let state=({waiting:'waiting',confirming:'confirming',confirmed:'confirming',sending:'confirming',partially_paid:'underpaid',expired:'expired',failed:'failed',finished:'paid'})[data.payment_status];
    if(state==='paid'){
      const matches=data.price_currency?.toLowerCase()==='inr'&&Math.round(Number(data.price_amount)*100)===Number(order.price_paise);
      const amounts=[Number(data.pay_amount),Number(data.actually_paid)];
      if(!matches||!amounts.every(n=>Number.isFinite(n)&&n>0))throw Error('Unmatched payment amount');
      if(amounts[1]<amounts[0])state='underpaid';
      else{
       await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,21))',[order.user_id]);
       const {rows:[sub]}=await db.query(`INSERT INTO report_subscriptions(user_id,plan,valid_until) VALUES($1,'pro',now()+$2::interval)
        ON CONFLICT(user_id) DO UPDATE SET valid_until=greatest(now(),report_subscriptions.valid_until)+$2::interval RETURNING valid_until`,[order.user_id,order.term==='monthly'?'1 month':'1 year']);
       await db.query('UPDATE report_checkouts SET paid_until=$2 WHERE id=$1',[order.id,sub.valid_until]);
       if(amounts[1]>amounts[0])state='overpaid';
      }
    }
    if(state)await db.query('UPDATE report_checkouts SET payment_state=$2 WHERE id=$1',[order.id,state]);
  }
  await db.query('COMMIT');return send(res,200,{received:true});
 }catch(e){await db.query('ROLLBACK');throw e;}finally{db.release();}
}
