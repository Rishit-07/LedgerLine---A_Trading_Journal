import { groupRoom } from '../community/room.js';
import { button, submit } from '../../pages/workspace-ui.js';

const createPanel = `<section class="n-out ws-card community-create" data-create hidden><h2>Create a space</h2><div data-mentor-steps>Verify → Unlock plan → Create</div><div data-mentor-gate></div>
  <form class="ws-form" data-club-form><label>Space name<input name="name" required maxlength="60"></label>
  <label>About<textarea name="description" required maxlength="400" rows="3"></textarea></label>
  <label>City or region (optional)<input name="location" maxlength="60"></label>
  <button class="n-btn n-acc dash-button">Create space</button></form><button type="button" class="n-btn n-out dash-button" data-close-create>Back</button></section>`;
export const spaces=groupRoom({isSpace:true,endpoint:'/api/spaces',createPanel,bindCreate({page,form,status,data,update,created}){
  const gate=page.querySelector('[data-mentor-gate]');
  form.onsubmit=e=>submit(e,status,async values=>{await update({...values,action:'create'});created();return 'Created '+values.name+'.';});
  function refresh(){
    const {verification,entitled,requested}=data.mentor;
    form.hidden=!entitled;
    gate.replaceChildren();
    if(entitled)return;
    const verified=verification==='approved';
    const pending=verified?requested:verification==='pending';
    const control=button(verified?(pending?'Unlock requested':'Unlock'):(pending?'Verification pending':'Verify'),async()=>{
      control.disabled=true;
      try{await update({action:verified?'unlock':'verify'});refresh();}
      catch(error){status.textContent=error.message;control.disabled=false;}
    });
    control.disabled=Boolean(pending);
    gate.append(control);
  }
  return refresh;
}});
