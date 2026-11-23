import {node,button,number,formatDate} from './workspace-ui.js';
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

function executionSummary(trade, reason, linkToReplay,request) {
  const block=node('section','','execution-timeline');
  block.append(node('strong','Recorded executions'));
  const format=new Intl.DateTimeFormat('en-IN',{dateStyle:'medium',timeStyle:'short',timeZone:'Asia/Kolkata'});
  for(const [stage,price,at] of [['Entry',trade.entry,trade.openedAt],['Exit',trade.exit,trade.closedAt]]) {
    const detail=node('div','','execution-detail');
    const time=node('time',format.format(new Date(at))+' IST');time.dateTime=new Date(at).toISOString();
    detail.append(node('span',stage,'execution-stage'),time);
    if(Number.isFinite(price))detail.append(node('b',String(price)));
    else {
      const edit=document.createElement('details');
      const prompt=node('summary','Add '+stage.toLowerCase()+' price');
      const form=node('form','','execution-price-form');
      const input=node('input');input.type='number';input.name='price';input.min='0.00000001';input.step='any';input.required=true;
      input.placeholder='Execution price';input.setAttribute('aria-label',stage+' execution price');
      const save=node('button','Save','btn btn-primary'),status=node('small');status.setAttribute('role','status');
      form.append(input,save,status);
      form.onsubmit=event=>submit(event,status,async({price})=>{
        const field=stage.toLowerCase();
        const saved=await request('/api/workspace?page=replay','POST',{action:'fill-price',tradeId:trade.id,field,price:Number(price)});
        trade[field]=saved[field];edit.replaceWith(node('b',String(saved[field])));
        return 'Price saved.';
      });
      edit.append(prompt,form);detail.append(edit);
    }
    block.append(detail);
  }
  block.append(node('small',reason || 'No historical candles are available for this trade.'));

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
        status.replaceWith(executionSummary(trade,candleStatus,true,request));
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
      status.replaceChildren(node('small',candleSource || 'Recorded candles'));
      status.className='candle-caption';paint();
    }).catch(()=>{if(well.isConnected)status.replaceWith(executionSummary(trade,'Candle lookup failed. Reopen the trade to retry.',true,request));});
  return chart;
}
