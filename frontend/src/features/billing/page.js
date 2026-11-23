import QRCode from 'qrcode';
import {openCardCheckout} from './card-checkout.js';
import {showConfirmation} from '../../components/confirmation-motion.js';
import {node,button,formatDate} from '../../pages/workspace-ui.js';
import {playBillingIntro,processingCard} from '../../components/billing-ready.js';
import {planReadyScreen} from './plan-ready.js';
import './page.css';

const labels={free:'Free',pro:'Pro',mentor:'Mentor'};
const methods={'UPI':'UPI AutoPay','Card':'Card','Net banking':'Net banking','Crypto':'Crypto (USDC or USDT)'};
const rows=[['Trade journal and process score',1,1,1],['Join clubs and spaces',1,1,1],['AI reports and mistake lab',0,1,1],['Create private mentor spaces',0,0,1],['Announcements and cohort view',0,0,1]];
const money=v=>'₹'+Number(v).toLocaleString('en-IN');
const section=(key,title)=>'<section class="ws-card n-out bill-section"><h2>'+title+'</h2><div data-bill="'+key+'"></div></section>';
export const billing={
 title:'Billing',description:'Your plan, how you pay, and your invoices.',endpoint:'/api/billing/overview',
 content:'<div class="bill-board n-out"><div data-bill="notice" role="status"></div><header class="bill-head"><h2>Plans and billing</h2><div class="bill-period n-in" data-bill="period"></div></header><p class="bill-sample">Sample prices in rupees.</p><div class="bill-plans" data-bill="plans"></div>'+section('compare','What each plan includes')+'<div class="bill-columns"><aside>'+section('usage','Usage this month')+section('profile','Billing details')+'</aside></div>'+section('invoices','Invoices')+'<p class="n-in bill-free"><strong>Never behind a paywall</strong> · Loss limits, cooldowns, pre-trade checklist, export and delete account.</p><footer class="bill-footer"><div data-bill="actions"></div><small>Renewal reminders by email. Cancel in two taps.</small></footer><dialog class="bill-payment n-out" aria-labelledby="bill-payment-title"><header><h2 id="bill-payment-title">How you pay</h2><button class="btn btn-secondary" type="button" data-close-payment>Close</button></header><p data-bill="payment-plan"></p><div data-bill="methods"></div><div data-bill="crypto"></div><div data-bill="payment-status"><span data-bill="payment-message" role="status"></span></div><div data-bill="confirm-payment"></div></dialog></div>',
 async bind(page,{data,request,uid}){
  const el=k=>page.querySelector('[data-bill="'+k+'"]');
  const params=new URLSearchParams(location.search);
  const origin=params.get('from'),destination=origin==='reports'?'/reports':origin==='spaces'?'/spaces':'/billing';
  const orderKey='ledgerline.billing.'+uid;
  let plan=params.get('plan')==='mentor'?'mentor':'pro',term='monthly',method='UPI',coin='USDC',network='Polygon',months=1,busy=false,activeOrder=null,quoteTimer,pollTimer,cardOpen=false;
  if(!sessionStorage.getItem(orderKey)){const board=el('period').closest('.bill-board');board.hidden=true;await playBillingIntro();board.hidden=false;}
  const toolbar=page.querySelector('.dash-actions');if(toolbar){const notifications=node('a','Notifications','btn btn-secondary');notifications.href='/settings#notifications';toolbar.insertBefore(notifications,toolbar.lastElementChild);}
  const payment=page.querySelector('.bill-payment');
  const paymentStatus=el('payment-status');
  const note=text=>{(payment.open?el('payment-message'):el('notice')).textContent=text;};
  function openPayment(){
   el('notice').textContent='';
   payment.showModal();
  }
  payment.querySelector('[data-close-payment]').onclick=()=>payment.close();
  payment.addEventListener('close',()=>{if(!document.querySelector('.ll-confirm-dialog[open]'))el('actions').querySelector('.bill-start')?.focus({preventScroll:true});});
  function choices(container,options,value,change){
   container.replaceChildren(...options.map(([key,label])=>{const b=button(label,()=>{const restore=document.activeElement===b;change(key);if(restore)Array.from(container.querySelectorAll('button')).find(next=>next.textContent===label)?.focus({preventScroll:true});});b.setAttribute('aria-pressed',String(key===value));return b;}));
  }
  function termChange(key){term=key;months=key==='monthly'?1:12;paint();}
  function paint(){
   choices(el('period'),[['monthly','Monthly'],['yearly','Yearly · 2 months free']],term,termChange);
   const cards=Object.entries(labels).map(([key,label])=>{
    const card=node('article','','ws-card n-out bill-plan');card.dataset.selected=String(key===plan);
    const head=node('header');head.append(node('h2',label));if(key!=='free')head.append(node('small',key==='pro'?'Most chosen':'Verified mentors only'));
    card.append(head,node('strong',money(data.plans[key][term]),'bill-price'),node('small','Sample · per '+(term==='monthly'?'month':'year')));
    const blurb={free:'Everything needed to journal and size trades safely.',pro:'Mistake lab, AI reports and deeper journal insights.',mentor:'Pro plus spaces for your students.'};head.after(node('p',blurb[key]));
    const choose=button(key===data.current?'Current plan':key==='mentor'&&!data.verified?'Verify first':key===plan?'Selected':'Choose '+label,()=>{
     if(key==='mentor'&&!data.verified){location.assign('/mentor-verification');return;}plan=key;paint();
    });choose.disabled=key===data.current||busy;choose.setAttribute('aria-pressed',String(plan===key));card.append(choose);return card;
   });el('plans').replaceChildren(...cards);
   choices(el('methods'),Object.entries(methods),method,key=>{method=key;paint();});
   const crypto=el('crypto');crypto.replaceChildren();
   if(method==='Crypto'){
    const box=node('section','','ws-card n-out bill-section');crypto.append(box);box.append(node('h2','Crypto period'),node('p','Prepaid access. No automatic renewal. We’ll email you 7 days before it ends.'));
    for(const [name,opts,val,change] of [
     ['Period',[1,3,12].map(n=>[n,n+' month'+(n===1?'':'s')]),months,n=>{months=n;term=n===12?'yearly':'monthly';}],
     ['Coin',['USDC','USDT'].map(x=>[x,x]),coin,x=>{coin=x;network='Polygon';}],
     ['Network',(coin==='USDC'?['Polygon','Base']:['Polygon','Tron']).map(x=>[x,x]),network,x=>{network=x;}]
    ]){const group=node('div','','bill-options');box.append(node('h3',name),group);choices(group,opts,val,key=>{change(key);paint();});}
    box.append(node('p','Send only the selected coin on the selected network.'),node('div','','bill-quote'));
   }
   el('payment-plan').textContent=labels[plan]+' · '+(method==='Crypto'?months+' month'+(months===1?'':'s'):term==='yearly'?'Yearly':'Monthly');
   const confirm=button(method==='Crypto'?'Get payment quote':method==='Card'?'Pay with card':'Continue with '+methods[method],checkout);
   confirm.classList.replace('btn-secondary','btn-primary');confirm.disabled=busy||plan==='free'||plan===data.current&&method!=='Crypto';
   el('confirm-payment').replaceChildren(confirm);
   const actions=el('actions');
   const start=button(busy?'View payment':labels[plan]===labels[data.current]?'Extend '+labels[plan]:'Start '+labels[plan],openPayment);
   start.classList.replace('btn-secondary','btn-primary');start.classList.add('bill-start');start.disabled=plan==='free'&&!busy;
   start.setAttribute('aria-haspopup','dialog');
   actions.replaceChildren(start);
   const manage=button('Cancel or pause',managePlan);manage.disabled=!data.orders.some(o=>o.method!=='Crypto'&&!o.renewal_action);actions.append(manage);
   if(busy)for(const key of ['period','methods','crypto'])for(const b of el(key).querySelectorAll('button'))b.disabled=true;
  }
  function managePlan(){
   const dialog=node('dialog','','report-dialog n-out');dialog.append(node('h2','Cancel or pause'));
   for(const order of data.orders.filter(o=>o.method!=='Crypto'&&!o.renewal_action)){
    dialog.append(node('p',order.method+' · Access until '+formatDate(order.paid_until)));
    for(const action of ['pause','cancel'])dialog.append(button(action==='pause'?'Pause at period end':'Cancel at period end',async()=>{try{await request('/api/billing/manage','POST',{id:order.id,action});order.renewal_action=action;dialog.close();paint();note('Your subscription will '+action+' at period end.');}catch(e){note(e.message);dialog.close();}}));
   }
   dialog.append(button('Keep plan',()=>dialog.close()));document.body.append(dialog);dialog.onclose=()=>dialog.remove();dialog.showModal();
  }
  function showCardAction(details){
   paymentStatus.querySelector('[data-card-checkout]')?.remove();
   const action=button('Pay with card',async()=>{
    if(cardOpen)return;
    cardOpen=true;
    action.disabled=true;
    el('payment-message').replaceChildren(processingCard('Opening secure card checkout…'));
    const onReturn=authorized=>{
     cardOpen=false;
     action.disabled=false;
     if(!page.isConnected)return;
     if(!payment.open)payment.showModal();
     if(authorized)el('payment-message').replaceChildren(processingCard('Confirming your card payment…'));
     else note('Card checkout closed. You can reopen it here.');
    };
    try{await openCardCheckout(details,()=>payment.close(),onReturn);}
    catch(error){cardOpen=false;action.disabled=false;note(error.message);}
   });
   action.dataset.cardCheckout='';
   action.classList.replace('btn-secondary','btn-primary');
   paymentStatus.append(action);
   return action;
  }
  async function checkout(){
   if(busy)return;busy=true;paint();if(method==='Card')el('payment-message').replaceChildren(processingCard('Preparing card checkout…'));
   else note('Preparing checkout…');
   try{
    const order=await request('/api/billing/checkout','POST',{plan,method,term,months,coin,network});activeOrder=order.id;
    sessionStorage.setItem(orderKey,JSON.stringify({id:order.id,destination}));note('');
    if(order.quote)await displayQuote(order.quote);
    if(order.cardCheckout){
     const cardAction=showCardAction(order.cardCheckout);
     if(payment.open)cardAction.click();
    }
    else if(order.url){const link=node('a','Open secure payment','btn btn-primary');link.href=order.url;link.target='_blank';link.rel='noopener';paymentStatus.append(link);}
    poll();
   }catch(e){busy=false;paint();note(e.message);}
  }
  async function displayQuote(q){
   method='Crypto';coin=q.coin;network=q.network;const host=el('crypto').querySelector('.bill-quote');if(!host)return;
   const qr=node('canvas');await QRCode.toCanvas(qr,q.address,{width:208,margin:4});
   const time=node('p');host.replaceChildren(node('h3','Send exactly '+q.amount+' '+q.coin),node('p',q.network),qr,node('code',q.address),button('Copy address',async()=>{try{await navigator.clipboard.writeText(q.address);note('Address copied.');}catch{note('Select and copy the address shown.');}}),time,node('p','Waiting for payment → Confirming on network → Paid and plan unlocked'));
   const tick=()=>{const sec=Math.max(0,Math.ceil((Date.parse(q.expiresAt)-Date.now())/1000));time.textContent=sec?'Price locked · '+Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0'):'Quote expired. Check payment status before requesting a new quote.';if(!sec){clearInterval(quoteTimer);if(!host.querySelector('[data-renew]')){const retry=button('Get fresh quote',()=>{reset();checkout();});retry.dataset.renew='';host.append(retry);}}};
   clearInterval(quoteTimer);quoteTimer=setInterval(tick,1000);tick();
  }
  function reset(){clearTimeout(pollTimer);clearInterval(quoteTimer);activeOrder=null;paymentStatus.querySelector('a, [data-card-checkout]')?.remove();el('payment-message').textContent='';sessionStorage.removeItem(orderKey);busy=false;paint();}
  async function poll(){
   const id=activeOrder;if(!id||!page.isConnected)return;
   try{
    const state=await request('/api/billing/status?id='+encodeURIComponent(id),'GET');if(id!==activeOrder)return;
    if(state.confirmed&&cardOpen){pollTimer=setTimeout(poll,1200);return;}
    if(state.confirmed){const saved=JSON.parse(sessionStorage.getItem(orderKey)||'{}');reset();payment.close();showConfirmation('payment','Your '+labels[state.plan]+' access is active.',()=>planReadyScreen(state.plan,data.plans[state.plan].features,()=>location.assign(saved.destination==='/reports'?'/reports?welcome=pro':saved.destination==='/spaces'?'/spaces':'/billing')));return;}
    if(state.cardCheckout&&!paymentStatus.querySelector('[data-card-checkout]'))showCardAction(state.cardCheckout);
    if(!state.cardCheckout&&state.hosted_url&&!paymentStatus.querySelector('a')){const link=node('a','Resume secure checkout','btn btn-secondary');link.href=state.hosted_url;link.target='_blank';link.rel='noopener';paymentStatus.append(link);}
    if(state.quote&&!page.querySelector('.bill-quote canvas')){method='Crypto';coin=state.quote.coin;network=state.quote.network;paint();await displayQuote(state.quote);}
    if(['expired','failed'].includes(state.payment_state)){reset();note('Payment '+state.payment_state+'. Start again for a fresh checkout.');return;}
    if(state.payment_state==='underpaid')note('Payment is short. Top up the original payment on the same network.');
    if(state.payment_state==='confirming')note('Confirming payment on the network…');
   }catch(e){note(e.message);}
   pollTimer=setTimeout(poll,3500);
  }
  const table=node('table');table.innerHTML='<thead><tr><th>Feature</th><th>Free</th><th>Pro</th><th>Mentor</th></tr></thead>';
  for(const row of rows){const tr=table.insertRow();row.forEach((value,i)=>tr.insertCell().textContent=i?(value?'✓':'—'):value);}
  el('compare').append(table);
  Object.values(labels).forEach((label,i)=>{const details=node('details','','bill-mobile');details.append(node('summary',label));for(const row of rows)details.append(node('p',(row[i+1]?'✓ ':'— ')+row[0]));el('compare').append(details);});
  const meter=node('meter');meter.min=0;meter.max=Math.max(1,data.usage);meter.value=data.usage;el('usage').append(node('strong',String(data.usage)),node('p','Replays used this month'),meter);
  const form=node('form','','ws-form');for(const [name,label] of [['billing_name','Name on invoice'],['gstin','GSTIN (optional)'],['address','Billing address']]){const field=node('label',label),input=node('input');input.name=name;input.value=data.profile[name]??'';input.required=name==='billing_name';field.append(input);form.append(field);}
  const save=node('button','Save details','btn btn-secondary');form.append(node('p','Invoices are sent to '+data.profile.email),save);el('profile').append(form);
  form.onsubmit=async e=>{e.preventDefault();save.disabled=true;try{await request('/api/billing/profile','PUT',Object.fromEntries(new FormData(form)));note('Invoice details saved.');}catch(err){note(err.message);}finally{save.disabled=false;}};
  for(const row of data.invoices){const entry=node('div','','bill-invoice');entry.append(node('strong','LL-'+String(row.id).padStart(6,'0')),node('span',formatDate(row.created_at)),node('span',row.method+' · '+money(row.amount_paise/100)),button('PDF',async()=>{try{const {pdf}=await request('/api/billing/invoice?id='+row.id,'GET');const a=node('a');a.download='Ledgerline-'+row.id+'.pdf';a.href='data:application/pdf;base64,'+pdf;a.click();}catch(e){note(e.message);}}));el('invoices').append(entry);}
  if(!data.invoices.length)el('invoices').append(node('p','Your first invoice appears here after payment.'));
  const grace=data.orders.find(o=>Date.parse(o.grace_until)>Date.now());if(grace)note('Payment failed. Access continues until '+formatDate(grace.grace_until)+'.');
  paint();const saved=JSON.parse(sessionStorage.getItem(orderKey)||'null');if(saved){busy=true;activeOrder=saved.id;paint();openPayment();note('Checking payment status…');poll();}
  window.addEventListener('pagehide',()=>{clearTimeout(pollTimer);clearInterval(quoteTimer);},{once:true});
 }
};