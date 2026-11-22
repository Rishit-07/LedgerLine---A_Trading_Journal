import { node, button, stat, formatDate } from './workspace-ui.js';
import './badge-shelf.css';

const groups = { Process:'Rules you kept', Streaks:'Showing up', Review:'Learning from trades', Community:'Shown when Community is on' };
const colors = { Process:['#6f7ff0','#2f3b8f','#5b6ee1'], Streaks:['#ffa24a','#e5531a','#f0762b'], Review:['#35c08b','#17724a','#1f9a68'], Community:['#9a80f0','#4b36b0','#7a5fe0'] };
const portion = item => item.earnedAt ? 1 : Math.min(1,(item.progress ?? 0)/item.target);
const status = item => item.earnedAt ? 'Earned '+formatDate(item.earnedAt) : item.progress == null ? 'Tracking unavailable' : Math.min(item.progress,item.target)+' of '+item.target+' '+item.unit;

export function medal(item) {
  const shell=node('div','','bd-m'+(item.earnedAt?'':' bd-lock'));
  shell.setAttribute('aria-hidden','true');
  const palette = item.key==='process-cup'||item.key==='cup-gold' ? ['#f7c04a','#c27f10','#d99a1c'] : colors[item.category];
  shell.style.setProperty('--badge-gradient','linear-gradient(150deg,'+palette[0]+','+palette[1]+')');
  shell.style.setProperty('--badge-color',palette[2]);
  shell.style.setProperty('--badge-progress',portion(item));
  shell.innerHTML='<svg class="bd-ring" viewBox="0 0 120 120"><circle cx="60" cy="60" r="55"/><circle cx="60" cy="60" r="55" pathLength="1"/></svg><div class="bd-hw"><div class="bd-hex"><svg viewBox="0 0 24 24"><path/></svg></div></div>';
  shell.querySelector('path').setAttribute('d',item.iconPath);
  return shell;
}

export const badgesMarkup = `<div class="account-board badge-shelf" hidden>
  <div class="account-summary" data-shelf-summary></div>
  <div class="badge-columns"><section class="n-out account-panel"><header><div><h2>Your shelf</h2><p>Tap a badge to see what it takes. The ring shows how far along you are.</p></div><strong data-badge-total></strong></header>
  <nav class="badge-filters" aria-label="Filter badges"></nav><div data-badge-groups></div></section>
  <aside class="n-out account-panel"><h2>Closest to earning</h2><div data-badge-closest></div></aside></div>
  <section class="n-out account-panel"><h2>How badges work</h2><div class="badge-rules">
    <p><strong>Process only.</strong> You earn them for rules kept, reviews done and days logged.</p>
    <p><strong>No cash value.</strong> They cannot be bought, sold or traded.</p>
    <p><strong>You choose what is public.</strong> Each badge has its own switch for your shared portfolio.</p>
  </div></section>
  <dialog class="n-out badge-detail" aria-label="Badge detail"></dialog>
</div>`;

export async function paintBadges(page,request) {
  const {items}=await request('/api/streak/badges','GET');
  const shelf=page.querySelector('.badge-shelf'), dialog=shelf.querySelector('dialog'), filters=shelf.querySelector('.badge-filters');
  const earned=items.filter(item=>item.earnedAt).sort((a,b)=>Date.parse(b.earnedAt)-Date.parse(a.earnedAt));
  const next=items.filter(item=>!item.earnedAt&&item.progress!=null).sort((a,b)=>portion(b)-portion(a));
  const categories=Object.keys(groups).filter(category=>items.some(item=>item.category===category));
  const summary=[stat('On your shelf',earned.length+' of '+items.length),stat('Latest',earned[0]?.name??'None yet',earned[0]?status(earned[0]):''),stat('Next up',next[0]?.name??'Shelf complete',next[0]?status(next[0]):'')];
  for(const tile of summary){tile.classList.replace('n-in','n-out');}
  shelf.querySelector('[data-shelf-summary]').replaceChildren(...summary);
  shelf.querySelector('[data-badge-total]').textContent=earned.length+' of '+items.length+' earned';

  function open(item) {
    const title=node('h2',item.name), progress=node('progress'), steps=node('ul');
    progress.max=item.target;
    progress.value=portion(item)*item.target;
    progress.setAttribute('aria-label',item.name+' progress');
    for(const step of item.steps) steps.append(node('li',step));
    const share=node('label','Show on my shared portfolio','badge-share'),input=node('input'),message=node('p');
    input.type='checkbox'; input.className='n-switch n-in'; input.setAttribute('role','switch');
    input.checked=item.shared; input.disabled=!item.earnedAt;
    message.setAttribute('role','status');
    function describe(){message.textContent=!item.earnedAt?'Earn this badge before sharing it.':item.shared?'Visitors can see the name and date.':'Hidden. Visitors will not see it.';}
    describe();
    input.onchange=async()=>{
      input.disabled=true;
      try{const result=await request('/api/streak/badges','PUT',{key:item.key,shared:input.checked});item.shared=result.shared;describe();}
      catch(error){input.checked=item.shared;message.textContent=error.message;}
      finally{input.disabled=false;}
    };
    share.append(input);
    const close=button('Close',()=>dialog.close());
    dialog.replaceChildren(close,medal(item),node('small',item.category),title,node('p',item.description),progress,node('p',status(item)),node('h3','How to get there'),steps,share,message);
    dialog.showModal();
  }

  function render(category){
    for(const control of filters.children)control.setAttribute('aria-pressed',String(control.textContent===category));
    shelf.querySelector('[data-badge-groups]').replaceChildren(...categories.filter(group=>category==='All'||group===category).map(group=>{
      const section=node('section','','badge-category'), grid=node('div','','badge-grid');
      section.append(node('h3',group),node('small',groups[group]),grid);
      for(const item of items.filter(item=>item.category===group)){
        const tile=button('',()=>open(item));
        tile.classList.add('bd-tile','n-lift');tile.setAttribute('aria-haspopup','dialog');
        const bar=node('span','','bd-bar'),fill=node('i');fill.style.transform='scaleX('+portion(item)+')';bar.append(fill);
        tile.append(medal(item),node('strong',item.name),bar,node('small',status(item)));
        grid.append(tile);
      }
      return section;
    }));
  }
  const closest=shelf.querySelector('[data-badge-closest]');
  closest.replaceChildren();
  filters.replaceChildren();
  for(const item of next.slice(0,4))closest.append(button(item.name+' · '+status(item),()=>open(item)));
  if(!next.length)closest.append(node('p','No tracked badges left on your shelf.'));
  for(const category of ['All',...categories])filters.append(button(category,()=>render(category)));
  render('All');
  shelf.hidden=false;
}
