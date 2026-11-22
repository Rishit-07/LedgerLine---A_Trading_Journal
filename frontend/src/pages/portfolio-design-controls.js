import {node} from './workspace-ui.js';
import {portfolioSetups,portfolioGroups,setupFields,setupColors} from '../../../src/config/portfolio.js';

function options(parent, label, choices, current, swatches=false) {
  const group=node('fieldset','','portfolio-choices');
  group.append(node('legend',label));
  const buttons=[];
  let selected=current;
  for(const [key,name,color] of choices){
    const b=node('button',name);b.type='button';
    b.setAttribute('aria-pressed',String(current===key));
    if(swatches){const dot=node('i');dot.style.background=color || key;b.prepend(dot);}
    b.onclick=()=>{selected=key;buttons.forEach(other=>other.setAttribute('aria-pressed',String(other===b)));};
    buttons.push(b);group.append(b);
  }
  parent.append(group);
  return ()=>selected;
}

export function portfolioDesignControls(form,data) {
  const settings=data.sections?.presentation ?? {};
  const theme=options(form,'Design',[['marginalia','Marginalia','#5b6ee1'],['terracotta','Terracotta','#e0613a'],['sage','Field notes','#2f8f6b'],['dashboard','Dashboard','#514ac0']],settings.theme || data.design || 'marginalia',true);
  const sections=node('fieldset','','portfolio-switch-list');
  sections.append(node('legend','Sections on your page'));
  const switches=[];
  for(const [key,name] of Object.entries(portfolioGroups)){
    const label=node('label',name);
    const input=node('input');input.type='checkbox';input.checked=!settings.hidden?.includes(key);input.value=key;
    label.append(input);sections.append(label);switches.push(input);
  }
  const setups=node('section','','portfolio-edit-setups');
  setups.append(node('h3','Your setups'),node('p','Each named setup has its own page. Match its name to your journal to show recorded stats.'));
  const frame=options(setups,'Show setups as',[['phone','Phone screens'],['card','Plain cards']],settings.frame || 'phone');
  const cards=node('div','','portfolio-setup-list');
  const add=node('button','Add a setup','mgn-customize-secondary');add.type='button';
  setups.append(cards,add);
  const entries=[];
  function sync(){entries.forEach(({title},i)=>title.textContent='Setup '+(i+1));add.hidden=entries.length>=5;}
  function append(item={}){
    const panel=node('details','','portfolio-edit-setup');
    const title=node('summary');panel.append(title);
    const inputs={};
    for(const [key,label,max] of setupFields){
      const field=node('label',label),input=node(['how','checks','note'].includes(key)?'textarea':'input');
      input.maxLength=Math.max(max,(item[key]||'').length);input.value=item[key]||'';field.append(input);panel.append(field);inputs[key]=input;
    }
    const color=options(panel,'Colour',setupColors.map((c,i)=>[c,['Indigo','Green','Clay','Violet','Rose'][i]]),item.color || setupColors[entries.length%5],true);
    const chart=options(panel,'Session chart',[['columns','Columns'],['line','Line'],['bars','Bars']],item.chart || 'columns');
    const remove=node('button','Remove setup','mgn-customize-remove');remove.type='button';
    const entry={title,panel,inputs,read:()=>({...Object.fromEntries(Object.entries(inputs).map(([k,v])=>[k,v.value.trim()])),color:color(),chart:chart()})};
    remove.onclick=()=>{entries.splice(entries.indexOf(entry),1);panel.remove();sync();add.focus();};
    panel.append(remove);cards.append(panel);entries.push(entry);sync();
    return entry;
  }
  const initial=portfolioSetups(data.sections);
  for(let i=0;i<Math.max(3,initial.length);i++)append(initial[i]);
  function focus(i){while(entries.length<=i&&entries.length<5)append();const e=entries[i];if(e){e.panel.open=true;e.inputs.name.focus();}}
  add.onclick=()=>{if(entries.length<5){append();focus(entries.length-1);}};
  form.append(sections,setups);
  return {theme,focus,read(){
    for(const [i,entry] of entries.entries()){
      if(!entry.inputs.name.value.trim() && Object.values(entry.inputs).some(el=>el.value.trim())){
        focus(i);throw Error('Give setup '+(i+1)+' a name before saving.');
      }
    }
    return {theme:theme(),frame:frame(),hidden:switches.filter(s=>!s.checked).map(s=>s.value),setups:entries.map(e=>e.read()).filter(s=>s.name)};
  }};
}
