import { groupRoom } from '../community/room.js';
import { submit } from '../../pages/workspace-ui.js';

const createPanel = `<section class="n-out ws-card community-create" data-create hidden><h2>Create a space</h2><div data-mentor-steps>Verify → Unlock plan → Create</div><div data-mentor-gate></div>
  <form class="ws-form" data-club-form><label>Space name<input name="name" required maxlength="60"></label>
  <label>About<textarea name="description" required maxlength="400" rows="3"></textarea></label>
  <label>City or region (optional)<input name="location" maxlength="60"></label>
  <button class="n-btn n-acc dash-button">Create space</button></form><button type="button" class="n-btn n-out dash-button" data-close-create>Back</button></section>`;
export const spaces=groupRoom({isSpace:true,createPanel,bindCreate({page,form,status,data,update,created}){
  form.onsubmit=e=>submit(e,status,async values=>{await update({...values,action:'create'});created();return 'Created '+values.name+'.';});
}});
