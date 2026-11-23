import { paginate } from './pagination.js';
import { select, node, stat, metric, rate, button, message, submit, formatDate, number } from './workspace-ui.js';

function simulate(p,payoff,risk) {
  let seed=123456789, ruined=0;
  const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/2**32;};
  const endings=[];
  for(let run=0;run<400;run++){
    let equity=1;
    for(let trade=0;trade<200;trade++){
      equity*=random()<p?1+payoff*risk:1-risk;
      if(equity<=.5){ruined++;break;}
    }
    endings.push(equity);
  }
  endings.sort((a,b)=>a-b);
  return {ruined,median:endings[200]};
}
function sequenceOdds(available,needed,p) {
  let chances=[1];
  for(let event=0;event<available;event++){
    const next=new Array(chances.length+1).fill(0);
    chances.forEach((value,index)=>{next[index]+=value*(1-p);next[index+1]+=value*p;});
    chances=next;
  }
  return chances.slice(Math.max(0,needed)).reduce((sum,value)=>sum+value,0);
}
export const sizing={
  title:'Sizing lab',description:'Kelly, Sequence staking and risk of ruin, worked from your own numbers.',
  content:`<div class="ws-notice"><strong>Planning tools</strong><p>Estimates use your inputs and assume independent outcomes. They do not predict trades.</p></div>
  <div class="n-in ws-segments" data-sizing-tabs><button type="button" class="btn btn-ghost" data-tool="kelly">Kelly</button>
    <button type="button" class="btn btn-ghost" data-tool="sequence">Sequence</button><button type="button" class="btn btn-ghost" data-tool="ruin">Risk of ruin</button></div>
  <div class="ws-columns"><section class="n-out ws-card"><h2>Your numbers</h2>
    <form class="ws-form" data-sizing-form>
      <div class="sizing-adjust"><label for="sizing-win">Win chance (%)</label><div>
        <button class="btn btn-secondary" type="button" data-size-field="win" data-size-step="-1" aria-label="Decrease win chance">−</button>
        <input class="n-in" id="sizing-win" name="win" type="number" min="0" max="100" step=".1" required>
        <button class="btn btn-secondary" type="button" data-size-field="win" data-size-step="1" aria-label="Increase win chance">+</button></div></div>
      <div class="sizing-adjust"><label for="sizing-payoff">Win pays (R)</label><div>
        <button class="btn btn-secondary" type="button" data-size-field="payoff" data-size-step="-.1" aria-label="Decrease win payoff">−</button>
        <input class="n-in" id="sizing-payoff" name="payoff" type="number" min=".01" max="100" step=".01" required>
        <button class="btn btn-secondary" type="button" data-size-field="payoff" data-size-step=".1" aria-label="Increase win payoff">+</button></div></div>
      <label data-risk-input hidden>Risk per trade (%)<input name="risk" type="number" min=".01" max="25" step=".01" required></label>
      <fieldset class="sizing-fraction" data-kelly-input><legend>Fraction of Kelly</legend>
        <label class="n-out"><input type="radio" name="fraction" value="1">Full</label>
        <label class="n-out"><input type="radio" name="fraction" value=".5">Half</label>
        <label class="n-out"><input type="radio" name="fraction" value=".25" checked>Quarter</label>
      </fieldset>
      <div class="n-in sizing-formula" data-kelly-formula>f* = p − (1 − p) / b</div>
      <fieldset data-sequence-fields hidden><legend>Series setup</legend><label>Events in the series<input type="number" name="events" min="1" max="30" required></label>
      <label>Wins you need<input type="number" name="needed" min="1" max="30" required></label></fieldset>
      <button class="btn btn-primary">Save preset</button>
    </form><p role="status" data-sizing-status></p></section>
    <section class="n-out ws-card ws-sizing-result"><h2 data-sizing-heading></h2><div data-sizing-results></div></section></div>`,
  bind(page,{data,save}){
    const form=select(page,'[data-sizing-form]');
    const controls=[...page.querySelectorAll('[data-tool]')];
    const result=select(page,'[data-sizing-results]');
    const gauge=document.createElement('template');
    gauge.innerHTML=`<div class="n-in sizing-gauge"><svg viewBox="0 0 230 230" aria-hidden="true"><circle cx="115" cy="115" r="96" />
      <circle cx="115" cy="115" r="96" pathLength="100" data-sizing-arc /></svg><div><strong data-sizing-percent></strong><small>of account per trade</small></div></div>`;
    const names={kelly:'Kelly fraction',sequence:'Series tracker',ruin:'Risk of ruin'};
    for(const [name,value] of Object.entries(data.preset??{risk:data.account.riskPerTrade??1,events:5,needed:3})) {
      if(name==='fraction')form.elements.fraction.value=({1:'1',0.5:'.5',0.25:'.25'})[value];
      else form.elements[name].value=value;
    }
    let tool='kelly', slots=[];
    function render(){
      const {win,payoff,risk,fraction,events,needed}=Object.fromEntries([...new FormData(form)].map(([key,value])=>[key,Number(value)]));
      const p=win/100;
      controls.forEach((control)=>control.setAttribute('aria-pressed',String(control.dataset.tool===tool)));
      select(page,'[data-sizing-heading]').textContent=names[tool];
      select(page,'[data-sequence-fields]').hidden=tool!=='sequence';
      select(page,'[data-risk-input]').hidden=tool!=='ruin';
      select(page,'[data-kelly-input]').hidden=select(page,'[data-kelly-formula]').hidden=tool!=='kelly';
      select(page,'[data-sizing-heading]').hidden=tool==='kelly';
      const numericReady=form.elements.win.value!=='' && form.elements.win.validity.valid;
      if(tool==='sequence'){
        form.elements.needed.max=events;
        if(!form.elements.events.validity.valid || !form.elements.needed.validity.valid || needed>events){
          result.replaceChildren(message('Choose a valid number of events and wins.'));return;
        }
        slots.length=events;
        const wins=slots.filter((slot)=>slot===1).length,losses=slots.filter((slot)=>slot===2).length;
        const remaining=events-wins-losses, target=Math.max(0,needed-wins);
        const series=node('div','','ws-series');
        for(let index=0;index<events;index++) series.append(button(slots[index]===1?'Win':slots[index]===2?'Loss':String(index+1),(event)=>{
          slots[index]=((slots[index]??0)+1)%3;render();
          select(page,'.ws-series').children[index]?.focus();
        }));
        result.replaceChildren(stat('Record',wins+' W · '+losses+' L',target+' wins still needed'),series);
        if(numericReady) result.append(stat('Estimated chance of reaching the target',rate(100*sequenceOdds(remaining,target,p))));
        return;
      }
      if(!numericReady || !form.elements.payoff.validity.valid || !form.elements.risk.validity.valid){
        result.replaceChildren();
        if(tool==='kelly'){
          const image=gauge.content.cloneNode(true);
          select(image,'[data-sizing-percent]').textContent='—';
          select(image,'[data-sizing-arc]').setAttribute('stroke-dasharray','0 100');
          result.append(image);
        }
        result.append(message('Enter your win chance and typical winning R to calculate this result.'));return;
      }
      if(tool==='kelly'){
        const full=p-(1-p)/payoff;
        const value=100*Math.max(0,full)*fraction;
        const image=gauge.content.cloneNode(true);
        select(image,'[data-sizing-percent]').textContent=rate(value);
        select(image,'[data-sizing-arc]').setAttribute('stroke-dasharray',value+' 100');
        select(page,'[data-kelly-formula]').textContent=`f* = p − (1 − p) / b · Full Kelly ${rate(100*full)}`;
        result.replaceChildren(image,node('p',fraction===1?'Full Kelly':fraction===.5?'Half Kelly':'Quarter Kelly','sizing-gauge-label'));
      }else{
        const riskResult=simulate(p,payoff,risk/100);
        result.replaceChildren(stat('Estimated chance of falling below half starting equity',rate(100*riskResult.ruined/400),'400 runs · 200 trades per run'),
          stat('Median ending equity',number.format(riskResult.median)+'×','Relative to starting equity'));
      }
    }
    controls.forEach((control)=>control.addEventListener('click',()=>{tool=control.dataset.tool;render();}));
    for(const control of page.querySelectorAll('[data-size-field]'))control.addEventListener('click',()=>{
      const field=form.elements[control.dataset.sizeField];
      const next=Math.min(Number(field.max),Math.max(Number(field.min),Number(field.value)+Number(control.dataset.sizeStep)));
      field.value=Number(next.toFixed(2));render();
    });
    form.addEventListener('input',render);
    form.addEventListener('submit',(event)=>submit(event,select(page,'[data-sizing-status]'),async(values)=>{
      const preset=Object.fromEntries(['win','payoff','risk','events','needed','fraction'].map((key)=>[key,Number(values[key])]));
      await save(preset);return 'Sizing preset saved.';
    }));
    render();
  }
};

