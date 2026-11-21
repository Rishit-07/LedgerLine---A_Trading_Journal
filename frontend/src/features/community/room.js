import { node, select, button, message, submit, formatDate } from '../../pages/workspace-ui.js';
import { paginate } from '../../pages/pagination.js';
import '../../pages/community.css';

function initial(name) {
  return node('span',name.trim().split(/\s+/).slice(0,2).map(word=>Array.from(word)[0]).join('').toUpperCase(),'community-initial n-in');
}
function tabs(root, labels, onChange) {
  const controls=labels.map(label=>button(label,()=>activate(label)));
  root.append(...controls);
  function activate(label) {
    controls.forEach((control,i)=>control.setAttribute('aria-pressed',String(labels[i]===label)));
    onChange(label);
  }
  return activate;
}
export const houseRules="<div class=\"ws-notice\"><strong>House rules</strong><p>Share how you plan, trade and review. Keep tips, trade calls and paid signals out of the discussion.</p></div>";
export function roomMarkup(label){
  return `<div class="community-tabs n-in" data-tabs></div><section data-directory>
      <div class="community-list-head"><label>Find a ${label}<input type="search" class="n-in" data-club-search placeholder="Name or location"></label>
      <label>Reach<select class="n-in" data-reach><option>All</option><option>Global</option><option>Local</option></select></label></div>
      <form class="ws-form" data-code-form><label>Join with code<input name="code" required></label><button class="n-btn n-out dash-button">Join</button></form><div class="community-grid" data-clubs></div></section>
      <section class="ws-columns" data-room hidden><div class="n-out ws-card"><label>Your ${label}<select data-room-select class="n-in"></select></label>
        <h2 data-room-title></h2><p data-room-about></p><div class="ws-stack" data-topics></div></div>
        <div class="n-out ws-card" data-compose><h2 data-compose-title></h2><form class="ws-form" data-topic-form>
        <label data-text-label>Message<textarea name="body" maxlength="600" rows="3" required></textarea></label><button class="n-btn n-acc dash-button">Publish</button></form><p data-compose-note></p></div></section>`;
}

