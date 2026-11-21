import { paginate } from './pagination.js';
import { select, node, button, fillTradeOptions, formatDate, signedR, submit } from './workspace-ui.js';

function parseCandles(text) {
  const rows=text.trim().split(/\r?\n/);
  if (rows.shift()?.toLowerCase().trim()!=='timestamp,open,high,low,close') throw new Error('Use the CSV header timestamp,open,high,low,close.');
  if(!rows.length || rows.length>500) throw new Error('Use between 1 and 500 candles.');
  return rows.map((line)=>{
    const [timestamp,open,high,low,close,...extra]=line.trim().split(',').map((value)=>value.trim());
    if(extra.length || ![open,high,low,close].every((value)=>value && Number.isFinite(Number(value))) ||
      !timestamp || !/(?:Z|[+-]\d{2}:\d{2})$/i.test(timestamp) || !Number.isFinite(Date.parse(timestamp))) {
      throw new Error('Each candle needs an ISO timestamp with timezone and four numeric prices.');
    }
    return {at:new Date(timestamp).toISOString(),open:Number(open),high:Number(high),low:Number(low),close:Number(close)};
  });
}

export function drawCandles(canvas, candles, step, levels = []) {
  const context=canvas.getContext('2d'), {width,height}=canvas;
  context.clearRect(0,0,width,height);
  const start=Math.max(0,step-59);
  const window=candles.slice(start,start+60);
  const visible=window.slice(0,step-start+1);
  const low=Math.min(...window.map((candle)=>candle.low),...levels.map(({value})=>value));
  const high=Math.max(...window.map((candle)=>candle.high),...levels.map(({value})=>value));
  const y=(price)=>height-20-(height-40)*(price-low)/(high-low || 1);
  const gap=(width-64)/Math.max(12,window.length);
  const theme=getComputedStyle(canvas);
  const token=(name)=>theme.getPropertyValue(name).trim();
  context.font='600 12px IBM Plex Mono, monospace';
  context.textAlign='right';
  for(let row=0;row<5;row++){
    const price=low+(high-low)*row/4;
    const at=y(price);
    context.strokeStyle=token('--track');
    context.beginPath();context.moveTo(18,at);context.lineTo(width-12,at);context.stroke();
    context.fillStyle=token('--mut');context.fillText(Number(price.toFixed(2)),width-12,at-4);
  }
  for(const [index,candle] of visible.entries()){
    const x=20+gap*(index+.5);
    const ink=theme.getPropertyValue(candle.close>=candle.open?'--up':'--down').trim();
    context.strokeStyle=context.fillStyle=ink || (candle.close>=candle.open?'#207a56':'#bd454c');
    context.lineWidth=2;
    context.beginPath();context.moveTo(x,y(candle.low));context.lineTo(x,y(candle.high));context.stroke();
    context.fillRect(x-gap*.25,Math.min(y(candle.open),y(candle.close)),gap*.5,Math.max(2,Math.abs(y(candle.open)-y(candle.close))));
  }
  for(const {label,value,color} of levels){
    context.strokeStyle=context.fillStyle=token(color);
    context.setLineDash([5,5]);
    context.beginPath();context.moveTo(20,y(value));context.lineTo(width-12,y(value));context.stroke();
    context.fillText(label+' '+value,width-14,y(value)-5);
  }
  context.setLineDash([]);
  if(visible.length){
    const x=20+gap*(visible.length-.5);
    context.strokeStyle=token('--acc');context.globalAlpha=.58;
    context.beginPath();context.moveTo(x,12);context.lineTo(x,height-12);context.stroke();
    context.globalAlpha=1;
  }
}

