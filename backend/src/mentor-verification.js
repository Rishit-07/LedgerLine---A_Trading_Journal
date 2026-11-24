import {createHmac} from 'node:crypto';
import {fields,sectionError,termsVersion} from '../../src/config/mentor-form.js';
import {readJson,send} from './http.js';
import {prepareScreenshot,imageRequestLimit} from './trade-screenshots.js';

const keys=fields.flat().map(([name])=>name);
const editable=['draft','needs_info','rejected','revoked'];
// The one address allowed to review mentor applications. Set REVIEWER_EMAIL to change it without editing code.
const adminEmail=(process.env.REVIEWER_EMAIL||'sairishitsunku@gmail.com').toLowerCase();
// With REQUIRE_REVIEWER_MFA=true the reviewer must have turned on two-step sign-in and entered the code for this sign-in.
const needsMfa=()=>process.env.REQUIRE_REVIEWER_MFA==='true';
export const eligibleReviewer=u=>u.email_verified===true&&u.email?.toLowerCase()===adminEmail&&(!needsMfa()||u.mfa===true);
export async function reviewer(u,auth){
 if(!eligibleReviewer(u))return false;
 if(u.admin===true||u.reviewer===true)return true;
 const record=await auth.getUser(u.uid);
 if(!record.emailVerified||record.email?.toLowerCase()!==adminEmail)return false;
 if(!record.customClaims?.reviewer&&!record.customClaims?.admin)await auth.setCustomUserClaims(u.uid,{...record.customClaims,reviewer:true});
 const claims=(await auth.getUser(u.uid)).customClaims;
 return claims?.admin===true||claims?.reviewer===true;
}
const reject=(msg,status=400)=>{throw Object.assign(new Error(msg),{status});};
function view(row){
 if(!row)return {status:'draft',step:0};
 const {accepted_ip_hash,reviewer_id,user_id,photo,...safe}=row;
 return {...safe,photo:photo?.toString('base64')??null};
}
export function mentorVerification(pool,authenticate,auth,admin=false){
 return async(req,res)=>{
  const user=await authenticate(req,res);if(!user)return;
  let db;
  try{
   if(admin&&!await reviewer(user,auth))return send(res,403,{error:'Reviewer access required.'});
   const url=new URL(req.url,'http://localhost');
   if(req.method==='GET'){
    if(!admin){
     const {rows:[r]}=await pool.query('SELECT * FROM mentor_verifications WHERE user_id=$1',[user.uid]);
     const phone = r?.phone || user.phone_number || (await pool.query('SELECT contact_phone FROM user_profile WHERE user_id=$1',[user.uid])).rows[0]?.contact_phone;
     return send(res,200,{...view(r),phone:phone || null,email:user.email,admin:eligibleReviewer(user)});
    }
    const id=url.searchParams.get('id');
    if(!id)return send(res,200,{items:(await pool.query("SELECT id,display_name,status,next_review_at FROM mentor_verifications WHERE status IN ('pending','approved') ORDER BY (status='pending') DESC,next_review_at NULLS LAST,submitted_at")).rows});
    const {rows:[r]}=await pool.query('SELECT * FROM mentor_verifications WHERE id::text=$1',[id]);if(!r)reject('Application unavailable.',404);
    const events=(await pool.query('SELECT action,reason,created_at FROM mentor_review_events WHERE verification_id=$1 ORDER BY id DESC',[id])).rows;
    const reports=(await pool.query("SELECT reason,created_at FROM mentor_reports WHERE mentor_id=$1 AND status='open'",[r.user_id])).rows;
    return send(res,200,{record:view(r),events,reports});
   }
   const {data,error}=await readJson(req,admin?4096:imageRequestLimit+24000);if(error||!data)reject('Invalid form.',error??400);
   db=await pool.connect();await db.query('BEGIN');
   let r;
   if(admin){
    r=(await db.query('SELECT * FROM mentor_verifications WHERE id::text=$1 FOR UPDATE',[data.id])).rows[0];
    if(!r||!['approved','needs_info','rejected','revoked'].includes(data.action))reject('Invalid decision.');
    if(!(r.status==='pending'&&data.action!=='revoked'||r.status==='approved'&&['revoked','approved'].includes(data.action)))reject('Review status has changed.',409);
    if(typeof data.reason!=='string'||data.reason.length>600||(!data.reason.trim()&&data.action!=='approved'))reject('Enter the reason or question.');
    await db.query("UPDATE mentor_verifications SET status=$2,reviewer_id=$3,reviewed_at=now(),reviewer_note=$4,next_review_at=CASE WHEN $2='approved' THEN now()+interval '12 months' END WHERE id=$1",[r.id,data.action,user.uid,data.reason]);
    await db.query("UPDATE mentor_reports SET status='reviewed' WHERE mentor_id=$1",[r.user_id]);
    await db.query("INSERT INTO admin_audit_log(actor_id,action,target,detail) VALUES($1,$2,$3,$4)",[user.uid,'mentor_'+data.action,String(r.id),JSON.stringify({previous_status:r.status,subject:r.user_id})]);
   }else{
    await db.query('SELECT pg_advisory_xact_lock(hashtextextended($1,19))',[user.uid]);
    await db.query("INSERT INTO mentor_verifications(user_id,status,email) VALUES($1,'draft',$2) ON CONFLICT DO NOTHING",[user.uid,user.email]);
    r=(await db.query('SELECT * FROM mentor_verifications WHERE user_id=$1 FOR UPDATE',[user.uid])).rows[0];
    if(data.action==='withdraw'){
     await db.query('DELETE FROM mentor_mail WHERE recipient=$1',[user.email]);
     await db.query('DELETE FROM mentor_reports WHERE mentor_id=$1',[user.uid]);
     await db.query('UPDATE mentor_review_events SET reason=NULL WHERE verification_id=$1',[r.id]);
     await db.query('DELETE FROM mentor_verifications WHERE user_id=$1',[user.uid]);
    }else{
     if(!editable.includes(r.status))reject('This application is already under review or approved.',409);
     if(!['save','submit'].includes(data.action)||!Number.isInteger(data.step)||!fields[data.step])reject('Unknown step.');
     const section=fields[data.step].map(([k])=>k);
     const next={...r,...Object.fromEntries(section.map(k=>[k,data.values?.[k]??null]))};
     for(const i of data.action==='submit'?fields.map((_,i)=>i):[data.step]){const problem=sectionError(next,i);if(problem)reject(problem);}
     if((data.step===0 || data.action==='submit') && !(data.step===0 && data.photo!==undefined ? data.photo : r.photo))
       reject('Take or upload a profile photo.');
     const changed=section.map((k,i)=>k+'=$'+(i+2)).join(',');
     await db.query('UPDATE mentor_verifications SET '+changed+' WHERE user_id=$1',[user.uid,...section.map(k=>next[k])]);
     if(data.step===0&&data.photo!==undefined){
      let photo=null;if(data.photo!==null){try{photo=await prepareScreenshot(data.photo);}catch{reject('Choose a valid photo under 1 MB.');}}
      await db.query('UPDATE mentor_verifications SET photo=$2 WHERE user_id=$1',[user.uid,photo]);
     }
     if(data.action==='submit'){
      const count=await db.query("SELECT count(*)::int n FROM mentor_review_events WHERE actor_id=$1 AND action='submit' AND created_at>now()-interval '30 days'",[user.uid]);
      if(count.rows[0].n>=3)reject('You can submit up to three applications per 30 days.',429);
      const secret=process.env.MENTOR_IP_HASH_KEY;if(!secret)reject('Verification submission is temporarily unavailable.',503);
      const hash=createHmac('sha256',secret).update(req.socket.remoteAddress??'').digest('hex');
      await db.query("UPDATE mentor_verifications SET status='pending',submitted_at=now(),terms_version=$2,conduct_version=$2,accepted_at=now(),accepted_ip_hash=$3,email=$4,reviewer_note=NULL WHERE user_id=$1",[user.uid,termsVersion,hash,user.email]);
     }else await db.query('UPDATE mentor_verifications SET step=$2 WHERE user_id=$1',[user.uid,Math.min(4,data.step+1)]);
    }
   }
   if(data.action!=='save'){
    await db.query('INSERT INTO mentor_review_events(verification_id,actor_id,action,reason) VALUES($1,$2,$3,$4)',[r.id,user.uid,data.action,admin?data.reason:null]);
    if(r.email)await db.query('INSERT INTO mentor_mail(recipient,status) VALUES($1,$2)',[r.email,data.action]);
   }
   await db.query('COMMIT');send(res,200,{saved:true});
  }catch(e){if(db)await db.query('ROLLBACK').catch(()=>{});send(res,e.status??503,{error:e.status?e.message:'Mentor verification is unavailable.'});}finally{db?.release();}
 };
}
