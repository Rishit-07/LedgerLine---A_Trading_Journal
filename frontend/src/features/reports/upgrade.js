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

export function checkoutDrawer(term='monthly') {
  const box=dialog('Pay for Pro',true);
  const options=node('div','','ws-actions'),status=node('p');
  const methods=['UPI','Card','Crypto'];
  function select(method){
    for(const b of options.children)b.setAttribute('aria-pressed',String(b.textContent===method));
    status.textContent=method+' payments are coming soon. Checkout will open once Ledgerline connects a payment provider.';
  }
  for(const method of methods)options.append(button(method,()=>select(method)));
  box.append(options,node('p','Pro · '+term+' billing'),status,button('Back',()=>box.close()));
  select('UPI');
}

export function upgradeGate(feature) {
  if(feature!=='aiReview')return;
  const box=dialog('Upgrade to Pro'),list=node('ul'),terms=node('div','','ws-actions');
  for(const item of ['Full AI report with links to your trades','Pattern finder','Pre-market plan check','Weekly mistake experiments','Ask your journal, with citations'])list.append(node('li',item));
  let term='monthly';
  for(const title of ['monthly','yearly']) {
    const b=button(title==='monthly'?'Monthly':'Yearly',()=>{term=title;for(const other of terms.children)other.setAttribute('aria-pressed',String(other===b));});
    b.setAttribute('aria-pressed',String(title===term));terms.append(b);
  }
  box.append(list,terms,button('Continue',()=>{box.close();checkoutDrawer(term);}),button('Not now',()=>box.close()),node('p','Streaks, scoring, rewards and certificates stay free.'));
}
