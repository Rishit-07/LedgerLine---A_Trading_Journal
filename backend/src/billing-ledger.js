import {toolUsage,limitTable} from './usage-limits.js';
import {decryptField} from './field-crypto.js';
import {createRequire} from 'node:module';
import PDFDocument from 'pdfkit';
import {PRICES,INTRO_MONTHS} from './billing-config.js';
const features=createRequire(import.meta.url)('../../src/config/plans.ts').plans;
// Prices shown to customers, in dollars, from billing-config.js.
export const plans=Object.fromEntries(Object.entries(features).map(([k,v])=>[k,{features:v.features,monthlyReviews:v.monthlyReviews,monthly:PRICES[k]?.monthly/100||0,yearly:PRICES[k]?.yearly/100||0,intro:PRICES[k]?PRICES[k].intro/100:null}]));

export async function verified(db,uid){
 return (await db.query("SELECT 1 FROM mentor_verifications WHERE user_id=$1 AND status='approved'",[uid])).rowCount>0;
}
export async function overview(db,user){
 const uid=user.uid;
 const [sub,profile,invoices,replays,orders,intro,mentor]=await Promise.all([
  db.query("SELECT plan,valid_until FROM report_subscriptions WHERE user_id=$1 AND valid_until>now()",[uid]),
  db.query('SELECT billing_name,address,gstin FROM billing_profiles WHERE user_id=$1',[uid]),
  db.query('SELECT i.id,i.created_at,i.amount_paise,i.currency,o.method FROM billing_invoices i JOIN report_checkouts o ON o.id=i.checkout_id WHERE o.user_id=$1 ORDER BY i.id DESC',[uid]),
  Promise.resolve(null),
  db.query("SELECT id,plan,method,months,renewal_action,paid_until FROM report_checkouts WHERE user_id=$1 AND paid_until>now() - interval '3 days' ORDER BY paid_until DESC",[uid]),
  db.query('SELECT plan,months_used FROM intro_usage WHERE user_id=$1',[uid]),
  db.query("SELECT 1 FROM mentor_entitlements WHERE user_id=$1 AND active AND (expires_at IS NULL OR expires_at>now())",[uid])
 ]);
 const current=mentor.rowCount?'mentor':sub.rows[0]?.plan??'free';
 return {plans,verified:await verified(db,uid),current,profile:{...profile.rows[0],address:decryptField(profile.rows[0]?.address),gstin:decryptField(profile.rows[0]?.gstin),email:user.email},invoices:invoices.rows,tools:await toolUsage(db,uid,current),limits:limitTable(),orders:orders.rows,introLeft:Object.fromEntries(['pro','mentor'].map(k=>[k,Math.max(0,INTRO_MONTHS-(intro.rows.find(r=>r.plan===k)?.months_used??0))]))};
}
export async function grant(db,order,until){
 await db.query("INSERT INTO report_subscriptions (user_id,plan,valid_until) VALUES($1,'pro',$2) ON CONFLICT(user_id) DO UPDATE SET valid_until=greatest(report_subscriptions.valid_until,excluded.valid_until)",[order.user_id,until]);
 if(order.plan==='mentor' && await verified(db,order.user_id)){
  await db.query('INSERT INTO mentor_entitlements VALUES($1,true,$2) ON CONFLICT(user_id) DO UPDATE SET active=true,expires_at=greatest(mentor_entitlements.expires_at,excluded.expires_at)',[order.user_id,until]);
 }
}
export async function invoice(db,order,transaction,amount,credit=0){
 const seller={name:process.env.BILLING_LEGAL_NAME,address:process.env.BILLING_LEGAL_ADDRESS,gstin:process.env.BILLING_GSTIN,sac:process.env.BILLING_SAC};
 const configuredRate=Number(process.env.BILLING_GST_PERCENT);
 const tax=seller.gstin&&Number.isFinite(configuredRate)&&configuredRate>=0?{rate:configuredRate,base:Math.round(amount/(1+configuredRate/100))}:null;
 await db.query("INSERT INTO billing_invoices(checkout_id,transaction_id,amount_paise,credit,currency,details) SELECT $1,$2,$3,$4,'USD',jsonb_build_object('name',p.billing_name,'gstin',p.gstin,'address',p.address,'email',$6::text,'plan',$7::text,'method',$8::text,'seller',$9::jsonb,'tax',$10::jsonb,'quote', $11::jsonb) FROM (VALUES(1)) seed(n) LEFT JOIN billing_profiles p ON p.user_id=$5 ON CONFLICT(transaction_id) DO NOTHING",[order.id,transaction,amount,credit,order.user_id,order.recipient,order.plan,order.method,seller,tax,order.quote??null]);
}
export async function invoicePdf(row){
 const doc=new PDFDocument({margin:56});
 const chunks=[];const result=new Promise((ok,fail)=>{doc.on('data',x=>chunks.push(x));doc.on('end',()=>ok(Buffer.concat(chunks)));doc.on('error',fail);});
 const cur=row.currency||'INR';const d={...row.details,address:decryptField(row.details.address),gstin:decryptField(row.details.gstin)};
 doc.fontSize(24).text(d.seller?.name||'Ledgerline').moveDown().fontSize(16).text('Invoice LL-'+String(row.id).padStart(6,'0')).fontSize(11);
 for(const line of [new Date(row.created_at).toISOString().slice(0,10),d.seller?.address,d.seller?.gstin&&'Supplier GSTIN '+d.seller.gstin,d.seller?.sac&&'SAC '+d.seller.sac,d.name,d.email,d.address,d.gstin&&'Customer GSTIN '+d.gstin,d.plan+' subscription',d.method,d.tax&&'Taxable value '+cur+' '+(d.tax.base/100).toFixed(2),d.tax&&'GST ('+d.tax.rate+'%) '+cur+' '+((Number(row.amount_paise)-d.tax.base)/100).toFixed(2),Number(row.credit)>0&&'Excess credited: '+row.credit+' '+(d.quote?.coin??''),'Receipt value '+cur+' '+(Number(row.amount_paise)/100).toFixed(2),'Transaction '+row.transaction_id])if(line)doc.moveDown(.5).text(String(line));
 doc.end();return result;
}