import {button,node} from '../../pages/workspace-ui.js';
import './reports.css';

function dialog(title,drawer=false) {
  const box=node('dialog','','report-dialog n-out'+(drawer?' is-drawer':''));
  box.setAttribute('aria-label',title);
  box.append(node('h2',title));
  document.body.append(box);
  box.addEventListener('close',()=>box.remove(),{once:true});
  box.showModal();
  return box;
}

export async function checkoutDrawer(term,request) {
  const box=dialog('Pay for Pro',true);
  const options=node('div','','ws-actions'),status=node('p');
  const methods=['UPI','Card','Crypto'];
  const pay=button('Continue to payment',async()=>{
    pay.disabled=true;
    try{
      const order=await request('/api/billing/checkout','POST',{term,method:selected});
      const link=node('a','Open secure checkout','n-btn n-acc dash-button');link.href=order.url;link.target='_blank';link.rel='noopener';
      pay.replaceWith(link);
      const resume=node('a','Check payment in Reports','n-btn n-out dash-button');resume.href='/reports?checkout='+encodeURIComponent(order.id);box.append(resume);
    }catch(e){status.textContent=e.message;pay.disabled=false;}
  });
  let available={},selected='UPI';
  function select(method){
    selected=method;pay.disabled=!(method==='Crypto'?available.crypto?.[term]:available[term]);

    for(const b of options.children)b.setAttribute('aria-pressed',String(b.textContent===method));
    status.textContent=!pay.disabled?'You will review the price and authorize payment in secure checkout.':method+' payments are coming soon. Checkout will open once Ledgerline connects a payment provider.';
  }
  for(const method of methods)options.append(button(method,()=>select(method)));
  box.append(options,node('p','Pro · '+term+' billing'),status,pay,button('Back',()=>box.close()));
  select('UPI');
  try{available=await request('/api/billing/checkout','GET');select(selected);}catch(e){status.textContent=e.message;}
}

export function upgradeGate(feature,request) {
  if(feature!=='aiReview')return;
  const box=dialog('Upgrade to Pro'),list=node('ul'),terms=node('div','','ws-actions');
  for(const item of ['Full AI report with links to your trades','Pattern finder','Pre-market plan check','Weekly mistake experiments','Ask your journal, with citations'])list.append(node('li',item));
  let term='monthly';
  for(const title of ['monthly','yearly']) {
    const b=button(title==='monthly'?'Monthly':'Yearly',()=>{term=title;for(const other of terms.children)other.setAttribute('aria-pressed',String(other===b));});
    b.setAttribute('aria-pressed',String(title===term));terms.append(b);
  }
  box.append(list,terms,button('Continue',()=>{box.close();checkoutDrawer(term,request);}),button('Not now',()=>box.close()),node('p','Streaks, scoring, rewards and certificates stay free.'));
}
