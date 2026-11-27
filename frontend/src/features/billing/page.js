import {showConfirmation} from '../../components/confirmation-motion.js';
import {node,button,formatDate} from '../../pages/workspace-ui.js';
import {playBillingIntro,processingCard} from '../../components/billing-ready.js';
import {planReadyScreen} from './plan-ready.js';
import './page.css';

const labels={free:'Free',pro:'Pro',mentor:'Mentor'};
const limitRows=(l)=>{const cell=(k,unit)=>[String(l[k].free)+unit,String(l[k].pro)+unit,String(l[k].mentor)+unit];
 return [['Trade journal and process score',1,1,1],['Join clubs and spaces',1,1,1],['Trade replay chart (a month)',...cell('replay','')],['Mistake lab tags (a month)',...cell('mistake','')],
  ['Ask your journal questions (a month)',...cell('coach','')],['AI tokens',l.ai_tokens.free.day.toLocaleString('en-US')+' a day',l.ai_tokens.pro.month.toLocaleString('en-US')+' a month',l.ai_tokens.mentor.month.toLocaleString('en-US')+' a month'],['AI tokens per hour (cooldown)','—',l.ai_tokens.pro.hour.toLocaleString('en-US'),l.ai_tokens.mentor.hour.toLocaleString('en-US')],['AI trade review (a month)',...cell('replay_review','')],['AI habit insight (a month)',...cell('mistake_insight','')],
  ['AI reports and monthly reviews',0,1,1],['MetaTrader report import',l.mt_import.free+' trades a month','Unlimited','Unlimited'],['MetaTrader live sync',0,1,1],
  ['Create private mentor spaces',0,0,1],['Announcements and cohort view',0,0,1]];};
