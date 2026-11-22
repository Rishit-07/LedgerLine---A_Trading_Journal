import {confirmationCard,showConfirmation} from '../../components/confirmation-motion.js';
import { houseRules, roomMarkup, bindRoom } from '../community/room.js';
import { button, submit } from '../../pages/workspace-ui.js';

const createPanel = `<section class="n-out ws-card community-create" data-create hidden><header class="ws-section-head"><h2>Create a space</h2><button type="button" class="n-btn n-out dash-button" data-close-create>Back</button></header><div class="mentor-create-steps" data-mentor-steps>Verify → Unlock plan → Create</div><div data-mentor-gate></div>
  <form class="ws-form" data-club-form><label>Space name<input name="name" required maxlength="60"></label>
  <label>About<textarea name="description" required maxlength="400" rows="3"></textarea></label>
  <label>City or region (optional)<input name="location" maxlength="60"></label>
  <label>Topic<input name="topic" maxlength="100" required></label><label>Student level<select name="studentLevel"><option>All levels</option><option>Beginner</option><option>Intermediate</option><option>Advanced</option></select></label>
  <label>Access<select name="joinMode"><option value="invite">Invite only</option><option value="request">Request to join</option></select></label><label>Member cap<input name="memberCap" type="number" min="1" max="50" value="50" required></label>
  <label>Cohort start (optional)<input name="cohortStart" type="date"></label><label>Cohort end (optional)<input name="cohortEnd" type="date"></label>
  <label>Space rules<textarea name="spaceRules" maxlength="1200" required>Keep discussions educational. Respect privacy and give constructive feedback.</textarea></label>
  <button class="n-btn n-acc dash-button">Create space</button></form></section>`;
export const spaces={
  title:'Mentor spaces',
  description:'Lead a space or join one.',
  endpoint:'/api/spaces',
  content:houseRules+`<section class="n-out ws-card community-hero"><div><small>Mentorship</small>
      <h2>Work on your process together.</h2><p>Set a goal, check in and discuss what you learned.</p></div>
      <div class="community-hero-actions"><button type="button" class="n-btn n-acc dash-button" data-start>Create a space</button></div></section>`+roomMarkup('space')+createPanel+'<p role="status" data-club-status></p>',
  bind(page,context){
    const manage=document.createElement('a');manage.className='n-btn n-out dash-button';manage.href='/mentor-verification';manage.textContent='Mentor verification';page.querySelector('.community-hero-actions').append(manage);
    if(context.data.mentor?.admin){const a=manage.cloneNode();a.href='/mentor-review';a.textContent='Reviewer queue';manage.after(a);}
    const joinNote=document.createElement('p');joinNote.textContent='Process stats are private. After joining, you can share them with this mentor and turn sharing off anytime.';page.querySelector('[data-code-form]').append(joinNote);
    bindRoom(page,context,{
      label:'space',plural:'spaces',title:'Mentor spaces',hostLabel:'Mentor',goals:'Goals',
      views:["My spaces","Goals","Members","Forum","Announcements","Create"],
      memberControls({group,about,action}){
        if(group.mentor_profile){const m=group.mentor_profile;const p=document.createElement('p');p.textContent=[m.display_name,'Verified mentor',...(m.topics??[]),m.bio].filter(Boolean).join(' · ');about.append(p);if(m.photo){const img=document.createElement('img');img.src='data:image/jpeg;base64,'+m.photo;img.alt='Mentor profile';img.width=56;about.append(img);}}
        if(group.space_rules){const rules=document.createElement('p');rules.textContent=group.space_rules;about.append(rules);}
        if(!group.owner){const report=button('Report this mentor',()=>{const reason=prompt('What should the reviewer know?');if(reason?.trim())action('Report',{action:'report',id:group.id,reason},'Report sent to the reviewer.').click();});about.append(report);}
        if(!group.owner)about.append(action(group.statsOptIn?'Stop sharing my process stats':'Share my process stats with my mentor',{action:'consent',id:group.id,enabled:!group.statsOptIn},'Sharing preference saved.'));
      },
      bindCreate({page,form,status,data,update,created}){
  const gate=page.querySelector('[data-mentor-gate]');
  const steps=page.querySelector('[data-mentor-steps]');
  const hero=page.querySelector('.community-hero');
  let credential,timer;
  const key=context.uid?'ledgerline:mentor-approved:'+context.uid:null;
  function showApproval(){
    if(credential)return;
    let first=true;
    try{if(key){first=!localStorage.getItem(key);localStorage.setItem(key,'seen');}}catch{}
    credential=confirmationCard('mentor','Your mentor verification is approved.');
    if(first)showConfirmation('mentor','Your mentor verification is approved.');
    hero.after(credential);
  }
  function watchApproval(){
    if(timer||!context.reload||data.mentor.verification!=='pending')return;
    timer=setTimeout(async()=>{
      timer=null;
      if(!page.isConnected)return;
      if(!document.hidden){
        try{
          const fresh=await context.reload();
          if(!page.isConnected)return;
          data.mentor=fresh.mentor;
          if(data.mentor.verification!=='pending'){refresh();return;}
        }catch{}
      }
      watchApproval();
    },20000);
  }
  steps.after(gate);
  form.onsubmit=e=>submit(e,status,async values=>{await update({...values,action:'create'});created();return 'Created '+values.name+'.';});
  function refresh(){
    const {verification,entitled,requested}=data.mentor;
    if(verification==='approved')showApproval();
    else {credential?.remove();credential=null;try{if(key)localStorage.removeItem(key);}catch{}}
    watchApproval();
    form.hidden=!(entitled&&verification==='approved');
    gate.replaceChildren();
    if(entitled)return;
    const verified=verification==='approved';
    const pending=verified?requested:verification==='pending';
    if(!verified){const verify=button(verification==='pending'?'View application':'Verify you teach',()=>location.assign('/mentor-verification'));gate.append(verify);return;}
    if(verified){gate.append(button('Unlock plan',()=>location.assign('/billing?plan=mentor&from=spaces')));return;}
    const control=button(verified?(pending?'Unlock requested':'Unlock'):(pending?'Verification pending':'Verify'),async()=>{
      control.disabled=true;
      try{await update({action:verified?'unlock':'verify'});refresh();}
      catch(error){status.textContent=error.message;control.disabled=false;}
    });
    control.disabled=Boolean(pending);
    gate.append(control);
  }
  refresh();
  return refresh;
}
    });
  }
};
