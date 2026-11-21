import {fields,steps,sectionError,termsVersion} from '../../../../src/config/mentor-form.js';
import {node,button} from '../../pages/workspace-ui.js';
import {confirmationCard} from '../../components/confirmation-motion.js';
import '../../components/billing-ready.css';
const path='/api/mentor-verification';
function link(label,href){const a=node('a',label,'n-btn n-out dash-button');a.href=href;return a;}
export const application={title:'Verify you teach',description:'Apply for human review before unlocking your mentor plan.',endpoint:path,content:'<section class="n-out ws-card mentor-application"></section>',bind(page,{data,request}){
 const root=page.querySelector('.mentor-application');let step=data.step??0,stream,photo=data.photo,editing=false,epoch=0;
 function stop(){epoch++;stream?.getTracks().forEach(t=>t.stop());stream=null;}
 window.addEventListener('pagehide',stop,{once:true});
 function draw(){
  stop();root.replaceChildren();const status=node('p');status.setAttribute('role','status');
  if(data.admin)root.append(link('Reviewer queue','/mentor-review'));
  if(!editing&&['pending','needs_info','rejected','approved','revoked'].includes(data.status)){
   if(data.status==='approved')root.append(confirmationCard('mentor','Your application has been approved.',false));
   else root.append(node('h2',({pending:'Submitted for review',needs_info:'More information requested',rejected:'Application declined',revoked:'Verification revoked'})[data.status]));
   root.append(node('p',data.reviewer_note||(data.status==='pending'?'Estimated review time: 3–5 business days. We’ll email you when your status changes.':'')),link('Return to Spaces','/spaces'));
   if(!['pending','approved'].includes(data.status))root.append(button('Reapply with changes',()=>{editing=true;step=0;draw();}));
  }else{
   const form=node('form','','ws-form mentor-step');root.append(form);
   form.append(node('small','Step '+(step+1)+' of '+steps.length),node('h2',steps[step]));
   const progress=node('progress');progress.max=steps.length;progress.value=step+1;progress.setAttribute('aria-label','Application progress');form.append(progress);
   if(!step){
    form.append(node('p','Verified account · '+data.email),node('p','Reviewers can see this application. Students can see your display name, optional photo, topics, bio and verified badge.'));
   }
   const getters={};
   for(const [key,label,type,limit] of fields[step]){
    const wrap=node(type==='multi'?'fieldset':'label');form.append(wrap);
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
    wrap.dataset.field=key;
   }
   if(step===3){const sync=()=>{const answer=getters.sebi_registered();for(const [k,visible] of [['education_only_ack',answer===false],['sebi_reg_number',answer===true],['sebi_verify_url',answer===true]])form.querySelector('[data-field='+k+']').hidden=!visible;};form.addEventListener('change',sync);sync();}
   if(!step){
    const preview=node('img','','mentor-photo');preview.alt='Your profile photo';preview.hidden=!photo;if(photo)preview.src='data:image/jpeg;base64,'+photo;
    const video=node('video','','mentor-photo');video.muted=true;video.playsInline=true;video.hidden=true;
    const store=source=>{const canvas=document.createElement('canvas'),w=source.videoWidth||source.naturalWidth,h=source.videoHeight||source.naturalHeight;if(!w||!h)throw Error('Wait for the camera image.');const scale=Math.min(1,720/Math.max(w,h));canvas.width=Math.round(w*scale);canvas.height=Math.round(h*scale);canvas.getContext('2d').drawImage(source,0,0,canvas.width,canvas.height);preview.src=canvas.toDataURL('image/jpeg',.84);photo=preview.src.split(',')[1];preview.hidden=false;};
    const capture=button('Take photo',()=>{try{store(video);stop();video.hidden=capture.hidden=true;}catch(e){status.textContent=e.message;}});capture.hidden=true;
    const start=button('Open camera',async()=>{stop();const ticket=epoch;try{const camera=await navigator.mediaDevices.getUserMedia({video:{facingMode:'user'},audio:false});if(epoch!==ticket||!video.isConnected){camera.getTracks().forEach(t=>t.stop());return;}stream=camera;video.srcObject=camera;video.hidden=false;await video.play();capture.hidden=false;}catch{stop();status.textContent='Camera unavailable. Allow camera access, upload a photo, or continue without one.';}});
    const file=node('input');file.type='file';file.accept='image/jpeg,image/png,image/webp';file.onchange=async()=>{const blob=file.files[0];if(!blob)return;if(blob.size>5*1024*1024||!['image/jpeg','image/png','image/webp'].includes(blob.type)){status.textContent='Choose a JPEG, PNG or WebP under 5 MB.';return;}const url=URL.createObjectURL(blob);try{const im=new Image();im.src=url;await im.decode();store(im);}catch{status.textContent='Unable to read photo.';}finally{URL.revokeObjectURL(url);}};
    const l=node('label','Profile photo (optional)');l.append(file);form.append(l,preview,video,start,capture,button('Remove photo',()=>{stop();video.hidden=capture.hidden=true;photo=null;preview.hidden=true;preview.removeAttribute('src');}));
   }
   if(step===4)form.append(link('Terms and conditions','/terms'),node('p','Mentor code · Teach for education only. Do not promise returns, provide trading calls, or sell signals. Version '+termsVersion));
   const actions=node('div','','ws-actions mentor-step-actions');form.append(status,actions);
   if(step)actions.append(button('Back',()=>{Object.assign(data,Object.fromEntries(Object.entries(getters).map(([k,get])=>[k,get()])));step--;draw();}));
   const next=node('button',step===4?'Submit for review':'Save and continue','n-btn n-acc dash-button');actions.append(next);
   form.onsubmit=async e=>{e.preventDefault();const values=Object.fromEntries(Object.entries(getters).map(([k,get])=>[k,get()]));if(step===3){if(values.sebi_registered)values.education_only_ack=false;else values.sebi_reg_number=values.sebi_verify_url='';}const problem=sectionError(values,step);if(problem){status.textContent=problem;return;}const last=step===4;next.disabled=true;
    try{await request(path,'POST',{action:last?'submit':'save',step,values,...(!step?{photo:photo??null}:{})});Object.assign(data,values);if(last){data.status='pending';data.reviewer_note='';editing=false;}else step++;draw();}
    catch(e){status.textContent=e.message;next.disabled=false;}
   };
  }
  if(data.status!=='draft'||data.id)root.append(button('Withdraw and delete application',async()=>{if(!confirm('Delete your verification data and revoke mentor access?'))return;try{await request(path,'POST',{action:'withdraw'});location.assign('/spaces');}catch(e){status.textContent=e.message;}}));
  if(!status.isConnected)root.append(status);
 }
 draw();
}};