const money=v=>'$'+(Number.isInteger(Number(v))?Number(v):Number(v).toFixed(2));
const cents=(v,cur)=>(cur==='USD'?'$':'₹')+(v/100).toFixed(2);
const section=(key,title)=>'<section class="ws-card n-out bill-section"><h2>'+title+'</h2><div data-bill="'+key+'"></div></section>';
export const billing={
 title:'Billing',description:'Your plan, how you pay, and your invoices.',endpoint:'/api/billing/overview',
 content:'<div class="bill-board n-out"><div data-bill="notice" role="status"></div><header class="bill-head"><h2>Plans and billing</h2><div class="bill-period n-in" data-bill="period"></div></header><p class="bill-sample">Prices in US dollars. You pay in crypto.</p><div class="bill-plans" data-bill="plans"></div>'+section('compare','What each plan includes')+'<div class="bill-columns"><aside>'+section('usage','Usage this month')+section('profile','Billing details')+'</aside></div>'+section('invoices','Invoices')+'<p class="n-in bill-free"><strong>Never behind a paywall</strong> · Loss limits, cooldowns, pre-trade checklist, export and delete account.</p><footer class="bill-footer"><div data-bill="actions"></div><small>Prepaid. Nothing renews by itself. We remind you 7 days and 1 day before it ends.</small></footer><dialog class="bill-payment n-out" aria-labelledby="bill-payment-title"><header><h2 id="bill-payment-title">Pay with crypto</h2><button class="btn btn-secondary" type="button" data-close-payment>Close</button></header><p data-bill="payment-plan"></p><div data-bill="crypto"></div><div data-bill="payment-status"><span data-bill="payment-message" role="status"></span></div><div data-bill="confirm-payment"></div></dialog></div>',
 async bind(page,{data,request,uid}){
  const el=k=>page.querySelector('[data-bill="'+k+'"]');
  const params=new URLSearchParams(location.search);
  const origin=params.get('from'),destination=origin==='reports'?'/reports':origin==='spaces'?'/spaces':'/billing';
  const orderKey='ledgerline.billing.'+uid;
  let plan=params.get('plan')==='mentor'?'mentor':'pro',term='monthly',months=1,busy=false,activeOrder=null,pollTimer;
  if(!sessionStorage.getItem(orderKey)){const board=el('period').closest('.bill-board');board.hidden=true;await playBillingIntro();board.hidden=false;}
  const toolbar=page.querySelector('.dash-actions');if(toolbar){const notifications=node('a','Notifications','btn btn-secondary');notifications.href='/settings#notifications';toolbar.insertBefore(notifications,toolbar.lastElementChild);}
  const payment=page.querySelector('.bill-payment');
  const paymentStatus=el('payment-status');
  const note=text=>{(payment.open?el('payment-message'):el('notice')).textContent=text;};
  function openPayment(){el('notice').textContent='';payment.showModal();}
  payment.querySelector('[data-close-payment]').onclick=()=>payment.close();
  payment.addEventListener('close',()=>{el('actions').querySelector('.bill-start')?.focus({preventScroll:true});});
  function choices(container,options,value,change){
   container.replaceChildren(...options.map(([key,label])=>{const b=button(label,()=>{const restore=document.activeElement===b;change(key);if(restore)Array.from(container.querySelectorAll('button')).find(next=>next.textContent===label)?.focus({preventScroll:true});});b.setAttribute('aria-pressed',String(key===value));return b;}));
  }
  const price=(key,n)=>{const p=data.plans[key];if(n===12)return {total:p.yearly,intro:false};if(n===1&&data.introLeft?.[key]>0)return {total:p.intro,intro:true};return {total:p.monthly*n,intro:false};};
  function termChange(key){term=key;months=key==='monthly'?1:12;paint();}
  function paint(){
   choices(el('period'),[['monthly','Monthly'],['yearly','Yearly · 2 months free']],term,termChange);
   const cards=Object.entries(labels).map(([key,label])=>{
    const card=node('article','','ws-card n-out bill-plan');card.dataset.selected=String(key===plan);
    const head=node('header');head.append(node('h2',label));if(key!=='free')head.append(node('small',key==='pro'?'Most chosen':'Verified mentors only'));
    const intro=key!=='free'&&term==='monthly'&&data.introLeft?.[key]>0;
    card.append(head,node('strong',money(intro?data.plans[key].intro:data.plans[key][term]),'bill-price'),node('small',(intro?'Intro price for '+data.introLeft[key]+' month'+(data.introLeft[key]===1?'':'s')+', then '+money(data.plans[key].monthly)+' · ':'')+'per '+(term==='monthly'?'month':'year')));
    const blurb={free:'Everything needed to journal and size trades safely.',pro:'Mistake lab, AI reports and deeper journal insights.',mentor:'Pro plus spaces for your students.'};head.after(node('p',blurb[key]));
    const choose=button(key===data.current?'Current plan':key==='mentor'&&!data.verified?'Verify first':key===plan?'Selected':'Choose '+label,()=>{
     if(key==='mentor'&&!data.verified){location.assign('/mentor-verification');return;}plan=key;paint();
    });choose.disabled=key===data.current||busy;choose.setAttribute('aria-pressed',String(plan===key));card.append(choose);return card;
   });el('plans').replaceChildren(...cards);
   const crypto=el('crypto');crypto.replaceChildren();
   if(plan!=='free'){
    const box=node('section','','ws-card n-out bill-section');crypto.append(box);
    box.append(node('p','Prepaid access paid in crypto. Nothing renews by itself, and periods add to what you already have. You choose the coin on the secure CoinPayments page; the price is locked for 15 minutes.'),node('h3','Period'));
    const group=node('div','','bill-options');box.append(group);
    choices(group,[1,3,12].map(n=>{const p=price(plan,n);return [n,n+' month'+(n===1?'':'s')+' · '+money(p.total)+(p.intro?' intro':'')];}),months,n=>{months=n;term=n===12?'yearly':'monthly';paint();});
   }
   el('payment-plan').textContent=plan==='free'?'':labels[plan]+' · '+months+' month'+(months===1?'':'s')+' · '+money(price(plan,months).total);
   const confirm=button('Continue to secure payment',checkout);
   confirm.classList.replace('btn-secondary','btn-primary');confirm.disabled=busy||plan==='free'||!data.ready;
   el('confirm-payment').replaceChildren(confirm);
   if(!data.ready)note('Checkout opens soon. Payments are not switched on yet.');
   const actions=el('actions');
   const start=button(busy?'View payment':labels[plan]===labels[data.current]?'Extend '+labels[plan]:'Start '+labels[plan],openPayment);
   start.classList.replace('btn-secondary','btn-primary');start.classList.add('bill-start');start.disabled=plan==='free'&&!busy;
   start.setAttribute('aria-haspopup','dialog');
   actions.replaceChildren(start);
   if(busy)for(const b of el('crypto').querySelectorAll('button'))b.disabled=true;
  }
  async function checkout(){
   if(busy)return;busy=true;paint();note('Preparing checkout…');
   try{
    const order=await request('/api/billing/checkout','POST',{plan,months});activeOrder=order.id;
    sessionStorage.setItem(orderKey,JSON.stringify({id:order.id,destination}));note('');
    paymentStatus.querySelector('a')?.remove();
    const link=node('a','Open secure payment','btn btn-primary');link.href=order.url;link.target='_blank';link.rel='noopener noreferrer';paymentStatus.append(link);
    window.open(order.url,'_blank','noopener,noreferrer');
    note('Waiting for payment. Your plan unlocks here as soon as the network confirms it.');
    poll();
   }catch(e){busy=false;paint();note(e.message);}
  }
  function reset(){clearTimeout(pollTimer);activeOrder=null;paymentStatus.querySelector('a')?.remove();el('payment-message').textContent='';sessionStorage.removeItem(orderKey);busy=false;paint();}
  async function poll(){
   const id=activeOrder;if(!id||!page.isConnected)return;
   try{
    const state=await request('/api/billing/status?id='+encodeURIComponent(id),'GET');if(id!==activeOrder)return;
    if(state.confirmed){const saved=JSON.parse(sessionStorage.getItem(orderKey)||'{}');reset();payment.close();showConfirmation('payment','Your '+labels[state.plan]+' access is active.',()=>planReadyScreen(state.plan,data.plans[state.plan].features,()=>location.assign(saved.destination==='/reports'?'/reports?welcome=pro':saved.destination==='/spaces'?'/spaces':'/billing')));return;}
    if(!paymentStatus.querySelector('a')&&state.hosted_url){const link=node('a','Resume secure payment','btn btn-secondary');link.href=state.hosted_url;link.target='_blank';link.rel='noopener noreferrer';paymentStatus.append(link);}
    if(['expired','failed','cancelled'].includes(state.payment_state)){reset();note('That payment '+state.payment_state+'. If you already sent funds, they are checked automatically. Otherwise start again.');return;}
    if(state.payment_state==='underpaid')note('The amount sent was short. Our team reviews it, and nothing is lost.');
    else if(state.payment_state==='needs_review')note('We are checking this payment by hand. You will be told when it is done.');
    else if(state.payment_state==='confirming')note('Payment seen. Confirming on the network…');
   }catch(e){note(e.message);}
   pollTimer=setTimeout(poll,3500);
  }
  const table=node('table');table.innerHTML='<thead><tr><th>Feature</th><th>Free</th><th>Pro</th><th>Mentor</th></tr></thead>';
  const rows=limitRows(data.limits);
  for(const row of rows){const tr=table.insertRow();row.forEach((value,i)=>tr.insertCell().textContent=i?(typeof value==='string'?value:value?'✓':'—'):value);}
  el('compare').append(table);
  Object.values(labels).forEach((label,i)=>{const details=node('details','','bill-mobile');details.append(node('summary',label));for(const row of rows)details.append(node('p',(typeof row[i+1]==='string'?row[i+1]+' · ':row[i+1]?'✓ ':'— ')+row[0]));el('compare').append(details);});
  for(const tool of data.tools){const row=node('div','','bill-usage-row'),meter=node('meter');meter.min=0;meter.max=tool.limit??Math.max(1,tool.used);meter.value=tool.used;row.append(node('span',tool.name),node('strong',tool.limit===null?tool.used+' used, no limit':tool.used+' of '+tool.limit),meter);el('usage').append(row);}
  el('usage').append(node('p','Counted per calendar month (UTC). Limits reset on the 1st.','bill-usage-note'));
  const form=node('form','','ws-form');for(const [name,label] of [['billing_name','Name on invoice'],['gstin','GSTIN (optional)'],['address','Billing address']]){const field=node('label',label),input=node('input');input.name=name;input.value=data.profile[name]??'';input.required=name==='billing_name';field.append(input);form.append(field);}
  const save=node('button','Save details','btn btn-secondary');form.append(node('p','Invoices are sent to '+data.profile.email),save);el('profile').append(form);
  form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{await request('/api/billing/profile','PUT',Object.fromEntries(new FormData(form)));note('Invoice details saved.');}catch(err){note(err.message);}finally{save.disabled=false;}};
  for(const row of data.invoices){const entry=node('div','','bill-invoice');entry.append(node('strong','LL-'+String(row.id).padStart(6,'0')),node('span',formatDate(row.created_at)),node('span',row.method+' · '+cents(row.amount_paise,row.currency)),button('PDF',async()=>{try{const {pdf}=await request('/api/billing/invoice?id='+row.id,'GET');const a=node('a');a.download='Ledgerline-'+row.id+'.pdf';a.href='data:application/pdf;base64,'+pdf;a.click();}catch(e){note(e.message);}}));el('invoices').append(entry);}
  if(!data.invoices.length)el('invoices').append(node('p','Your first invoice appears here after payment.'));
  const ended=data.orders.find(o=>Date.parse(o.paid_until)<Date.now());if(ended)note('Your '+labels[ended.plan]+' period ended. Extend within 3 days to keep access.');
  paint();const saved=JSON.parse(sessionStorage.getItem(orderKey)||'null');if(saved){busy=true;activeOrder=saved.id;paint();openPayment();note('Checking payment status…');poll();}
  window.addEventListener('pagehide',()=>{clearTimeout(pollTimer);},{once:true});
 }
};