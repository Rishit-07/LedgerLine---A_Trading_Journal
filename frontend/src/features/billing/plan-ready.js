import {gsap} from 'gsap';
import {node,button} from '../../pages/workspace-ui.js';
import './ready.css';

export function planReadyScreen(plan,features,done){
 const dialog=node('dialog','','plan-ready');
 dialog.setAttribute('aria-label','Your plan is ready');
 const glow=node('div','','pr-light'),wipe=node('div','','pr-wipe'),stage=node('div','','pr-stage');
 const waves=Array.from({length:3},()=>node('i','','pr-wave'));
 const card=node('div','','pr-card ll-card-surface');
 const name=plan==='mentor'?'Mentor':'Pro';
 card.append(node('small','Ledgerline'),node('strong',name),node('i','','pr-shine'));
 const title=node('h2');for(const word of ['You','are','on',name])title.append(node('span',word+' '));
 const caption=node('p','Your workspace is ready.'),chips=node('div','','pr-chips'),actions=node('div','','pr-actions');
 for(const feature of features)chips.append(node('span','✓ '+feature));
 const dots=Array.from({length:32},(_,i)=>{const item=node('i','','pr-candle');item.style.background=['#ff49bf','#8894ff','#ffd692'][i%3];return item;});
 stage.append(...waves,card,...dots);
 const proceed=button('Continue',()=>dialog.close()),replay=button('Replay',play);
 actions.append(proceed,replay);dialog.append(glow,wipe,stage,title,caption,chips,actions);
 document.body.append(dialog);dialog.showModal();
 let timeline,start;
 function play(){
  timeline?.kill();start=performance.now();actions.inert=true;
  timeline=gsap.timeline({onComplete:()=>{actions.inert=false;proceed.focus({preventScroll:true});}});
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){timeline.fromTo(dialog,{opacity:0},{opacity:1,duration:.18});return;}
  timeline.fromTo(glow,{opacity:1,scale:.1},{opacity:0,scale:4,duration:.7},0)
   .fromTo(wipe,{clipPath:'circle(0%)',scaleY:1},{clipPath:'circle(100%)',duration:.6},0)
   .to(wipe,{scaleY:0,duration:.36},.53)
   .fromTo(card,{y:-150,scale:.2,rotationY:-734,rotationZ:16,opacity:0},{y:0,scale:1.13,rotationY:-14,rotationX:14,rotationZ:-4,opacity:1,duration:1.15,ease:'power3.out'},.58)
   .to(card,{scale:1,duration:.35},1.73)
   .fromTo(waves,{scale:.3,opacity:.7},{scale:2,opacity:0,duration:.8,stagger:.09},1.65)
   .fromTo(card.lastChild,{xPercent:-160},{xPercent:180,duration:.7},1.75)
   .fromTo(dots,{x:0,y:0,opacity:1},{x:i=>Math.cos(i*2.4)*145,y:i=>Math.sin(i*2.4)*100,rotation:i=>i*20,opacity:0,duration:.85},1.75)
   .fromTo(title.children,{y:15,opacity:0},{y:0,opacity:1,stagger:.07,duration:.32},2.05)
   .fromTo(caption,{opacity:0},{opacity:1,duration:.3},2.48)
   .fromTo(chips.children,{scale:.75,opacity:0},{scale:1,opacity:1,stagger:.07,ease:'back.out(2)',duration:.38},2.72)
   .fromTo(actions,{y:14,opacity:0},{y:0,opacity:1,duration:.34},3.48);
 }
 dialog.onclick=e=>{if(actions.inert&&performance.now()-start>1000&&!actions.contains(e.target))timeline.progress(1);};
 card.onpointermove=e=>{if(actions.inert||!matchMedia('(hover:hover) and (prefers-reduced-motion:no-preference)').matches)return;const r=card.getBoundingClientRect(),x=(e.clientX-r.left)/r.width;gsap.set(card,{rotationY:(x-.5)*28,rotationX:14-(e.clientY-r.top)/r.height*14});card.style.setProperty('--light',Math.round(x*100)+'%');};
 dialog.addEventListener('close',()=>{timeline?.kill();dialog.remove();done();},{once:true});play();
}