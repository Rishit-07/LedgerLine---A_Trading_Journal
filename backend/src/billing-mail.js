import {invoicePdf} from './billing-ledger.js';
import {branded} from './email-layout.js';
export function startBillingMail(pool,config){
 if(!config)return;
 let running=false;
 async function deliver(id,email,subject,text,file,html){
  const filename='Ledgerline-'+id+'.pdf';
  if(config.provider==='gmail')return config.transporter.sendMail({messageId:'<billing-'+id+'@ledgerline.local>',from:config.from,to:{address:email},subject,text,...(html?{html}:{}),attachments:file?[{filename,content:file}]:[]});
  const response=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+config.apiKey,'Content-Type':'application/json','Idempotency-Key':'billing-'+id},body:JSON.stringify({from:config.from,to:[email],subject,text,...(html?{html}:{}),attachments:file?[{filename,content:file.toString('base64')}]:[]}),signal:AbortSignal.timeout(10000)});
  if(!response.ok)throw Error('Delivery deferred');
 }
 async function drain(){
  if(running)return;running=true;
  try{
   const {rows:[row]}=await pool.query(`WITH job AS (SELECT id FROM billing_invoices WHERE mailed_at IS NULL AND details->>'email' IS NOT NULL AND retry_at<=now() ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
    UPDATE billing_invoices i SET retry_at=now()+interval '5 minutes' FROM job WHERE i.id=job.id RETURNING i.*`);
   if(row){
    const m=branded({title:'Payment confirmed',lines:['Your payment is confirmed. Your invoice is attached as a PDF.'],action:{label:'Open billing',href:new URL('/billing',config.origin).href},origin:config.origin,reason:'You are getting this because you bought a Ledgerline plan.'});
    await deliver(row.id,row.details.email,'Your Ledgerline invoice',m.text,await invoicePdf(row),m.html);
    await pool.query('UPDATE billing_invoices SET mailed_at=now() WHERE id=$1',[row.id]);
   }
   await pool.query(`INSERT INTO billing_reminder_queue(checkout_id) SELECT id FROM report_checkouts o WHERE NOT reminder_sent AND recipient IS NOT NULL AND renewal_action IS NULL AND paid_until BETWEEN now() AND now()+interval '7 days' AND NOT EXISTS(SELECT 1 FROM report_checkouts later WHERE later.user_id=o.user_id AND later.plan=o.plan AND later.paid_until>o.paid_until) ON CONFLICT DO NOTHING`);
   const {rows:[job]}=await pool.query(`WITH job AS (SELECT checkout_id FROM billing_reminder_queue WHERE retry_at<=now() LIMIT 1 FOR UPDATE SKIP LOCKED)
    UPDATE billing_reminder_queue q SET retry_at=now()+interval '5 minutes' FROM job,report_checkouts o WHERE q.checkout_id=job.checkout_id AND o.id=q.checkout_id RETURNING o.*`);
   if(job){
    if(!job.renewal_action&&new Date(job.paid_until)>new Date()){const until=new Date(job.paid_until).toISOString().slice(0,10),href=new URL('/billing',config.origin).href;
     const m=branded({title:'Your plan period ends soon',lines:['Your '+job.plan+' period ends on '+until+'.'].concat(job.method==='Crypto'?['Prepaid access does not auto-renew, so nothing is charged unless you choose to renew.']:[]),action:{label:'Open billing',href},origin:config.origin,reason:'You are getting this because you bought a Ledgerline plan.'});
     await deliver('renew-'+job.id+'-'+new Date(job.paid_until).getTime(),job.recipient,'Your Ledgerline plan period ends soon',m.text,undefined,m.html);}
    await pool.query('WITH sent AS (UPDATE report_checkouts SET reminder_sent=true WHERE id=$1) DELETE FROM billing_reminder_queue WHERE checkout_id=$1',[job.id]);
   }
  }catch{console.warn('Billing mail delivery deferred.');}finally{running=false;}
 }
 setInterval(drain,60000).unref();
}