// The execution log is available even when no exchange history exists for the symbol.
function executionTimeline(trade, reason, linkToReplay) {
  const block=node('section','','execution-timeline');
  const title=node('strong','Execution replay');
  const when=node('time'),value=node('b'),stage=node('span','','execution-stage');
  const detail=node('div','','execution-detail');detail.setAttribute('aria-live','polite');detail.append(stage,value,when);
  const controls=node('div','','execution-controls');
  const entry=button('Entry',()=>selectEvent(0)),exit=button('Exit',()=>selectEvent(1));
  const play=button('Play replay',()=>{
    selectEvent(0);
    play.disabled=true;
    timeout=setTimeout(()=>selectEvent(1),1100);
  });
  let timeout;
  function selectEvent(index) {
    clearTimeout(timeout);play.disabled=false;
    const price=index ? trade.exit : trade.entry;
    const at=new Date(index ? trade.closedAt : trade.openedAt);
    stage.textContent=index?'Position closed':'Position opened';
    value.textContent=Number.isFinite(price)?String(price):'Price unrecorded';
    when.dateTime=at.toISOString();when.textContent=new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'}).format(at)+' IST';
    entry.setAttribute('aria-pressed',String(!index));exit.setAttribute('aria-pressed',String(!!index));
  }
  controls.append(entry,exit,play);
  if(linkToReplay){const link=node('a','Open Replay →','execution-link');link.href='/replay?'+new URLSearchParams({tradeId:trade.id});controls.append(link);}
  selectEvent(Number(trade.entry==null && trade.exit!=null));
  block.append(title,detail,controls,node('small',reason || 'Showing recorded execution events.'));
  return block;
}

export function tradeChart(trade, request) {
  const chart=node('div','','trade-chart-block');
  const well=node('div','','trade-chart');
  const status=node('p',trade.closedAt?'Loading candles…':'');
  status.setAttribute('role','status');
  const canvas=node('canvas','','ws-chart');
  canvas.width=840;canvas.height=315;canvas.hidden=true;
  canvas.setAttribute('role','img');canvas.setAttribute('aria-label','Recorded candles for '+trade.symbol);
  well.append(canvas,status);
  chart.append(well);
  const prices=[['Entry',trade.entry,'--acc'],['Exit',trade.exit,'--mut'],['Stop',trade.stop,'--down'],['Target',trade.target,'--up']];
  const levels=prices.filter(([,value])=>Number.isFinite(value)).map(([label,value,color])=>({label,value,color}));
  function priceLevels() {
    if (!levels.length) return;
    const ordered=[...levels].sort((a,b)=>b.value-a.value);
    const min=ordered.at(-1).value, span=ordered[0].value-min;
    const plot=node('figure','','trade-price-levels');
    plot.append(node('figcaption','Recorded price levels'));
    for (const {label,value,color} of ordered) {
      const row=node('div');
      const axis=node('span','','price-level-axis');
      axis.style.setProperty('--position',(span ? 5+90*(value-min)/span : 50)+'%');
      axis.style.setProperty('--marker','var('+color+')');
      row.append(node('span',label),axis,node('strong',String(value)));
      plot.append(row);
    }
    well.prepend(plot);
  }
  if (!trade.closedAt) {
    priceLevels();
    status.textContent=levels.length?'Position open. Levels come from your trade log.':'No prices recorded for this open trade.';
  }
  if(trade.closedAt) void request('/api/workspace?'+new URLSearchParams({page:'replay',tradeId:trade.id}),'GET')
    .then(({candles,candleStatus,candleSource})=>{
      if(!well.isConnected)return;
      if(!candles?.length){
        status.replaceWith(executionTimeline(trade,candleStatus,true));
        return;
      }
      const active=new Set(levels.map(({label})=>label));
      const paint=()=>drawCandles(canvas,candles,candles.length-1,levels.filter(({label})=>active.has(label)));
      if(levels.length) {
        const controls=node('div','','ws-actions trade-chart-controls');
        controls.setAttribute('aria-label','Chart price levels');
        for(const {label} of levels) {
          const toggle=button(label,()=>{
            if(active.has(label))active.delete(label);
            else active.add(label);
            toggle.setAttribute('aria-pressed',String(active.has(label)));
            paint();
          });
          toggle.setAttribute('aria-pressed','true');
          controls.append(toggle);
        }
        chart.prepend(controls);
      }
      canvas.hidden=false;
      const replay=node('a','Play candle replay →','execution-link');
      replay.href='/replay?'+new URLSearchParams({tradeId:trade.id});
      status.replaceChildren(node('small',candleSource || 'Recorded candles'),replay);
      status.className='candle-caption';paint();
    }).catch(()=>{if(well.isConnected)status.replaceWith(executionTimeline(trade,'Candle lookup failed. Reopen the trade to retry.',true));});
  return chart;
}

