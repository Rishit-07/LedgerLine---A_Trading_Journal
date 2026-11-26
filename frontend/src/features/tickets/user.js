import {node,button} from '../../pages/workspace-ui.js';
const path='/api/tickets';
const when=(value)=>new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});
const labels={open:'Open',in_progress:'In progress',resolved:'Resolved'};
export const ticketsPage={title:'My tickets',description:'Follow your support requests and reply to the team.',endpoint:path,
 content:'<section class="n-out ws-card ws-stack" data-tickets></section>',
 bind(page,{data,request}){
  const root=page.querySelector('[data-tickets]'),msg=node('p');msg.setAttribute('role','status');
  const contact=()=>{const p=node('p','For further queries write to ');const a=node('a',data.inbox);a.href='mailto:'+data.inbox;p.append(a,' and quote your ticket reference.');return p;};
  function list(items){
   root.replaceChildren(node('h2','Your support tickets'));
   const actions=node('div','','btn-row');
   const open=node('a','New ticket','btn btn-primary');open.href='/support#contact';actions.append(open);
   if(data.admin){const a=node('a','Admin ticket queue','btn btn-secondary');a.href='/ticket-admin';actions.append(a);}
   root.append(actions);
   if(!items.length)root.append(node('p','You have no tickets yet.'));
   for(const t of items)root.append(button(`${t.ref} · ${t.subject} · ${labels[t.status]} · ${when(t.updated_at)}`,()=>thread(t.id).catch(e=>{msg.textContent=e.message;})));
   root.append(contact(),msg);
  }
  async function thread(id){
   const {ticket:t,messages}=await request(path+'?id='+encodeURIComponent(id),'GET');
   root.replaceChildren(button('Back to tickets',async()=>{data=await request(path,'GET');list(data.items);}),node('h2',`${t.ref} · ${t.subject}`),node('p',`${t.topic} · ${t.priority} priority · ${labels[t.status]}`));
   for(const m of messages){const item=node('div','','n-in ws-stat');item.append(node('strong',m.author==='admin'?'Ledgerline Support':'You'),node('small',when(m.created_at)),node('p',m.body));root.append(item);}
   const form=node('form','','btn-row'),box=node('textarea','','n-in');box.maxLength=1200;box.required=true;box.placeholder=t.status==='resolved'?'Still need help? Reply to reopen this ticket':'Write a reply';box.setAttribute('aria-label','Reply');
   const send=node('button','Send reply','btn btn-primary');send.type='submit';form.append(box,send);
   form.addEventListener('submit',async e=>{e.preventDefault();if(!box.value.trim())return;send.disabled=true;try{await request(path,'POST',{id,body:box.value});await thread(id);}catch(err){msg.textContent=err.message;send.disabled=false;}});
   root.append(form,contact(),msg);
  }
  list(data.items);
 }};
