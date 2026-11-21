import {node,button} from '../../pages/workspace-ui.js';
import {fields,validLink} from '../../../../src/config/mentor-form.js';
const path='/api/mentor-review';
export const reviewerPage={title:'Mentor reviews',description:'Review teaching evidence and verification requests.',endpoint:path,content:'<section class="n-out ws-card ws-stack" data-reviewer></section>',bind(page,{data,request}){
 const root=page.querySelector('[data-reviewer]'),msg=node('p');msg.setAttribute('role','status');
 function queue(){
  root.replaceChildren(node('h2','Review queue'));
  for(const r of data.items)root.append(button((r.display_name||'Mentor')+' · '+r.status+(r.next_review_at&&Date.parse(r.next_review_at)<=Date.now()?' · Review due':''),()=>open(r.id).catch(e=>msg.textContent=e.message)));
  if(!data.items.length)root.append(node('p','No applications to review.'));root.append(msg);
 }
 async function open(id){
  const {record:r,events,reports}=await request(path+'?id='+encodeURIComponent(id),'GET');root.replaceChildren(button('Back to queue',queue),node('h2',r.display_name||'Mentor application'),node('p',r.email));
  if(r.photo){const im=node('img','','mentor-photo');im.src='data:image/jpeg;base64,'+r.photo;im.alt='Submitted profile photo';root.append(im);}
  for(const [k,label,type] of fields.flat()){const v=r[k];if(v==null||v==='')continue;const row=node('div');row.append(node('strong',label+' '));
   if(type==='url'||type==='links'){for(const url of [].concat(v)){if(!validLink(url))continue;const a=node('a',url);a.href=url;a.target='_blank';a.rel='noopener noreferrer';row.append(a,' ');}}else row.append(Array.isArray(v)?v.join(', '):String(v));root.append(row);}
  root.append(node('p','Terms '+(r.terms_version??'—')+' · Code '+(r.conduct_version??'—')),node('h3','Review history'));
  for(const ev of events)root.append(node('p',new Date(ev.created_at).toLocaleString()+' · '+ev.action+' '+(ev.reason??'')));
  for(const ticket of reports)root.append(node('p','Student report · '+ticket.reason));
  const reason=node('textarea','','n-in');reason.maxLength=600;reason.placeholder='Reason or follow-up question';reason.setAttribute('aria-label',reason.placeholder);root.append(reason);
  const actions=node('div','','ws-actions');root.append(actions,msg);
  for(const [action,label] of (r.status==='approved'?[['approved','Renew verification'],['revoked','Revoke badge']]:r.status==='pending'?[['approved','Approve'],['needs_info','Ask for more information'],['rejected','Reject']]:[]))actions.append(button(label,async()=>{
   if(action!=='approved'&&!reason.value.trim()){msg.textContent='Enter your reason or question.';return;}
   if(!confirm(label+' this mentor application?'))return;
   try{await request(path,'POST',{id,action,reason:reason.value});data=await request(path,'GET');queue();msg.textContent='Decision saved.';}catch(e){msg.textContent=e.message;}
  }));
 }
 queue();
}};