export const replay={
  title:'Replay',description:'Step through a closed trade one candle at a time, with what you were thinking.',
  action:`<label class="replay-picker"><span class="ws-visually-hidden">Choose a closed trade</span><select class="n-out" data-replay-trade></select></label>`,
  content:`<div class="replay-layout">
    <div class="replay-column">
      <section class="n-out ws-card replay-main">
        <header class="replay-card-head"><div><h2 data-replay-name>Closed trade</h2><p data-replay-caption></p></div>
          <span class="n-in replay-pill" data-replay-closed hidden></span></header>
        <div class="n-in replay-chart-well">
          <canvas width="900" height="400" class="ws-chart" data-replay-chart role="img" aria-label="Trade candles" hidden></canvas>
          <p role="status" data-replay-status></p>
        </div>
        <div data-playback hidden>
          <div class="replay-transport"><button class="n-btn n-out" type="button" aria-label="Step back" data-prev-candle>‹</button>
            <button class="n-btn n-acc" type="button" data-play-candles>Play</button>
            <button class="n-btn n-out" type="button" aria-label="Step forward" data-next-candle>›</button>
            <div class="n-in replay-speed" aria-label="Playback speed"><button type="button" data-replay-speed="1">1×</button>
              <button type="button" data-replay-speed="2">2×</button><button type="button" data-replay-speed="4">4×</button></div>
          </div>
          <div class="replay-timeline"><div class="replay-ticks" aria-hidden="true" data-replay-ticks></div>
            <input data-replay-range type="range" min="0" value="0" aria-label="Replay position"></div>
          <div class="replay-timestamps" data-replay-timestamps></div><p class="replay-key-help" data-replay-position></p>
          <p class="replay-key-help">Use the arrow keys to step and Space to play or pause.</p>
        </div>
        <details class="ws-disclosure replay-upload" data-candle-upload hidden><summary>Add candle data</summary>
          <p>Upload OHLC data for this trade with a timezone on each timestamp.</p>
          <form class="ws-form" data-candle-form><label>Candle CSV<input type="file" name="file" accept=".csv,text/csv" required></label>
            <button class="n-btn n-out dash-button">Save candles</button></form><p role="status" data-candle-status></p></details>
      </section>
      <div class="replay-column" data-replay-annotations hidden>
        <section class="n-out ws-card"><h2>Rules at entry</h2><p>Checked the moment you went in.</p><div class="replay-rules" data-replay-rules></div></section>
        <section class="n-out ws-card"><h2>Lesson for next time</h2><p>One line goes back into the journal entry.</p><form class="ws-form" data-replay-lesson>
          <label><span class="ws-visually-hidden">Journal lesson</span><textarea class="n-in" name="lesson" maxlength="1000" rows="3" required></textarea></label>
          <div class="ws-actions"><button class="n-btn n-acc dash-button" value="lesson">Save to journal</button>
            <button class="n-btn n-out dash-button" value="rule">Turn into a rule</button></div></form><p role="status" data-lesson-status></p></section>
      </div>
    </div>
    <aside class="replay-column" data-replay-comparison hidden>
      <section class="n-out ws-card replay-result"><p data-replay-result-label>Closed result</p><strong data-replay-result></strong>
        <p data-replay-result-note></p><progress data-replay-progress max="1" value="0" aria-label="Replay progress"></progress></section>
      <section class="n-out ws-card"><h2>What if I had exited elsewhere?</h2><p>Compare other exits with the one you took.</p><div class="replay-column replay-exits" data-replay-exits></div></section>
      <section class="n-out ws-card"><h2>What I saw then</h2><p>Notes recorded for this trade.</p><div class="ws-stack" data-replay-notes></div></section>
    </aside>
  </div>`,
  async bind(page,{data,request,save}){
    const picker=select(page,'[data-replay-trade]');
    const status=select(page,'[data-replay-status]');
    const canvas=select(page,'[data-replay-chart]');
    const playback=select(page,'[data-playback]');
    const upload=select(page,'[data-candle-upload]');
    const annotations=select(page,'[data-replay-annotations]');
    const comparison=select(page,'[data-replay-comparison]');
    const range=select(page,'[data-replay-range]');
    const ticks=select(page,'[data-replay-ticks]');
    const times=select(page,'[data-replay-timestamps]');
    const speeds=[...page.querySelectorAll('[data-replay-speed]')];
    const lesson=select(page,'[data-replay-lesson]');
    const candleForm=select(page,'[data-candle-form]');
    const play=select(page,'[data-play-candles]');
    const previous=select(page,'[data-prev-candle]'),next=select(page,'[data-next-candle]');
    let active, candles=[],step=0,timer,version=0, chosenTrade, speed=1, selectedExit;
    const time=new Intl.DateTimeFormat('en-IN',{timeZone:'Asia/Kolkata',timeStyle:'short'});
    const requested = new URLSearchParams(location.search).get('tradeId');
    let linkedRecord;
    if(requested && /^[1-9]\d*$/.test(requested) && !data.trades.some(trade=>trade.id===requested)) {
      try {
        linkedRecord=await request('/api/workspace?'+new URLSearchParams({page:'replay',tradeId:requested}),'GET');
        data.trades=[linkedRecord,...data.trades];
      } catch(error) {
        status.textContent=error.message;
        if(error.status!==404)return;
      }
    }
    fillTradeOptions(picker,data.trades);
    if(data.trades.some(({id})=>id===requested))picker.value=requested;
    else if(data.trades.length)picker.value=data.trades[0].id;
    picker.disabled=!data.trades.length;
    function pause(){clearInterval(timer);timer=undefined;play.textContent='Play';}
    function resultPanel() {
      if(!chosenTrade)return;
      const before=Date.parse(candles[step]?.at)<Date.parse(chosenTrade.openedAt);
      const finished=Date.parse(candles[step]?.at)>=Date.parse(chosenTrade.closedAt);
      const liveResult=before?0:candles.length && !finished ? resultAt(candles[step].close) : chosenTrade.result;
      const value=selectedExit?.value ?? liveResult;
      const result=select(page,'[data-replay-result]');
      result.textContent=signedR(value);
      result.className=value>0?'is-win':value<0?'is-loss':'';
      select(page,'[data-replay-result-label]').textContent=selectedExit?'Selected exit':before?'Waiting for the setup':finished||!candles.length?'Closed result':'Replay position';
      select(page,'[data-replay-result-note]').textContent=selectedExit?.label ?? (before?'The trade has not opened yet.':candles.length&&!finished&&value===null?'Entry and stop are needed to calculate in-session R.':'Recorded in your trade journal.');
      select(page,'[data-replay-progress]').value=candles.length?(step+1)/candles.length:0;
    }
    function resultAt(price){
      const {entry,stop,side}=chosenTrade;
      if(entry===null||stop===null||entry===stop)return null;
      return (price-entry)*(side==='short'?-1:1)/Math.abs(entry-stop);
    }
    function renderExits(){
      const list=select(page,'[data-replay-exits]');
      const actual={label:'Your exit',value:chosenTrade.result,step:candles.findIndex((candle)=>Date.parse(candle.at)>=Date.parse(chosenTrade.closedAt))};
      const options=[actual];
      const candidates=candles.map((candle,index)=>({candle,index}))
        .filter(({candle})=>Date.parse(candle.at)>=Date.parse(chosenTrade.openedAt));
      if(chosenTrade.entry!==null && chosenTrade.stop!==null && chosenTrade.stop!==chosenTrade.entry&&candidates.length){
        const target=candidates.find(({candle})=>chosenTrade.target!==null && candle.low<=chosenTrade.target && candle.high>=chosenTrade.target);
        const earlier=candidates.find(({candle})=>Date.parse(candle.at)<Date.parse(chosenTrade.closedAt));
        if(earlier)options.push({label:'Earlier candle',value:resultAt(earlier.candle.close),step:earlier.index});
        if(target)options.push({label:'At the target',value:resultAt(chosenTrade.target),step:target.index});
        const peak=candidates.reduce((best,item)=>resultAt(item.candle.close)>resultAt(best.candle.close)?item:best);
        options.push({label:'Best close in supplied candles',value:resultAt(peak.candle.close),step:peak.index});
      }
      list.replaceChildren(...options.map((option)=>{
        const item=button(option.label,()=>{
          pause();selectedExit=option;
          if(candles.length)step=option.step<0?candles.length-1:option.step;
          list.querySelectorAll('button').forEach((control)=>control.setAttribute('aria-pressed',String(control===item)));
          frame();
        });
        item.append(node('span',signedR(option.value),option.value>=0?'is-win':'is-loss'));
        return item;
      }));
      if(options.length===1)list.append(node('p','Alternative exits use your recorded entry, stop and candle data.','dash-muted'));
    }
    function paintTimeline(){
      range.max=String(Math.max(0,candles.length-1));
      const count=Math.min(60,candles.length);
      ticks.replaceChildren(...Array.from({length:count},()=>node('span')));
      ticks.style.setProperty('--tick-count',String(count));
      const labels=[
        ['Open',candles[0]?.at],['Entry',chosenTrade.openedAt],['Close',chosenTrade.closedAt],
      ].filter(([,at])=>at);
      times.replaceChildren(...labels.map(([label,at])=>node('span',label+' '+time.format(new Date(at)))));
    }
    function frame(){
      playback.hidden=!candles.length;
      status.hidden=Boolean(candles.length);
      canvas.hidden=!candles.length;
      resultPanel();
      if(!candles.length)return;
      if(step===candles.length-1)pause();
      previous.disabled=step===0;next.disabled=step===candles.length-1;play.disabled=candles.length<2;
      range.value=String(step);
      [...ticks.children].forEach((tick,index)=>tick.classList.toggle('is-played',index<=Math.floor(step*(ticks.children.length-1)/Math.max(1,candles.length-1))));
      const levels=[['Entry',chosenTrade.entry,'--acc'],['Stop',chosenTrade.stop,'--down'],['Target',chosenTrade.target,'--up']]
        .filter(([,value])=>value!==null).map(([label,value,color])=>({label,value,color}));
      drawCandles(canvas,candles,step,levels);
      const {at,open,high,low,close}=candles[step];
      select(page,'[data-replay-position]').textContent=`${step+1} / ${candles.length} · ${time.format(new Date(at))} IST · O ${open} · H ${high} · L ${low} · C ${close}`;
    }
    async function load(){
      const current=++version;
      page.querySelector('.execution-timeline')?.remove();
      pause();candles=[];step=0;selectedExit=chosenTrade=undefined;frame();
      const trade=data.trades.find(({id})=>id===picker.value);
      active=undefined;upload.hidden=annotations.hidden=comparison.hidden=true;
      if(!trade){
        status.textContent='Your replay starts with a closed trade.';
        const link=node('a','Open trade journal','n-btn n-out dash-button');link.href='/journal';status.append(' ',link);
        comparison.hidden=false;
        select(page,'[data-replay-result]').textContent='—';
        select(page,'[data-replay-result-note]').textContent='The realized R from your selected trade appears here.';
        select(page,'[data-replay-notes]').textContent='Saved entry and review notes will appear alongside the replay.';
        return;
      }
      chosenTrade=trade;
      select(page,'[data-replay-name]').textContent=trade.symbol+', '+trade.side;
      select(page,'[data-replay-caption]').textContent=[trade.setup,formatDate(trade.closedAt)].filter(Boolean).join(' · ');
      const closed=select(page,'[data-replay-closed]');closed.hidden=false;closed.textContent='Closed '+signedR(trade.result);
      status.textContent='Loading trade…';
      try{
        const record=linkedRecord?.id===trade.id ? linkedRecord : await request('/api/workspace?'+new URLSearchParams({page:'replay',tradeId:trade.id}),'GET');
        linkedRecord=undefined;
        if(current!==version)return;
        active=trade.id;candles=record.candles;lesson.elements.lesson.value=record.lesson;
        const rules=select(page,'[data-replay-rules]');
        rules.replaceChildren(...record.rules.map((rule)=>{
          const item=node('div','','n-in replay-rule');
          item.append(node('span',rule.kept?'✓':'×',rule.kept?'is-kept':''),node('strong',rule.text));
          return item;
        }));
        if(!record.rules.length)rules.append(node('p','No rule checks were recorded for this trade.'));
        paginate(rules,'Entry rules',6,trade.id);
        status.textContent=candles.length ? (record.candleSource || 'Recorded candles') : '';
        if(!candles.length)status.after(executionTimeline(trade,record.candleStatus,false));
        const notes=select(page,'[data-replay-notes]');
        notes.replaceChildren(node('p',trade.note || 'No journal note was recorded for this trade.','n-in ws-list-card'));
        upload.hidden=annotations.hidden=comparison.hidden=false;
        paintTimeline();renderExits();frame();
      }catch(error){if(current===version){status.textContent=error.message;status.after(executionTimeline(trade,'Showing the executions saved in your journal.',false));}}
    }
    function move(delta){pause();selectedExit=undefined;step=Math.max(0,Math.min(candles.length-1,step+delta));frame();}
    function togglePlay(){
      if(timer){pause();return;}
      if(step===candles.length-1){step=0;frame();}
      selectedExit=undefined;
      timer=setInterval(()=>{step++;frame();},450/speed);play.textContent='Pause';
    }
    previous.addEventListener('click',()=>move(-1));next.addEventListener('click',()=>move(1));play.addEventListener('click',togglePlay);
    range.addEventListener('input',()=>{pause();selectedExit=undefined;step=Number(range.value);frame();});
    speeds.forEach((control)=>control.addEventListener('click',()=>{
      const wasPlaying=Boolean(timer);pause();speed=Number(control.dataset.replaySpeed);
      speeds.forEach((item)=>item.setAttribute('aria-pressed',String(item===control)));
      if(wasPlaying)togglePlay();
    }));
    speeds[0].setAttribute('aria-pressed','true');
    page.addEventListener('keydown',(event)=>{
      if(!candles.length || event.target.closest('input,select,textarea,button,a'))return;
      if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();move(event.key==='ArrowLeft'?-1:1);}
      if(event.key===' '){event.preventDefault();togglePlay();}
    });
    addEventListener('pagehide',pause);
    picker.addEventListener('change',load);
    candleForm.addEventListener('submit',(event)=>submit(event,select(page,'[data-candle-status]'),async({file})=>{
      if(file.size>110000)throw new Error('Select a CSV smaller than 110 KB.');
      const tradeId=active, incoming=parseCandles(await file.text());
      const record=await save({tradeId,candles:incoming});
      if(active===tradeId){pause();candles=record.candles;step=0;selectedExit=undefined;paintTimeline();renderExits();frame();status.textContent='';candleForm.reset();}
      return 'Candles saved.';
    }));
    lesson.addEventListener('submit',(event)=>{
      const rule=event.submitter?.value==='rule';
      return submit(event,select(page,'[data-lesson-status]'),async(values)=>{
        await save({tradeId:active,lesson:values.lesson,...(rule?{action:'rule'}:{})});
        if(!rule)select(page,'[data-replay-notes]').replaceChildren(node('p',values.lesson,'n-in ws-list-card'));
        return rule?'Added to your active rules.':'Lesson saved to the journal.';
      });
    });
    void load();
  }
};
