import { node, select, button, message, submit, formatDate } from './workspace-ui.js';
import { paginate } from './pagination.js';
import './community.css';

function heading(active) {
  const links=[['people','People'],['spaces','Spaces'],['clubs','Clubs']];
  return `<div class="ws-notice"><strong>House rules</strong><p>Share how you plan, trade and review. Keep tips, trade calls and paid signals out of the discussion.</p></div>
    <nav class="community-nav n-out" aria-label="Community pages">${links.map(([key,text])=>`<a href="/${key}" ${active===key?'aria-current="page"':''}>${text}</a>`).join('')}</nav>`;
}
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
export const people={
  title:'Community',description:'Find traders and connect over the way you trade.',
  content:heading('people')+`<div class="community-tabs n-in" data-tabs></div><section class="community-body">
    <div class="community-list-head"><label>Search traders<input type="search" class="n-in" data-search placeholder="Name or headline"></label><a class="n-btn n-out dash-button" href="/portfolio">Edit my portfolio</a></div>
    <div class="community-grid" data-people></div><p role="status" data-feedback></p></section>`,
  async bind(page,{data,request,reload}) {
    const list=select(page,'[data-people]'),search=select(page,'[data-search]'),status=select(page,'[data-feedback]');
    let friends=[],view='Discover',friendsLoaded=false;
    async function refresh() {
      try { friends=(await request('/api/streak/friends','GET')).friends;friendsLoaded=true; }
      catch { friendsLoaded=false;status.textContent='Connections could not load.'; }
    }
    async function mutate(control,action,payload) {
      control.disabled=true;
      try {
        await request('/api/streak/friends/'+action,'POST',payload);
        status.textContent=action==='invite'?'Invitation sent.':action==='accept'?'Connection accepted.':'Connection updated.';
        const updated=await reload();data.profiles=updated.profiles;await refresh();render();
      } catch(error) {status.textContent=error.message;control.disabled=false;}
    }
    function render() {
      const term=search.value.trim().toLowerCase(),discover=view==='Discover';
      const rows=(discover?data.profiles:friends).filter(row=>(row.name+' '+(row.headline||'')).toLowerCase().includes(term));
      list.replaceChildren(...rows.map(row=>{
        const card=node('article','','n-out ws-card community-person');
        const header=node('header');header.append(initial(row.name),node('h2',row.name));card.append(header);
        const actions=node('div','','ws-actions');
        if(discover) {
          if(row.headline)card.append(node('p',row.headline));
          if(row.streak!=null)card.append(node('small',row.streak+' day journal streak'));
          actions.append(anchor('Portfolio','/p/'+encodeURIComponent(row.slug)));
          if(!row.connection)actions.append(button('Connect',e=>mutate(e.currentTarget,'invite',{code:row.code})));
          else actions.append(node('small',row.connection==='active'?'Connected':'Invitation pending'));
        } else {
          card.append(node('p',row.status==='active'?row.current+' day journal streak':row.outgoing?'Invitation sent':'Wants to connect'));
          if(row.status==='pending'&&!row.outgoing)actions.append(button('Accept',e=>mutate(e.currentTarget,'accept',{id:row.id})));
          actions.append(button(row.status==='active'?'End connection':row.outgoing?'Cancel invitation':'Decline',e=>mutate(e.currentTarget,'end',{id:row.id})));
        }
        card.append(actions);return card;
      }));
      if(!rows.length)list.append(message(term?'No traders match this search.':discover?'Public portfolios will appear here when traders publish them.':friendsLoaded?'Your invitations and connections will appear here.':'Connections are unavailable.'));
      paginate(list,'People',6,view+term);
    }
    const activate=tabs(select(page,'[data-tabs]'),['Discover','Connections'],value=>{view=value;render();});
    search.addEventListener('input',render);activate('Discover');await refresh();render();
  }
};

