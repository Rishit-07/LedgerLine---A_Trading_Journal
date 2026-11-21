import { houseRules, roomMarkup, bindRoom } from '../community/room.js';
import { submit } from '../../pages/workspace-ui.js';

const createPanel = `<section class="n-out ws-card community-create" data-create hidden><header class="ws-section-head"><h2>Create a club</h2><button type="button" class="n-btn n-out dash-button" data-close-create>Back</button></header>
  <form class="ws-form" data-club-form><label>Club name<input name="name" required maxlength="60"></label>
  <label>About<textarea name="description" required maxlength="400" rows="3"></textarea></label>
  <label>City or region (optional)<input name="location" maxlength="60"></label><label>How people join<select name="joinMode"><option value="open">Open</option><option value="request">Request</option><option value="invite">Invite only</option></select></label><label>Visibility<select name="visibility"><option value="public">Public listed</option><option value="private">Private unlisted</option></select></label>
  <button class="n-btn n-acc dash-button">Create club</button></form></section>`;
export const clubs={
  title:'Clubs',
  description:'Join a club and work on your trading process together.',
  endpoint:'/api/clubs',
  content:houseRules+`<section class="n-out ws-card community-hero"><div><small>Communities</small>
      <h2>Find your people. Compete on process.</h2><p>Find a group near you or join one online.</p></div>
      <button type="button" class="n-btn n-acc dash-button" data-start>Create a club</button></section>`+roomMarkup('club')+createPanel+'<p role="status" data-club-status></p>',
  bind(page,context){
    bindRoom(page,context,{
      label:'club',plural:'clubs',title:'Clubs',hostLabel:'Host',goals:'Challenges',
      views:["Discover","My clubs","Challenges","Members","Forum","Create"],
      bindCreate({page,form,status,data,update,created}){
  form.onsubmit=e=>submit(e,status,async values=>{await update({...values,action:'create'});created();return 'Created '+values.name+'.';});
}
    });
  }
};