export function bindRoom(page,{data,save},{label,plural,title,goals,hostLabel,views,bindCreate,memberControls}){
  const discover="Discover",mine="My "+plural;
  let records=data.groups,topics=data.topics??[],members=data.members??[],view=views[0],roomId;
  const find=q=>select(page,q),list=find('[data-clubs]'),status=find('[data-club-status]'),search=find('[data-club-search]'),reach=find('[data-reach]'),room=find('[data-room-select]');
  const form=find('[data-club-form]'),topicForm=find('[data-topic-form]');
  async function update(payload) {
    const next=await save(payload);Object.assign(data,next);records=next.groups;topics=next.topics??[];members=next.members??[];
  }
  function action(text,payload,success) {
    return button(text,async e=>{
      const control=e.currentTarget;control.disabled=true;
      try {await update(payload);render();status.textContent=success;}
      catch(error){status.textContent=error.message;control.disabled=false;}
    });
  }
  function directory() {
    const term=search.value.trim().toLowerCase();
    const rows=records.filter(g=>(view!==mine||g.joined) && (reach.value==='All'||(reach.value==='Local')===Boolean(g.location)) && (g.name+' '+g.location).toLowerCase().includes(term));
    list.replaceChildren(...rows.map(g=>{
      const article=node('article','','n-out ws-card community-person');
      const head=node('header');head.append(initial(g.name),node('h2',g.name));article.append(head,node('p',g.description),
        node('small',[g.location||'Global',g.members+' member'+(g.members===1?'':'s'),g.owner?'Host':g.joined?'Member':''].filter(Boolean).join(' · ')));
      const actions=node('div','','ws-actions');
      if(g.joined) actions.append(button('Open '+label,()=>{roomId=g.id;window.history.pushState(null,'','/'+plural+'/'+g.id);activate(goals);}));
      if(g.pending)actions.append(node('small','Request pending'));
      else if(!g.owner && (g.joined || (!g.readOnly && g.joinMode!=='invite')))actions.append(action(g.joined?'Leave '+label:g.joinMode==='request'?'Request to join':'Join '+label,{action:g.joined?'leave':'join',id:g.id},g.joined?'Membership ended.':g.joinMode==='request'?'Request sent.':'You joined '+g.name+'.'));
      article.append(actions);return article;
    }));
    if(!rows.length)list.append(message(term?'No matches. Try another name or location.':view===mine?'Join or create a '+label+' to see it here.':'No '+plural+' match this view.'));
    paginate(list,title,6,view+term+reach.value);
  }
  function paintRoom() {
    const mine=records.filter(g=>g.joined);
    const group=mine.find(g=>g.id===roomId)??mine[0];roomId=group?.id;
    room.replaceChildren(...mine.map(g=>new Option(g.name,g.id)));if(group)room.value=group.id;
    room.disabled=!group;
    find('[data-room-title]').textContent=group?.name??'Join a '+label+' first';
    find('[data-room-about]').textContent=group?.description??'Your shared discussions and goals appear here.';
    const feed=find('[data-topics]');
    const about=find('[data-room-about]');
    if(group?.code)about.append(node('small','Invite code: '+group.code));
    if(group?.readOnly)about.append(node('strong','Read-only · Mentor plan inactive'));
    if(group && memberControls)memberControls({group,about,action});
    find('[data-compose]').hidden=view==='Members';
    if(view==='Members'){
      const roster=members.filter(m=>m.groupId===roomId);
      feed.replaceChildren(...roster.map(member=>{
        const item=node('article','','community-member n-in');
        item.append(initial(member.name),node('strong',member.name),node('small',member.host?hostLabel:'Member'));
        if(member.adherence!=null)item.append(node('small',member.adherence+'% rules followed'));
        return item;
      }));
      for(const pending of data.requests.filter(r=>r.groupId===roomId))feed.append(node('p',pending.name+' · Request pending'),action('Approve',{action:'approve',id:roomId,member:pending.member},'Request approved.'),action('Decline',{action:'decline',id:roomId,member:pending.member},'Request declined.'));
      paginate(feed,'Members',6,roomId+view);return;
    }
    const isGoal=view===goals;
    const canPost=Boolean(group && !group.readOnly && (view==='Forum'||group.owner));
    topicForm.hidden=!canPost;find('[data-compose-title]').textContent=isGoal?'Set a process goal':view==='Announcements'?'Announcement':'Start a discussion';
    find('[data-compose-note]').textContent=!group?'Join from Discover to take part.':isGoal&&!group.owner?'The host sets goals. Members can check in on each one.':'';
    const items=topics.filter(t=>t.groupId===roomId && t.kind===(isGoal?'goal':view==='Announcements'?'announcement':'discussion'));
    feed.replaceChildren(...items.map(t=>{
      const card=node('article','','n-in community-topic');
      card.append(node('small',t.author+' · '+formatDate(t.createdAt)),node('p',t.body));
      if(isGoal && !group.readOnly) {
        const progress=node('progress');progress.max=group.members||1;progress.value=t.completions;progress.setAttribute('aria-label','Member check-ins');
        card.append(progress,node('small',t.completions+' of '+group.members+' checked in'),action(t.checked?'Undo check-in':'Mark complete',{action:t.checked?'uncheck':'check',id:roomId,topicId:t.id},'Check-in updated.'));
      } else if(t.kind==='discussion') {
        const thread=node('details');thread.append(node('summary','Replies ('+t.replies.length+')'));
        const replies=node('div');thread.append(replies);
        t.replies.forEach(r=>{const line=node('p');line.append(node('strong',r.author),' · '+r.body);replies.append(line);});
        paginate(replies,'Discussion replies',4);
        const reply=node('form','','ws-form');const field=node('textarea');field.name='body';field.required=true;field.maxLength=600;field.setAttribute('aria-label','Reply');const send=node('button','Reply','n-btn n-out dash-button');reply.append(field,send);
        reply.addEventListener('submit',e=>submit(e,status,async v=>{await update({action:'reply',id:t.groupId,topicId:t.id,body:v.body});render();return 'Reply added.';}));if(!group.readOnly)thread.append(reply);card.append(thread);
      }
      return card;
    }));
    if(group&&!items.length)feed.append(message(isGoal?'No goals set yet.':'No discussions yet.'));
    paginate(feed,view,4,roomId+view);
  }
  function render(){
    if(view==='Create')syncGate();
    const listing=view===discover||view===mine,creating=view==='Create';
    find('[data-directory]').hidden=!listing;find('[data-create]').hidden=!creating;find('[data-room]').hidden=listing||creating;
    if(listing)directory();else if(!creating)paintRoom();
  }
  const activate=tabs(find('[data-tabs]'),views,v=>{view=v;render();});
  find('[data-start]').onclick=()=>{activate('Create');form.elements.name.focus();};
  search.oninput=directory;reach.onchange=directory;room.onchange=()=>{roomId=room.value;paintRoom();};
  const syncGate=bindCreate({page,form,status,data,update,created:()=>{form.reset();activate(mine);}}) ?? (()=>{});
  topicForm.onsubmit=e=>submit(e,status,async v=>{await update({action:view===goals?'goal':view==='Announcements'?'announcement':'discussion',id:roomId,body:v.body});topicForm.reset();render();return 'Published.';});
  find('[data-code-form]').onsubmit=e=>submit(e,status,async v=>{await update({action:'join',code:v.code.trim()});activate(mine);return 'Membership updated.';});
  find('[data-close-create]').onclick=()=>activate(mine);
  function openPath(){
    const id=location.pathname.split('/')[2];
    const matched=records.find(g=>g.id===id);
    roomId=matched?.id;
    activate(matched?.joined?goals:views[0]);
    if(id&&!matched?.joined)status.textContent='Join this '+label+' to open it.';
  }
  window.addEventListener('popstate',openPath);
  openPath();
}
