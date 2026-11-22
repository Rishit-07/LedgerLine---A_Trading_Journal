import { paginate } from './pagination.js';
import { select, node, button, message, submit, stat, signedR, closedSummary, formatDate } from './workspace-ui.js';

export const plan={
  title:'Pre-market plan',description:'Five minutes before the open, decide what you will and will not do.',
  action:'<span class="n-in plan-market-clock" data-plan-market-clock hidden></span>',
  content:`<div class="plan-layout">
    <div class="plan-main"><nav class="plan-steps" aria-label="Plan steps">
      ${['Bias','Setups','Limits','Commit'].map((label,index)=>`<button class="n-btn n-out" type="button" data-plan-step="${index}"><span>${index+1}</span>${label}</button>`).join('')}
    </nav><section class="n-out ws-card">
      <form class="ws-form" data-full-plan><fieldset class="plan-step">
        <div data-plan-pane="0"><h2>What is the market likely to do?</h2><p>Decide what you are watching before the session starts.</p>
          <fieldset class="plan-bias"><legend class="ws-visually-hidden">Market bias</legend>
            <label class="n-out"><input type="radio" name="bias" value="Bullish"><span><strong>Up</strong><small>Buyers are in control. Look for pullbacks to buy.</small></span></label>
            <label class="n-out"><input type="radio" name="bias" value="Neutral" checked><span><strong>Range</strong><small>No clear direction. Watch the edges of the range.</small></span></label>
            <label class="n-out"><input type="radio" name="bias" value="Bearish"><span><strong>Down</strong><small>Sellers are in control. Look for bounces to sell.</small></span></label>
          </fieldset>
          <p class="plan-field-label">Levels I am watching</p><div class="plan-chips" data-plan-level-chips></div>
          <details class="plan-edit-levels"><summary>Edit levels</summary><label>One level per line<textarea class="n-in" name="levels" maxlength="500" rows="2"></textarea></label></details>
          <label class="plan-note"><span class="ws-visually-hidden">Plan notes</span><textarea class="n-in" name="notes" maxlength="1000" rows="2" placeholder="Write a short note for today’s session"></textarea></label></div>
        <div data-plan-pane="1" hidden><h2>Which setups are allowed today?</h2>
          <label>Up to three setups, one per line<textarea name="setups" rows="3" maxlength="302"></textarea></label>
          <div class="ws-actions" data-plan-setup-chips></div></div>
        <div data-plan-pane="2" hidden><h2>Decide the limits while you are calm</h2>
          <div class="ws-filter-grid"><label>Max loss for the day (R)<input name="maxLoss" type="number" min=".25" max="20" step=".25" required></label>
            <label>Max trades<input name="maxTrades" type="number" min="1" max="30" required></label></div></div>
        <div data-plan-pane="3" hidden><h2>How are you, honestly?</h2>
          <p>Review the plan alongside your rules before you commit.</p>
          <label>State of mind<select name="mood"><option value="">Choose how you feel</option><option>Calm</option><option>Rushed</option><option>Fearful</option><option>Confident</option></select></label></div>
      </fieldset><div class="ws-actions"><button class="n-btn n-out dash-button" value="save">Save draft</button>
        <button class="n-btn n-acc dash-button" value="lock" hidden>Hold to commit</button><button class="n-btn n-out dash-button" value="unlock" hidden>Unlock plan</button></div>
      </form><p role="status" data-full-plan-status></p></section>
      <section class="n-out ws-card plan-rules-card"><h2>Rules I am holding myself to</h2><p>These rules apply to each trade logged today.</p><div data-full-plan-rules></div></section></div>
    <aside class="ws-stack plan-summary-stack"><section class="n-out ws-card"><div class="ws-section-head"><h2><i class="plan-status-ring" aria-hidden="true"></i>Today’s plan</h2><span class="n-in plan-state" data-plan-state></span></div>
      <p data-plan-date></p><div class="ws-stack" data-full-plan-summary></div>
      <div class="ws-actions plan-pagination"><button class="n-btn n-out dash-button" type="button" data-plan-back>Back</button>
        <button class="n-btn n-acc dash-button" type="button" data-plan-next>Next</button></div></section>
      <section class="n-out ws-card"><h2>Yesterday</h2><p>Closed trades only.</p><div class="ws-stack" data-yesterday></div></section></aside></div>`,
  async bind(page,{ data,request }){
    const form=select(page,'[data-full-plan]'), status=select(page,'[data-full-plan-status]');
    const steps=[...page.querySelectorAll('[data-plan-step]')];
    const panes=[...page.querySelectorAll('[data-plan-pane]')];
    const back=select(page,'[data-plan-back]'),next=select(page,'[data-plan-next]');
    const lock=select(page,'[value=lock]');
    const draft=select(page,'[value=save]');
    const unlock=select(page,'[value=unlock]');
    let step=0,record,hold;
    form.hidden=true;
    function renderStep(){
      steps.forEach((control,index)=>control.setAttribute('aria-current',index===step?'step':'false'));
      panes.forEach((pane,index)=>{pane.hidden=index!==step;});
      back.disabled=step===0;next.disabled=step===steps.length-1;
      draft.hidden=Boolean(record?.locked);unlock.hidden=!record?.locked;
      lock.hidden=Boolean(record?.locked)||step!==steps.length-1;
    }
    function drawSummary(){
      const summaries=select(page,'[data-full-plan-summary]');
      const mood=form.elements.mood.value;
      const setups=form.elements.setups.value.split(/\n/).filter((value)=>value.trim());
      const bias={Bullish:'Up. Buyers are in control. Look for pullbacks to buy.',Neutral:'Range. No clear direction.',Bearish:'Down. Sellers are in control. Look for bounces to sell.'};
      const id=node('div','','plan-summary-copy');
      id.append(node('small','Bias'),node('strong',bias[form.elements.bias.value]||'—'),node('small','Setups'));
      const setupChips=node('div','','plan-chips');
      setupChips.append(...(setups.length?setups:['No setups selected']).map((value)=>node('span',value,'n-in')));
      id.append(setupChips);
      const levels=form.elements.levels.value.split(/\n/).map((level)=>level.trim()).filter(Boolean);
      select(page,'[data-plan-level-chips]').replaceChildren(...levels.map((level)=>node('span',level,'n-in')));
      const limits=node('div','','plan-pair');
      const loss=stat('Max loss',form.elements.maxLoss.value?'−'+form.elements.maxLoss.value+'R':'—');
      loss.querySelector('strong').className='is-loss';
      limits.append(loss,stat('Max trades',form.elements.maxTrades.value||'—'));
      summaries.replaceChildren(id,limits);
      const state=node('div','','plan-summary-copy');state.append(node('small','State of mind'),node('strong',mood||'—'));summaries.append(state);
      if(form.elements.notes.value)summaries.append(node('p',form.elements.notes.value,'n-in ws-list-card'));
    }
    function render(current){
      record=current;
      const locked=Boolean(current?.locked);
      form.elements.bias.value=current?.bias || 'Neutral';
      form.elements.levels.value=current?.levels?.watched ?? '';
      form.elements.notes.value=current?.levels?.notes ?? '';
      form.elements.setups.value=(current?.levels?.setups ?? []).join('\n');
      form.elements.maxLoss.value=current?.levels?.maxLoss ?? data.account.dailyLossLimit;
      form.elements.maxTrades.value=current?.levels?.maxTrades ?? data.account.maxTrades;
      form.elements.mood.value=current?.levels?.mood ?? '';
      form.querySelector('fieldset').disabled=locked;
      select(page,'[data-plan-state]').textContent=locked?'Locked':'Draft';
      select(page,'[data-plan-date]').textContent=(new URLSearchParams(location.search).get('day')==='tomorrow'?'Tomorrow':formatDate(data.today)+' · IST');
      renderStep();drawSummary();
    }
    function go(index){step=index;renderStep();}
    steps.forEach((button,index)=>button.addEventListener('click',()=>go(index)));
    back.addEventListener('click',()=>go(step-1));next.addEventListener('click',()=>go(step+1));
    form.addEventListener('input',drawSummary);
    function stopHold(){clearTimeout(hold);lock.classList.remove('is-holding');}
    lock.addEventListener('pointerdown',(event)=>{
      if(event.button!==0 || !event.isPrimary || lock.disabled)return;
      lock.classList.add('is-holding');
      hold=setTimeout(()=>{stopHold();form.requestSubmit(lock);},1200);
    });
    for(const type of ['pointerup','pointerleave','pointercancel'])lock.addEventListener(type,stopHold);
    lock.addEventListener('click',(event)=>{if(event.detail>0)event.preventDefault();});
    select(page,'[data-full-plan-rules]').replaceChildren(...data.rules.map((rule)=>{
      const row=node('div','','plan-rule-row');
      const check=node('span','✓');check.setAttribute('aria-hidden','true');
      row.append(check,node('strong',rule.text+(rule.hard?' · Hard rule':'')));return row;
    }));
    paginate(select(page,'[data-full-plan-rules]'),'Plan rules',6);
    if(!data.rules.length)select(page,'[data-full-plan-rules]').append(message('No active rules.'));
    const dayKey=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',dateStyle:'short'});
    const yesterday=new Date(Date.parse(data.today)-86400000).toISOString().slice(0,10);
    const trades=data.trades.filter((trade)=>dayKey.format(new Date(trade.closedAt))===yesterday);
    const recentSetups=[...new Set(data.trades.map(({setup})=>setup).filter(Boolean))].slice(0,6);
    select(page,'[data-plan-setup-chips]').append(...recentSetups.map((setup)=>button(setup,()=>{
      const values=form.elements.setups.value.split(/\n/).map((value)=>value.trim()).filter(Boolean);
      if(values.includes(setup))form.elements.setups.value=values.filter((value)=>value!==setup).join('\n');
      else if(values.length<3)form.elements.setups.value=[...values,setup].join('\n');
      drawSummary();
    })));
    const recap=select(page,'[data-yesterday]');
    if(trades.length){
      const numbers=node('div','','plan-pair');
      const total=closedSummary(trades).sum;
      const result=stat('Result',signedR(total),trades.length+' closed');
      result.querySelector('strong').className=total>0?'is-win':total<0?'is-loss':'';
      const checks=trades.reduce((count,trade)=>count+trade.checks,0);
      const kept=trades.reduce((count,trade)=>count+trade.kept,0);
      numbers.append(result,stat('Rules kept',checks?kept+' of '+checks:'—'));recap.append(numbers);
      const note=trades.find((trade)=>trade.note)?.note;if(note)recap.append(node('p','Your note: '+note,'dash-muted'));
      const link=node('a','Review yesterday’s trade','n-btn n-out dash-button'); link.href='/journal?tradeId='+encodeURIComponent(trades[0].id);recap.append(link);
    }else recap.append(message('No trades closed yesterday.'));
    const tomorrow=new URLSearchParams(location.search).get('day')==='tomorrow';
    const planEndpoint='/api/plan'+(tomorrow?'?day=tomorrow':'');
    if(tomorrow)page.querySelector('h1').textContent='Tomorrow’s pre-market plan';
    const {plan:current}=await request(planEndpoint,'GET');
    render(current);form.hidden=false;
    void request('/api/calendar/day?'+new URLSearchParams({date:data.today,view:'market'}),'GET').then(({marketHours})=>{
      if(!['published','live'].includes(marketHours?.status))return;
      const clock=select(page,'[data-plan-market-clock]');
      const paint=()=>{
        const now=Date.now();
        const opens=marketHours.data.map(({opensAt})=>Date.parse(opensAt)).filter((time)=>time>now).sort((left,right)=>left-right);
        const ends=marketHours.data.map(({opensAt,closesAt})=>Date.parse(opensAt)<=now?Date.parse(closesAt):0).filter((time)=>time>now);
        clock.textContent=ends.length?'Market is open':opens.length?'Market opens in '+Math.ceil((opens[0]-now)/60000)+' min':
          marketHours.specialHoursUnlisted?'Special session · hours unavailable':marketHours.data.length?'Market closed':'No scheduled session today';
        clock.hidden=false;
      };
      paint();
      const timer=setInterval(paint,30000);
      addEventListener('pagehide',()=>clearInterval(timer),{once:true});
    }).catch(()=>{});
    form.addEventListener('submit',(event)=>{
      const action=event.submitter?.value??'save';
      return submit(event,status,async(values)=>{
        const {bias,levels,notes,mood}=values;
        const setups=values.setups?.split(/\n/).map((value)=>value.trim()).filter(Boolean);
        const details=action==='unlock'?{action}:{action,bias,levels,notes,options:{setups,maxLoss:Number(values.maxLoss),maxTrades:Number(values.maxTrades),mood}};
        const {plan:updated}=await request(planEndpoint,'PUT',details);render(updated);
        return {save:'Plan saved.',lock:'Plan locked for today.',unlock:'Plan unlocked.'}[action];
      });
    });
  }
};
