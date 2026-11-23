import {fields,steps,mentorFieldApplies,sectionError,termsVersion} from '../../../../src/config/mentor-form.js';
import {node,button} from '../../pages/workspace-ui.js';
import {confirmationCard} from '../../components/confirmation-motion.js';
import {setRequired,requireAny} from '../../controls.js';
import '../../components/billing-ready.css';
import '../../pages/onboarding.css';
import './application.css';
const path='/api/mentor-verification';
function link(label,href){const a=node('a',label,'btn btn-secondary');a.href=href;return a;}
export const application={title:'Verify you teach',description:'Apply for human review before unlocking your mentor plan.',endpoint:path,content:'<section class="mentor-application"></section>',bind(page,{data,request}){
 const root=page.querySelector('.mentor-application');let step=data.step??0,stream,photo=data.photo,editing=false,epoch=0;
 function stop(){epoch++;stream?.getTracks().forEach(t=>t.stop());stream=null;}
 window.addEventListener('pagehide',stop,{once:true});
 function draw(direction=0){
  stop();root.replaceChildren();const status=node('p');status.setAttribute('role','status');
  root.classList.toggle('mentor-status-card',!editing && ['pending','needs_info','rejected','approved','revoked'].includes(data.status));
  if(data.admin)root.append(link('Reviewer queue','/mentor-review'));
  if(!editing&&['pending','needs_info','rejected','approved','revoked'].includes(data.status)){
   if(data.status==='approved')root.append(confirmationCard('mentor','Your application has been approved.'));
   else root.append(node('h2',({pending:'Submitted for review',needs_info:'More information requested',rejected:'Application declined',revoked:'Verification revoked'})[data.status]));
   root.append(node('p',data.reviewer_note||(data.status==='pending'?'Estimated review time: 3–5 business days. We’ll email you when your status changes.':'')),link('Return to Spaces','/spaces'));
   if(!['pending','approved'].includes(data.status))root.append(button('Reapply with changes',()=>{editing=true;step=0;draw();}));
  }else{
   const tracker=node('ol','','onboarding-progress mentor-progress');
   tracker.setAttribute('aria-label','Verification steps');
   tracker.style.setProperty('--onboarding-progress',(100*step/(steps.length-1))+'%');
   steps.forEach((label,i)=>{
    const item=node('li');
    if(i===step)item.setAttribute('aria-current','step');
    if(i<step)item.className='is-complete';
    const number=node('span',i<step?'✓':String(i+1),i===step?'n-in':'n-out');
    number.setAttribute('aria-hidden','true');
    item.append(number,label);
    tracker.append(item);
   });
   const form=node('form','','ws-form n-out mentor-step');
   form.dataset.direction=direction<0?'back':'next';
   const head=node('header','','mentor-step-head');
   const title=node('h2',steps[step]);
   title.tabIndex=-1;
   head.append(node('small','Step '+(step+1)+' of '+steps.length),title);
   form.append(head);
   root.append(tracker,form);
   if(!step){
    head.append(node('p','Verified account · '+data.email),node('p','Reviewers can see this application. Students can see your display name, photo, topics, bio and verified badge.'));
   }
   const group=node('div','','mentor-fields');form.append(group);
   const getters={};
   for(const [key,label,type,limit] of fields[step]){
    const wrap=node(type==='multi'?'fieldset':'label');group.append(wrap);wrap.dataset.field=key;wrap.dataset.kind=type;
    if(type==='multi'){
     wrap.append(node('legend',label));
     for(const choice of limit){const l=node('label'),i=node('input');i.type='checkbox';i.value=choice;i.checked=data[key]?.includes(choice)??false;l.append(i,' '+choice);wrap.append(l);}
     getters[key]=()=>[...wrap.querySelectorAll(':checked')].map(i=>i.value);continue;
    }
    wrap.append(label);const el=node(type==='boolean'?'select':['textarea','links'].includes(type)?'textarea':'input','','n-in');wrap.append(el);
    if(type==='boolean'){for(const [v,l] of [['','Choose'],['yes','Yes'],['no','No']])el.append(new Option(l,v));el.value=data[key]==null?'':data[key]?'yes':'no';getters[key]=()=>el.value===''?null:el.value==='yes';}
    else if(type==='check'){el.type='checkbox';el.checked=!!data[key];getters[key]=()=>el.checked;}
    else{
     if(el.tagName==='INPUT')el.type=['url','number','tel'].includes(type)?type:'text';
     if(['text','tel','textarea','url'].includes(type))el.maxLength=limit;
     if(type==='links')el.placeholder='One link per line';if(type==='list')el.placeholder='Languages, separated by commas';
     el.value=Array.isArray(data[key])?data[key].join(type==='links'?'\n':', '):data[key]??'';
     getters[key]=()=>type==='number'?(el.value===''?null:Number(el.value)):['links','list'].includes(type)?el.value.split(type==='links'?/\s+/:/,/).map(x=>x.trim()).filter(Boolean):el.value.trim();
    }

   }
   // Required fields match sectionError(): each one is marked, glows red when empty and blocks Save and continue.
   const control=key=>form.querySelector('[data-field='+key+'] :is(input,textarea,select)');
   const need=(key,message,min)=>{const el=control(key);if(!el)return;el.dataset.requiredMessage=message;if(min)el.minLength=min;};
   const anyOf=(key,message)=>{const wrap=form.querySelector('[data-field='+key+']');if(wrap)requireAny(wrap,message);};
   if(step===0){
    need('full_name','Add your full name before saving');
    need('display_name','Add the name students will see');
    need('phone','Add your phone number');
    need('country','Add your country');
    need('city','Add your city');
   }
   if(step===1){
    anyOf('topics','Choose at least one topic');
    anyOf('markets','Choose at least one market');
    anyOf('levels','Choose at least one student level');
    need('languages','Add the languages you teach');
    need('bio','Describe your trading and teaching experience',50);
    need('other_topic','Name your other topic');
   }
   if(step===2){
    need('evidence_links','Add at least one link to your teaching');
    need('sample_link','Add a sample lesson or syllabus link');
    need('certifications','Add your certifications');
    need('past_students_self_reported','Add your number of past students');
   }
   if(step===3){
    need('sebi_registered','Choose Yes or No');
    need('education_only_ack','Confirm you will teach education only');
    need('sebi_reg_number','Add your registration number');
    need('sebi_verify_url','Add the link where your registration can be verified');
   }
   if(step===4){
    for(const box of form.querySelectorAll('[data-field=promises] input')){
     box.dataset.requiredMessage='Accept this promise to submit';
     setRequired(box,true);
    }
   }

   /* Conditional fields participate in browser validation only while applicable. */
   const syncFields=()=>{
    const answers={topics:getters.topics?.(),sebi_registered:getters.sebi_registered?.()};
    for(const wrap of group.children){
     const applies=mentorFieldApplies(wrap.dataset.field,answers);
     wrap.hidden=!applies;
     for(const input of wrap.querySelectorAll('input,select,textarea')){
      input.disabled=!applies;
      if(wrap.dataset.kind!=='multi')setRequired(input,applies);
     }
    }
   };
   form.addEventListener('change',syncFields);
   syncFields();
   if(!step){
    const preview=node('img','','mentor-photo');preview.alt='Your profile photo';preview.hidden=!photo;if(photo)preview.src='data:image/jpeg;base64,'+photo;
    const video=node('video','','mentor-photo');video.muted=true;video.playsInline=true;video.hidden=true;
    const store=source=>{const canvas=document.createElement('canvas'),w=source.videoWidth||source.naturalWidth,h=source.videoHeight||source.naturalHeight;if(!w||!h)throw Error('Wait for the camera image.');const scale=Math.min(1,720/Math.max(w,h));canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);preview.src=canvas.toDataURL('image/jpeg',.84);photo=preview.src.split(',')[1];preview.hidden=false;};
    const capture=button('Take photo',()=>{try{store(video);stop();video.hidden=capture.hidden=true;}catch(e){status.textContent=e.message;}});capture.hidden=true;
    const start=button('Open camera',async()=>{stop();const ticket=epoch;try{const camera=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});if(epoch!==ticket||!video.isConnected){camera.getTracks().forEach(t=>t.stop());return;}stream=camera;video.srcObject=camera;video.hidden=false;await video.play();capture.hidden=false;}catch{stop();status.textContent='Camera unavailable. Allow camera access, or upload a photo.';}});
    const file=node('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.onchange=async()=>{const blob=file.files[0];if(!blob)return;if(blob.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(blob.type)){status.textContent='Choose a JPEG, PNG or WebP under 5 MB.';return;}const url=URL.createObjectURL(blob);try{const im=new Image();im.src=url;await im.decode();store(im);}catch{status.textContent='Unable to read photo.';}finally{URL.revokeObjectURL(url);}};
    const l=node('label','Profile photo (required)');l.append(file);const photos=node('div','','mentor-photo-section');
    const photoActions=node('div','','ws-actions');
    form.append(photos);photos.append(l,preview,video,photoActions);photoActions.append(start,capture,button('Remove photo',()=>{stop();video.hidden=capture.hidden=true;photo=null;preview.hidden=true;preview.removeAttribute('src');}));
   }
   if(step===4)form.append(link('Terms and conditions','/terms'),node('p','Mentor code · Teach for education only. Do not promise returns, provide trading calls, or sell signals. Version '+termsVersion));
   const actions=node('div','','form-actions mentor-step-actions');form.append(status,actions);
   if(step)actions.append(button('Back',()=>{Object.assign(data,Object.fromEntries(Object.entries(getters).map(([k,get])=>[k,get()])));step--;draw(-1);}));
   const next=node('button',step===4?'Submit for review':'Save and continue','btn btn-primary');actions.append(next);
   form.onsubmit=async e=>{e.preventDefault();const values=Object.fromEntries(Object.entries(getters).map(([k,get])=>[k,get()]));if(step===3){if(values.sebi_registered)values.education_only_ack=false;else values.sebi_reg_number=values.sebi_verify_url='';}const problem=sectionError(values,step)||(!step&&!photo?'Take or upload a profile photo.':'');if(problem){status.textContent=problem;return;}const last=step===4;next.disabled=true;for(const control of actions.children)control.disabled=true;
    try{await request(path,'POST',{action:last?'submit':'save',step,values,...(!step?{photo:photo??null}:{})});Object.assign(data,values);if(last){data.status='pending';data.reviewer_note='';editing=false;}else step++;draw(1);}
    catch(e){status.textContent=e.message;for(const control of actions.children)control.disabled=false;}
   };
   if(direction) {title.focus({preventScroll:true});tracker.scrollIntoView({block:'nearest',behavior:'instant'});}
  }
  if(data.status!=='draft'||data.id)root.append(button('Withdraw and delete application',async()=>{if(!confirm('Delete your verification data and revoke mentor access?'))return;try{await request(path,'POST',{action:'withdraw'});location.assign('/spaces');}catch(e){status.textContent=e.message;}}));
  if(!status.isConnected)root.append(status);
 }
 draw();
}};

