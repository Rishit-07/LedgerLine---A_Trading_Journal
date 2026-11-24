import {node,button} from '../../pages/workspace-ui.js';
const path='/api/ticket-admin';
const when=(value)=>new Date(value).toLocaleString('en-IN',{dateStyle:'medium',timeStyle:'short'});
const labels={open:'Open',in_progress:'In progress',resolved:'Resolved'};
export const ticketAdminPage={title:'Ticket queue',description:'Answer and resolve support tickets.',endpoint:path,
 content:'<section class="n-out ws-card ws-stack" data-ticket-admin></section>',
 bind(page,{data,request}){
  const root=page.querySelector('[data-ticket-admin]'),msg=node('p');msg.setAttribute('role','status');
  let filter='';
  async function queue(){
   data=await request(path+(filter?'?status='+filter:''),'GET');
   root.replaceChildren(node('h2','Support tickets'));
   const bar=node('div','','btn-row');
   for(const [value,label] of [['','All'],['open','Open'],['in_progress','In progress'],['resolved','Resolved']]){
    const b=button(label+(value?` (${data.counts[value]??0})`:''),()=>{filter=value;queue().catch(e=>{msg.textContent=e.message;});});
    if(filter===value)b.setAttribute('aria-pressed','true');bar.append(b);
   }
   root.append(bar);
   if(!data.items.length)root.append(node('p','No tickets here.'));
   for(const t of data.items)root.append(button(`${t.ref} · ${t.priority} · ${labels[t.status]} · ${t.topic} · ${t.subject} · ${t.email}${t.member?'':' (visitor)'}`,()=>open(t.id).catch(e=>{msg.textContent=e.message;})));
   root.append(msg);
  }
  async function open(id){
   const {ticket:t,messages}=await request(path+'?id='+encodeURIComponent(id),'GET');
   root.replaceChildren(button('Back to queue',()=>queue().catch(e=>{msg.textContent=e.message;})),node('h2',`${t.ref} · ${t.subject}`),
    node('p',`${t.email}${t.member?'':' (visitor, no account)'} · ${t.topic} · ${t.priority} priority · ${labels[t.status]} · opened ${when(t.created_at)}`));
   for(const m of messages){const item=node('div','','n-in ws-stat');item.append(node('strong',m.author==='admin'?'Support':'Customer'),node('small',when(m.created_at)),node('p',m.body));root.append(item);}
   const details=node('details'),entries=Object.entries(t.diagnostics??{});details.append(node('summary','System details ('+entries.length+')'));
   if(!entries.length)details.append(node('p','The customer did not share technical details.'));
   for(const [k,v] of entries)details.append(node('p',k+': '+(Array.isArray(v)?(v.join(' | ')||'none'):v)));
   root.append(details);
   const box=node('textarea','','n-in');box.maxLength=2000;box.placeholder='Reply to the customer (they receive it by email and under My tickets)';box.setAttribute('aria-label','Reply');
   const actions=node('div','','btn-row');root.append(box,actions,msg);
   const act=async(body)=>{try{const r=await request(path,'POST',{id,...body});msg.textContent=r.emailed===false?'Saved. The email could not be sent; contact them directly.':'Saved.';await open(id);}catch(e){msg.textContent=e.message;}};
   const reply=node('button','Send reply','btn btn-primary');reply.type='button';
   reply.addEventListener('click',()=>{if(!box.value.trim()){msg.textContent='Write a reply first.';return;}act({action:'reply',body:box.value});});
   const solve=node('button','Reply and resolve','btn btn-secondary');solve.type='button';
   solve.addEventListener('click',()=>{if(!box.value.trim()){msg.textContent='Write a reply first.';return;}if(confirm('Send this reply and resolve '+t.ref+'?'))act({action:'reply',body:box.value,status:'resolved'});});
   actions.append(reply,solve);
   if(t.status==='resolved')actions.append(button('Reopen',()=>act({action:'status',status:'open'})));
   else{actions.append(button('Mark resolved',()=>{if(confirm('Resolve '+t.ref+' without a reply?'))act({action:'status',status:'resolved'});}));if(t.status==='open')actions.append(button('Mark in progress',()=>act({action:'status',status:'in_progress'})));}
  }
  queue().catch(e=>{msg.textContent=e.message;root.append(msg);});
 }};
