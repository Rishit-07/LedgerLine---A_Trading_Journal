import {branded} from './email-layout.js';
export function startMentorMail(pool,config){
 if(!config)return;
 let running=false;
 async function drain(){
  if(running)return;running=true;
  try{
   for(let i=0;i<10;i++){
    const {rows:[job]}=await pool.query(`WITH candidate AS (SELECT id FROM mentor_mail WHERE retry_at<=now() ORDER BY id LIMIT 1 FOR UPDATE SKIP LOCKED)
     UPDATE mentor_mail SET retry_at=now()+interval '5 minutes' FROM candidate WHERE mentor_mail.id=candidate.id RETURNING mentor_mail.*`);
    if(!job)break;
    const label=({submit:'Submitted for review',needs_info:'More information requested',approved:'Approved',rejected:'Declined',revoked:'Verification revoked',withdraw:'Application withdrawn'})[job.status];
    const m=branded({title:'Mentor verification: '+label,lines:['Your mentor verification status has changed. '+label+'.','Open your private application for the details.'],action:{label:'Open my application',href:new URL('/mentor-verification',config.origin).href},origin:config.origin,reason:'You are getting this because you applied to be a Ledgerline mentor.'});
    const message={from:config.from,to:[job.recipient],subject:'Ledgerline mentor verification · '+label,text:m.text,html:m.html};
    if(config.provider==='gmail')await config.transporter.sendMail({...message,to:{address:job.recipient}});
    else{const resp=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+config.apiKey,'Content-Type':'application/json','Idempotency-Key':'mentor-event-'+job.id},body:JSON.stringify(message),signal:AbortSignal.timeout(8000)});if(!resp.ok)throw Error('Delivery deferred');}
    await pool.query('DELETE FROM mentor_mail WHERE id=$1',[job.id]);
   }
  }catch{console.warn('Mentor notification delivery deferred.');}finally{running=false;}
 }
 setInterval(drain,30000).unref();
}
