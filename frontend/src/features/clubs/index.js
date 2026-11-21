import { groupRoom } from '../community/room.js';
import { submit } from '../../pages/workspace-ui.js';

const createPanel = `<section class="n-out ws-card community-create" data-create hidden><h2>Create a club</h2>
  <form class="ws-form" data-club-form><label>Club name<input name="name" required maxlength="60"></label>
  <label>About<textarea name="description" required maxlength="400" rows="3"></textarea></label>
  <label>City or region (optional)<input name="location" maxlength="60"></label><label>How people join<select name="joinMode"><option value="open">Open</option><option value="request">Request</option><option value="invite">Invite only</option></select></label><label>Visibility<select name="visibility"><option value="public">Public listed</option><option value="private">Private unlisted</option></select></label>
  <button class="n-btn n-acc dash-button">Create club</button></form><button type="button" class="n-btn n-out dash-button" data-close-create>Back</button></section>`;
export const clubs=groupRoom({isSpace:false,endpoint:'/api/clubs',createPanel,bindCreate({page,form,status,data,update,created}){
  form.onsubmit=e=>submit(e,status,async values=>{await update({...values,action:'create'});created();return 'Created '+values.name+'.';});
}});
