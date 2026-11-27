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
 for(const feature of features){
  const chip=node('span',feature),tick=node('i','','pr-check');tick.setAttribute('aria-hidden','true');chip.prepend(tick);chips.append(chip);
 }
 const confetti=node('canvas','','pr-confetti');confetti.width=680;confetti.height=440;
 const ctx=confetti.getContext('2d'),burst={progress:0};
 function drawBurst(){
  const t=burst.progress;ctx.clearRect(0,0,680,440);ctx.globalAlpha=1-t;
  for(let i=0;i<42;i++){
   const angle=i*2.39996,distance=75+(i%9)*27;
   ctx.save();ctx.translate(340+Math.cos(angle)*distance*t,220+Math.sin(angle)*distance*t+65*t*t);
   ctx.rotate(t*i*.6);ctx.fillStyle=['#e9d9b4','#ffffff','#b8a077','#8a8a8f'][i%4];ctx.fillRect(-3,-6,6,12);
   if(i%3===0)ctx.fillRect(-.8,-11,1.6,22);ctx.restore();
  }
 }
 stage.append(...waves,card,confetti);
 const proceed=button('Continue',()=>dialog.close()),replay=button('Replay',play);
 actions.append(proceed,replay);dialog.append(glow,wipe,stage,title,caption,chips,actions);
 document.body.append(dialog);dialog.showModal();
 let timeline,start,deadline;
 function play(){
  clearTimeout(deadline);timeline?.kill();start=performance.now();actions.inert=true;
  timeline=gsap.timeline({onComplete:()=>{actions.inert=false;proceed.focus({preventScroll:true});}});
  deadline=setTimeout(()=>timeline.progress(1),3900);
  if(matchMedia('(prefers-reduced-motion: reduce)').matches){timeline.fromTo(dialog,{opacity:0},{opacity:1,duration:.18});return;}
  timeline.fromTo(glow,{opacity:1,scale:.1},{opacity:0,scale:4,duration:.7},0)
   .fromTo(wipe,{clipPath:'circle(0%)',scaleY:1},{clipPath:'circle(100%)',duration:.6},0)
   .to(wipe,{scaleY:0,duration:.36},.53)
   .fromTo(card,{y:-150,scale:.2,rotationY:-734,rotationZ:16,opacity:0},{y:0,scale:1.13,rotationY:-14,rotationX:14,rotationZ:-4,opacity:1,duration:1.15,ease:'power3.out'},.58)
   .to(card,{scale:1,duration:.35},1.73)
   .fromTo(waves,{scale:.3,opacity:.7},{scale:2,opacity:0,duration:.8,stagger:.09},1.65)
   .fromTo(card.lastChild,{xPercent:-160},{xPercent:180,duration:.7},1.75)
   .fromTo(burst,{progress:0},{progress:1,duration:.85,onUpdate:drawBurst},1.75)
   .fromTo(title.children,{y:15,opacity:0},{y:0,opacity:1,stagger:.07,duration:.32},2.05)
   .fromTo(caption,{opacity:0},{opacity:1,duration:.3},2.48)
   .fromTo(chips.children,{scale:.75,opacity:0},{scale:1,opacity:1,stagger:.07,ease:'back.out(2)',duration:.38},2.72)
   .fromTo(chips.querySelectorAll('.pr-check'),{clipPath:'inset(0 100% 0 0)'},{clipPath:'inset(0 0% 0 0)',duration:.22,stagger:.07},2.92)
   .fromTo(actions,{y:14,opacity:0},{y:0,opacity:1,duration:.34},3.48);
 }
 dialog.onclick=e=>{if(actions.inert&&performance.now()-start>1000&&!actions.contains(e.target))timeline.progress(1);};
 card.onpointermove=e=>{if(actions.inert||!matchMedia('(hover:hover) and (prefers-reduced-motion:no-preference)').matches)return;const r=card.getBoundingClientRect(),x=(e.clientX-r.left)/r.width;gsap.set(card,{rotationY:(x-.5)*28,rotationX:14-(e.clientY-r.top)/r.height*14});card.style.setProperty('--light',Math.round(x*100)+'%');};
 dialog.addEventListener('close',()=>{clearTimeout(deadline);timeline?.kill();dialog.remove();done();},{once:true});play();
}