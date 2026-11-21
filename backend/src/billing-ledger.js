import {createRequire} from 'node:module';
import PDFDocument from 'pdfkit';
export const {plans}=createRequire(import.meta.url)('../../src/config/plans.ts');

export async function verified(db,uid){
 return (await db.query("SELECT 1 FROM mentor_verifications WHERE user_id=$1 AND status='approved'",[uid])).rowCount>0;
}
export async function overview(db,user){
 const uid=user.uid;
 const [sub,profile,invoices,replays,orders,mentor]=await Promise.all([
  db.query("SELECT plan,valid_until FROM report_subscriptions WHERE user_id=$1 AND valid_until>now()",[uid]),
  db.query('SELECT billing_name,address,gstin FROM billing_profiles WHERE user_id=$1',[uid]),
  db.query('SELECT i.id,i.created_at,i.amount_paise,o.method FROM billing_invoices i JOIN report_checkouts o ON o.id=i.checkout_id WHERE o.user_id=$1 ORDER BY i.id DESC',[uid]),
  db.query("SELECT count(*)::int n FROM billing_replay_usage WHERE user_id=$1 AND used_at>=date_trunc('month',now())",[uid]),
  db.query('SELECT id,method,renewal_action,grace_until,paid_until FROM report_checkouts WHERE user_id=$1 AND greatest(paid_until,grace_until)>now() ORDER BY paid_until DESC NULLS LAST',[uid]),
  db.query("SELECT 1 FROM mentor_entitlements WHERE user_id=$1 AND active AND (expires_at IS NULL OR expires_at>now())",[uid])
 ]);
 return {plans,verified:await verified(db,uid),current:mentor.rowCount?'mentor':sub.rows[0]?.plan??'free',profile:{...profile.rows[0],email:user.email},invoices:invoices.rows,usage:replays.rows[0].n,orders:orders.rows};
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
 await db.query("INSERT INTO billing_invoices(checkout_id,transaction_id,amount_paise,credit,details) SELECT $1,$2,$3,$4,jsonb_build_object('name',p.billing_name,'gstin',p.gstin,'address',p.address,'email',$6::text,'plan',$7::text,'method',$8::text,'seller',$9::jsonb,'tax',$10::jsonb,'quote', $11::jsonb) FROM (VALUES(1)) seed(n) LEFT JOIN billing_profiles p ON p.user_id=$5 ON CONFLICT(transaction_id) DO NOTHING",[order.id,transaction,amount,credit,order.user_id,order.recipient,order.plan,order.method,seller,tax,order.quote??null]);
}
export async function invoicePdf(row){
 const doc=new PDFDocument({margin:56});
 const chunks=[];const result=new Promise((ok,fail)=>{doc.on('data',x=>chunks.push(x));doc.on('end',()=>ok(Buffer.concat(chunks)));doc.on('error',fail);});
 const d=row.details;
 doc.fontSize(24).text(d.seller?.name||'Ledgerline').moveDown().fontSize(16).text('Invoice LL-'+String(row.id).padStart(6,'0')).fontSize(11);
 for(const line of [new Date(row.created_at).toISOString().slice(0,10),d.seller?.address,d.seller?.gstin&&'Supplier GSTIN '+d.seller.gstin,d.seller?.sac&&'SAC '+d.seller.sac,d.name,d.email,d.address,d.gstin&&'Customer GSTIN '+d.gstin,d.plan+' subscription',d.method,d.tax&&'Taxable value INR '+(d.tax.base/100).toFixed(2),d.tax&&'GST ('+d.tax.rate+'%) INR '+((Number(row.amount_paise)-d.tax.base)/100).toFixed(2),Number(row.credit)>0&&'Excess credited: '+row.credit+' '+(d.quote?.coin??''),'Receipt value INR '+(Number(row.amount_paise)/100).toFixed(2),'Transaction '+row.transaction_id])if(line)doc.moveDown(.5).text(String(line));
 doc.end();return result;
}