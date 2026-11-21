import {billingReady} from '../components/billing-ready.js';
import {confirmationCard} from '../components/confirmation-motion.js';
import {checkoutDrawer} from '../features/reports/upgrade.js';
import {node,button} from './workspace-ui.js';
export function preview(landing){
 document.title='Motion preview · Ledgerline';
 const page=node('main','','n-root motion-gallery');landing.replaceWith(page);
 page.append(node('h1','Motion preview'),node('p','Replay these examples without submitting an application or making a payment.'));
 for(const [label,make] of [['Billing entrance',billingReady],['Mentor verification',()=>confirmationCard('mentor','Preview of the approval reveal.')],['Payment confirmation',()=>confirmationCard('payment','Preview of the paid check.')]]){
  const section=node('section','','n-out'),stage=node('div');section.append(node('h2',label),stage,button('Play again',()=>stage.replaceChildren(make())));stage.append(make());page.append(section);
 }
 const checkout=node('section','','n-out');checkout.append(node('h2','Checkout card'),node('p','Swipe the card or switch payment methods to see its tilt and slide.'),button('Preview checkout',()=>checkoutDrawer('monthly',async()=>({}))));page.append(checkout);
}