export const forecast={
  title:'Forecast ledger',description:'Write the call, state the odds, track the assumptions, get scored.',
  content:`<div class="ws-notice"><strong>Private notes</strong><p>Forecasts stay in your journal and can be resolved on or after their review date.</p></div>
  <div class="ws-metric-grid" data-forecast-metrics></div>
  <div class="ws-columns ws-forecast-first"><section class="n-out ws-card"><h2>New forecast</h2><p>Write it down before you know.</p>
    <form class="ws-form" data-forecast-form>
      <label>Thesis and assumptions<textarea name="thesis" maxlength="1500" rows="4" required></textarea></label>
      <div class="ws-filter-grid">
      <label>Instrument<input name="symbol" list="forecast-instruments" maxlength="48" required></label><datalist id="forecast-instruments"></datalist>
      <label>Direction<select name="direction"><option value="up">Up</option><option value="down">Down</option><option value="flat">Flat</option></select></label>
      <label>Category<select name="category"><option>Macro</option><option>Earnings</option><option>Technical</option></select></label></div>
      <div class="sizing-adjust"><label for="forecast-probability">Your probability (%)</label><div>
        <button type="button" class="btn btn-secondary" data-probability="-1" aria-label="Decrease probability">−</button>
        <input class="n-in" id="forecast-probability" name="probability" type="number" min="1" max="99" required>
        <button type="button" class="btn btn-secondary" data-probability="1" aria-label="Increase probability">+</button></div></div>
      <label>Review on<input name="dueOn" type="date" required></label>

      <button class="btn btn-primary">Lock this forecast</button>
    </form><p role="status" data-forecast-status></p></section>
    <section class="n-out ws-card"><h2>Open theses</h2><div class="ws-stack" data-forecast-open></div></section></div>
  <div class="ws-columns"><section class="n-out ws-card"><h2>Resolved forecasts</h2><div class="ws-stack" data-forecast-resolved></div></section>
    <section class="n-out ws-card"><h2>Calibration by bucket</h2><p>Said versus happened</p><div class="ws-stack" data-calibration></div></section></div>`,
  bind(page,{data,save,reload}){
    const form=select(page,'[data-forecast-form]');
    select(page,'#forecast-instruments').replaceChildren(...(data.instruments ?? []).map(item=>new Option(item.symbol)));
    form.elements.dueOn.min=new Date(Date.parse(data.today)+86400000).toISOString().slice(0,10);
    const status=select(page,'[data-forecast-status]');
    for(const control of form.querySelectorAll('[data-probability]'))control.addEventListener('click',()=>{
      const input=form.elements.probability;
      input.value=Math.min(99,Math.max(1,Number(input.value)+Number(control.dataset.probability)));
    });
    let records=data.forecasts;
    function render(){
      const open=select(page,'[data-forecast-open]'),closed=select(page,'[data-forecast-resolved]');
      open.replaceChildren();closed.replaceChildren();
      const settled=records.filter((item)=>item.resolvedAt);
      const score=(items)=>items.length?items.reduce((sum,item)=>sum+(item.probability/100-Number(item.outcome))**2,0)/items.length:null;
      const brier=score(settled);
      const hit=settled.length?settled.filter((item)=>item.outcome).length*100/settled.length:null;
      const confidence=settled.length?settled.reduce((sum,item)=>sum+item.probability,0)/settled.length:null;
      const categories=['Macro','Earnings','Technical'].map((name)=>[name,score(settled.filter((item)=>item.category===name))])
        .filter(([,value])=>value!==null).sort((a,b)=>a[1]-b[1]);
      const best=categories[0];
      select(page,'[data-forecast-metrics]').replaceChildren(
        metric('Resolved',String(settled.length),(records.length-settled.length)+' still open'),
        metric('Hit rate',rate(hit),confidence===null?'':'vs '+rate(confidence)+' average confidence'),
        metric('Brier score',brier===null?'—':number.format(brier),'Lower is better'),
        metric('Confidence gap',hit===null?'—':number.format(confidence-hit)+' pts','Confidence minus outcomes'),
        metric('Best area',best?.[0]??'—',best?'Brier '+number.format(best[1]):''));
      for(const item of records){
        const row=node('article','','n-in ws-list-card');
        const head=node('header','','forecast-thesis-head');
        head.append(node('strong',item.symbol+' · '+item.direction),node('b',rate(item.probability),'n-in'));
        row.append(head,node('p',item.thesis),node('small',item.category+' · Review '+formatDate(item.dueOn)));
        const meter=node('progress');meter.max=100;meter.value=item.probability;meter.setAttribute('aria-label','Stated probability');row.append(meter);
        if(item.resolvedAt)row.append(node('small',item.outcome?'Occurred':'Did not occur'));
        if(!item.resolvedAt && item.dueOn<=data.today){
          const actions=node('div','','ws-actions');
          for(const outcome of [true,false])actions.append(button(outcome?'Occurred':'Did not occur',async()=>{
            for(const control of actions.children)control.disabled=true;
            try{await save({action:'resolve',id:item.id,outcome});records=(await reload()).forecasts;render();status.textContent='Forecast resolved.';}
            catch(error){status.textContent=error.message;for(const control of actions.children)control.disabled=false;}
          }));
          row.append(actions);
        }
        (item.resolvedAt?closed:open).append(row);
      }
      paginate(open,'Open theses',4);
      paginate(closed,'Resolved forecasts',4);
      if(!open.children.length)open.append(message('No open forecasts.'));
      if(!closed.children.length)closed.append(message('Resolve a forecast to see its result here.'));
      const calibration=select(page,'[data-calibration]');
      const cards=[];
      if(settled.length){
        cards.push(stat('Brier score',number.format(brier),'Lower is better · '+settled.length+' resolved'));
        for(const [min,max] of [[1,39],[40,69],[70,99]]){
          const bucket=settled.filter(({probability})=>probability>=min&&probability<=max);
          if(bucket.length)cards.push(stat(min+'–'+max+'% confidence',rate(100*bucket.filter(({outcome})=>outcome).length/bucket.length),bucket.length+' resolved · observed frequency'));
        }
      }
      calibration.replaceChildren(...cards);
      if(!cards.length)calibration.append(message('Calibration starts after you resolve a forecast.'));
    }
    form.addEventListener('submit',(event)=>submit(event,status,async(values)=>{
      await save({...values,probability:Number(values.probability)});records=(await reload()).forecasts;form.reset();render();return 'Forecast locked.';
    }));
    render();
  }
};
