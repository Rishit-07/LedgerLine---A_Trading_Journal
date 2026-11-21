import {processingCard} from '../../components/billing-ready.js';
import {checkoutCard} from '../../components/confirmation-motion.js';
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
  const card=checkoutCard();
  const methods=['UPI','Card','Crypto'];
  const pay=button('Continue to payment',async()=>{
    pay.disabled=true;
    const processing=processingCard('Preparing secure checkout…');
    options.inert=true;card.inert=true;box.insertBefore(processing,pay);
    try{
      const order=await request('/api/billing/checkout','POST',{term,method:selected});
      const link=node('a','Open secure checkout','n-btn n-acc dash-button');link.href=order.url;link.target='_blank';link.rel='noopener';
      pay.replaceWith(link);
      const resume=node('a','Check payment in Reports','n-btn n-out dash-button');resume.href='/reports?checkout='+encodeURIComponent(order.id);box.append(resume);
    }catch(e){status.textContent=e.message;pay.disabled=false;}finally{processing.remove();options.inert=false;card.inert=false;}
  });
  let available={},selected='UPI';
  function select(method){
    const direction=Math.sign(methods.indexOf(method)-methods.indexOf(selected));
    const initial=!card.querySelector('strong').textContent;
    card.querySelector('strong').textContent=method;
    if((initial||direction)&&!matchMedia('(prefers-reduced-motion: reduce)').matches){
      card.getAnimations().forEach(a=>a.cancel());
      card.animate([{opacity:.65,transform:'perspective(500px) translateX('+((direction||1)*18)+'px) rotateY('+((direction||1)*14)+'deg) rotateX(6deg)'},{opacity:1,transform:'none'}],{duration:340,easing:'cubic-bezier(.2,.85,.3,1)'});
    }
    selected=method;pay.disabled=!(method==='Crypto'?available.crypto?.[term]:available[term]);

    for(const b of options.children)b.setAttribute('aria-pressed',String(b.textContent===method));
    status.textContent=!pay.disabled?'You will review the price and authorize payment in secure checkout.':method+' payments are coming soon. Checkout will open once Ledgerline connects a payment provider.';
  }
  for(const method of methods)options.append(button(method,()=>select(method)));
  let start;
  card.onpointerdown=e=>{start={x:e.clientX,y:e.clientY};card.setPointerCapture(e.pointerId);};
  card.onpointercancel=()=>{start=null;};
  card.onpointerup=e=>{
    if(!start)return;
    const dx=e.clientX-start.x,dy=e.clientY-start.y;start=null;
    if(Math.abs(dx)>40&&Math.abs(dx)>Math.abs(dy))select(methods[(methods.indexOf(selected)+(dx<0?1:2))%3]);
  };
  box.append(options,card,node('p','Pro · '+term+' billing'),status,pay,button('Back',()=>box.close()));
  select('UPI');
  try{available=await request('/api/billing/checkout','GET');select(selected);}catch(e){status.textContent=e.message;}
}

export function upgradeGate(feature,request) {
  if(feature!=='aiReview')return;
  location.assign('/billing?from=reports');
}
