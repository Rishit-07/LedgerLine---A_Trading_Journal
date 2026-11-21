import { node, select, button, message, submit, formatDate } from '../../pages/workspace-ui.js';
import { paginate } from '../../pages/pagination.js';
import '../../pages/community.css';

function initial(name) {
  return node('span',name.trim().split(/\s+/).slice(0,2).map(word=>Array.from(word)[0]).join('').toUpperCase(),'community-initial n-in');
}
function anchor(label,href) {
  const a=node('a',label,'n-btn n-out dash-button');a.href=href;return a;
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
const houseRules="<div class=\"ws-notice\"><strong>House rules</strong><p>Share how you plan, trade and review. Keep tips, trade calls and paid signals out of the discussion.</p></div>";
export function groupRoom({isSpace,endpoint,createPanel,bindCreate}) {
  const label=isSpace?'space':'club',plural=isSpace?'spaces':'clubs',title=isSpace?'Mentor spaces':'Clubs';
  const goals=isSpace?'Goals':'Challenges';
  const discover='Discover',mine='My '+plural;
  return {title,endpoint,description:isSpace?'Lead a space or join one.':'Join a club and work on your trading process together.',
    content:houseRules+`<section class="n-out ws-card community-hero"><div><small>${isSpace?'Mentorship':'Communities'}</small>
      <h2>${isSpace?'Work on your process together.':'Find your people. Compete on process.'}</h2><p>${isSpace?'Set a goal, check in and discuss what you learned.':'Find a group near you or join one online.'}</p></div>
      <button type="button" class="n-btn n-acc dash-button" data-start>Create a ${label}</button></section>
      <div class="community-tabs n-in" data-tabs></div><section data-directory>
      <div class="community-list-head"><label>Find a ${label}<input type="search" class="n-in" data-club-search placeholder="Name or location"></label>
      <label>Reach<select class="n-in" data-reach><option>All</option><option>Global</option><option>Local</option></select></label></div>
      <div class="community-grid" data-clubs></div></section>
      <section class="ws-columns" data-room hidden><div class="n-out ws-card"><label>Your ${label}<select data-room-select class="n-in"></select></label>
        <h2 data-room-title></h2><p data-room-about></p><div class="ws-stack" data-topics></div></div>
        <div class="n-out ws-card" data-compose><h2 data-compose-title></h2><form class="ws-form" data-topic-form>
        <label data-text-label>Message<textarea name="body" maxlength="600" rows="3" required></textarea></label><button class="n-btn n-acc dash-button">Publish</button></form><p data-compose-note></p></div></section>
      ${createPanel}
      <p role="status" data-club-status></p>`,
    bind(page,{data,save}) {
      let records=data.clubs,topics=data.topics??[],members=data.members??[],view=discover,roomId;
      const find=q=>select(page,q),list=find('[data-clubs]'),status=find('[data-club-status]'),search=find('[data-club-search]'),reach=find('[data-reach]'),room=find('[data-room-select]');
      const form=find('[data-club-form]'),topicForm=find('[data-topic-form]');
      async function update(payload) {
        const next=await save(payload);records=next.clubs;topics=next.topics??[];members=next.members??[];
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
          if(g.joined) actions.append(button('Open '+label,()=>{roomId=g.id;activate(goals);}));
          if(!g.owner)actions.append(action(g.joined?'Leave '+label:'Join '+label,{action:g.joined?'leave':'join',id:g.id},g.joined?'Membership ended.':'You joined '+g.name+'.'));
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
        find('[data-compose]').hidden=view==='Members';
        if(view==='Members'){
          const roster=members.filter(m=>m.groupId===roomId);
          feed.replaceChildren(...roster.map(member=>{
            const item=node('article','','community-member n-in');
            item.append(initial(member.name),node('strong',member.name),node('small',member.host?(isSpace?'Mentor':'Host'):'Member'));
            return item;
          }));
          paginate(feed,'Members',6,roomId+view);return;
        }
        const isGoal=view===goals;
        const canPost=Boolean(group && (!isGoal||group.owner));
        topicForm.hidden=!canPost;find('[data-compose-title]').textContent=isGoal?'Set a process goal':'Start a discussion';
        find('[data-compose-note]').textContent=!group?'Join from Discover to take part.':isGoal&&!group.owner?'The host sets goals. Members can check in on each one.':'';
        const items=topics.filter(t=>t.groupId===roomId && t.kind===(isGoal?'goal':'discussion'));
        feed.replaceChildren(...items.map(t=>{
          const card=node('article','','n-in community-topic');
          card.append(node('small',t.author+' · '+formatDate(t.createdAt)),node('p',t.body));
          if(isGoal) {
            const progress=node('progress');progress.max=group.members||1;progress.value=t.completions;progress.setAttribute('aria-label','Member check-ins');
            card.append(progress,node('small',t.completions+' of '+group.members+' checked in'),action(t.checked?'Undo check-in':'Mark complete',{action:t.checked?'uncheck':'check',id:roomId,topicId:t.id},'Check-in updated.'));
          } else {
            const thread=node('details');thread.append(node('summary','Replies ('+t.replies.length+')'));
            const replies=node('div');thread.append(replies);
            t.replies.forEach(r=>{const line=node('p');line.append(node('strong',r.author),' · '+r.body);replies.append(line);});
            paginate(replies,'Discussion replies',4);
            const reply=node('form','','ws-form');const field=node('textarea');field.name='body';field.required=true;field.maxLength=600;field.setAttribute('aria-label','Reply');const send=node('button','Reply','n-btn n-out dash-button');reply.append(field,send);
            reply.addEventListener('submit',e=>submit(e,status,async v=>{await update({action:'reply',id:t.groupId,topicId:t.id,body:v.body});render();return 'Reply added.';}));thread.append(reply);card.append(thread);
          }
          return card;
        }));
        if(group&&!items.length)feed.append(message(isGoal?'No goals set yet.':'No discussions yet.'));
        paginate(feed,view,4,roomId+view);
      }
      function render(){
        const listing=view===discover||view===mine,creating=view==='Create';
        find('[data-directory]').hidden=!listing;find('[data-create]').hidden=!creating;find('[data-room]').hidden=listing||creating;
        if(listing)directory();else if(!creating)paintRoom();
      }
      const activate=tabs(find('[data-tabs]'),[discover,mine,goals,'Members','Forum','Create'],v=>{view=v;render();});
      find('[data-start]').onclick=()=>{activate('Create');form.elements.name.focus();};
      search.oninput=directory;reach.onchange=directory;room.onchange=()=>{roomId=room.value;paintRoom();};
      bindCreate({page,form,status,data,update,created:()=>{form.reset();activate(mine);}});
      topicForm.onsubmit=e=>submit(e,status,async v=>{await update({action:view===goals?'goal':'discussion',id:roomId,body:v.body});topicForm.reset();render();return 'Published.';});
      activate(discover);
    }
  };
}
