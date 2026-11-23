import {fileCard,fileAction,startedDownload} from '../components/file-actions.js';
import { paginate } from './pagination.js';
import { node, select, button, stat, metric, message, number, formatDate, signedR, rate, markets, fillTradeOptions, submit, closedSummary, drawLine } from './workspace-ui.js';
import { readTradeCsv } from './trade-csv.js';
import { tradeChart } from './history-chart.js';
import { tradeScreenshots } from '../components/trade-screenshots.js';
import { openCloseTrade } from './close-trade.js';

const sessionDate = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Kolkata',dateStyle:'short'});

function groupSetups(closed) {
  const groups = new Map();
  for (const trade of closed) {
    const key = trade.setup || 'No setup recorded';
    const group = groups.get(key) ?? { count:0,total:0 };
    group.count++; group.total += trade.result; groups.set(key,group);
  }
  return [...groups].sort((a,b) => b[1].total/b[1].count - a[1].total/a[1].count);
}
function setups(list, trades) {
  const groups = groupSetups(trades);
  list.replaceChildren(...groups.map(([label,value]) => stat(label,signedR(value.total/value.count),value.count + ' closed')));
  if (!groups.length) list.append(message('Close trades to compare setups.'));
}
const log = '<a class="btn btn-primary" href="/dashboard#log-trade">Log a trade</a>';
const tradeOptions = Object.entries(markets).map(([value,name]) => `<option value="${value}">${name}</option>`).join('');
export const history = {
  title:'Trade history', description:'Every trade you have logged. Filter it, chart it, and open any one to review.', action:log,
  content:`<div class="ws-metric-grid ws-history-metrics" data-history-metrics></div><div class="ws-columns ws-wide-left">
    <section class="n-out ws-card"><div class="ws-section-head"><h2>Equity curve in R</h2><strong class="n-in history-total" data-history-total hidden></strong></div>
      <p>Cumulative R for trades matching your filters</p><canvas class="ws-chart history-chart" width="850" height="330" data-history-chart role="img" aria-label="Cumulative trading results in R"></canvas><p class="ws-empty" data-curve-empty></p></section>
    <section class="n-out ws-card"><h2>Average R by setup</h2><p>Which of your setups actually pays</p><div class="ws-stack" data-history-setups></div></section>
  </div>
  <section class="n-out ws-card history-filter-bar" aria-label="Filter trades">
    <div class="ws-filter-grid"><label>Search<input data-history-search type="search" placeholder="Symbol or setup"></label>
      <label>Market<select data-history-market><option value="">All markets</option>${tradeOptions}</select></label></div>
    <div class="ws-actions ws-history-filters" aria-label="Trade result">
      <button class="btn btn-secondary" type="button" data-history-result="all">All</button>
      <button class="btn btn-secondary" type="button" data-history-result="wins">Wins</button>
      <button class="btn btn-secondary" type="button" data-history-result="losses">Losses</button>
      <button class="btn btn-secondary" type="button" data-history-result="open">Open</button></div>
  </section>
  <section class="n-out ws-card history-review" data-history-detail aria-label="Selected trade"><div data-detail-trade></div></section>
  <section class="n-out ws-card"><div class="ws-section-head"><h2>All trades</h2><div class="ws-actions"><button class="btn btn-secondary" type="button" data-trades-import>Import CSV</button><button class="btn btn-secondary" type="button" data-trades-export>Export CSV</button></div></div>
    <p class="ws-empty" data-trade-empty></p>
    <div class="ws-table-wrap"><table class="history-trades" data-trade-table><thead><tr><th>Date</th><th>Symbol</th><th>Setup</th><th>Result</th><th>Rules kept</th><th>Review</th></tr></thead><tbody></tbody></table></div>
    <div class="ws-actions" data-history-pager></div>
  </section>
  <dialog class="n-out dash-dialog" data-import-dialog aria-labelledby="ws-import-title">
    <div class="dash-dialog-header"><h2 id="ws-import-title">Import CSV</h2><form method="dialog"><button class="btn btn-secondary" aria-label="Close import">×</button></form></div>
    <p class="dash-muted">Import up to 100 trades from the last 48 hours using the Ledgerline export columns. A blank Result R keeps a position open.</p>
    <form class="ws-form" data-import-form><label>Trade CSV<input name="file" type="file" accept=".csv,text/csv" required></label>
      <button class="btn btn-primary">Import trades</button></form><p role="status" data-import-status></p>
  </dialog>`,
  bind(page,{data,request,reload}) {
    const market = select(page,'[data-history-market]');
    const filters = [...page.querySelectorAll('[data-history-result]')];
    const search = select(page,'[data-history-search]');
    const body = select(page,'tbody');
    const empty = select(page,'[data-trade-empty]');
    const table = select(page,'[data-trade-table]');
    const chart = select(page,'[data-history-chart]');
    const curveEmpty = select(page,'[data-curve-empty]');
    const pager = select(page,'[data-history-pager]');
    const reviewPanel = select(page,'[data-history-detail]');
    const detail = select(page,'[data-detail-trade]');
    const exportButton = select(page,'[data-trades-export]');
    const selectedMarkets = data.account.markets;
    if (selectedMarkets.length === 1) market.value = selectedMarkets[0];
    else if (selectedMarkets.length > 1) {
      market.add(new Option('My markets','preferred'),0);
      market.value='preferred';
    }
    const requested = new URLSearchParams(location.search).get('tradeId');
    if (requested && data.trades.some((trade)=>trade.id===requested)) market.value='';
    let current = [], position = 0, resultFilter = 'all', selected, selectedId=requested;
    function review(trade) {
      selected=trade;selectedId=trade?.id;
      for(const item of body.querySelectorAll('[data-review-id]')) item.setAttribute('aria-pressed',String(item.dataset.reviewId===selectedId));
      if(!trade){detail.replaceChildren(node('h2','Trade review'),message('Select a trade to review it.'));return;}
      const chartColumn=node('div','','history-review-chart');
      const heading=node('header','','ws-section-head');
      const caption=node('div');
      caption.append(node('h2',trade.symbol),node('p',[markets[trade.market],trade.side,trade.setup,formatDate(trade.openedAt)].filter(Boolean).join(' · ')));
      heading.append(caption,node('strong',trade.result===null?'Open':signedR(trade.result),'n-in history-total '+(trade.result>0?'is-win':trade.result<0?'is-loss':'')));
      chartColumn.append(heading,tradeScreenshots(trade,request),tradeChart(trade,request));
      const rail=node('aside','','history-review-rail');
      const metrics=node('div','','trade-detail-metrics');
      metrics.append(...[['Side',trade.side],['Result',trade.result===null?'Open':signedR(trade.result)],
        ['Entry',trade.entry],['Exit',trade.exit],['Stop',trade.stop],['Target',trade.target]]
        .map(([label,value])=>stat(label,typeof value==='number'?number.format(value):value??'—')));
      rail.append(metrics,node('h3','Rules followed'));
      if(trade.checks){
        const progress=node('progress');progress.max=trade.checks;progress.value=trade.kept;
        progress.setAttribute('aria-label','Rules followed');
        rail.append(progress,node('small',trade.kept+' of '+trade.checks));
      }else rail.append(node('p','No rules recorded.','dash-muted'));
      rail.append(node('h3','Trade note'),node('p',trade.note || 'No journal note for this trade.','n-in ws-list-card'));
      const links = node('div','','ws-actions');
      if (!trade.closedAt) links.append(button('Close trade',()=>openCloseTrade(page,trade,request,async()=>{
        Object.assign(data,await reload());paint();
      })));
      const journal = node('a','Open journal','btn btn-primary');
      journal.href='/journal?'+new URLSearchParams({tradeId:trade.id});links.append(journal);
      if (trade.closedAt) {
      }
      if (!trade.reviewed) links.append(button('Mark reviewed',async (event) => {
        const target = event.currentTarget; target.disabled=true;
        try { await request('/api/streak/review','POST',{tradeId:trade.id}); trade.reviewed=true; target.remove(); }
        catch (error) { links.append(node('p',error.message)); target.disabled=false; }
      }));
      rail.append(links);detail.replaceChildren(chartColumn,rail);
    }
    function paint() {
      const term = search.value.toLowerCase().trim();
      current = data.trades.filter((trade) => (!market.value || (market.value==='preferred' ? selectedMarkets.includes(trade.market) : trade.market===market.value)) &&
        (!term || (trade.symbol+' '+(trade.setup??'')).toLowerCase().includes(term)) &&
        ({ all:true,wins:trade.result>0,losses:trade.result<0,open:trade.result===null })[resultFilter]);
      filters.forEach((item)=>item.setAttribute('aria-pressed',String(item.dataset.historyResult===resultFilter)));
      table.hidden = !current.length;
      empty.textContent = !current.length ? 'No trades match these filters.' : data.hasOlder ? 'Showing matches from your latest 500 trades.' : '';
      exportButton.disabled = !current.length;
      body.replaceChildren(...current.slice(position*10,position*10+10).map((trade) => {
        const row = node('tr');
        const identity=node('td');
        identity.append(node('span',trade.side,'history-side '+(trade.side==='short'?'is-short':'')),node('strong',trade.symbol));
        const rules=node('td');
        if(trade.checks){
          const meter=node('progress');
          meter.max=trade.checks;meter.value=trade.kept;meter.setAttribute('aria-label',trade.kept+' of '+trade.checks+' rules kept');
          meter.className=trade.kept<trade.checks?'is-loss':'is-win';
          rules.append(meter,node('small',trade.kept+'/'+trade.checks));
        }else rules.textContent='—';
        row.append(node('td',formatDate(trade.openedAt)),identity,node('td',trade.setup||'—'),
          node('td',trade.result===null?'Open':signedR(trade.result),trade.result>0?'is-win':trade.result<0?'is-loss':''),rules);
        const action=node('td');
        const open=button('Review',() => {review(trade);reviewPanel.scrollIntoView({block:'nearest'});});
        open.dataset.reviewId=trade.id;open.setAttribute('aria-pressed',String(trade.id===selectedId));
        action.append(open);row.append(action);return row;
      }));
      const nextSelection=current.find((trade)=>trade.id===selectedId)??current[0];
      if (selected!==nextSelection || !detail.childElementCount) review(nextSelection);
      const total=Math.ceil(current.length/10);
      const previous=button('Previous',() => {position--;paint();}); previous.disabled=position===0;
      const next=button('Next',() => {position++;paint();}); next.disabled=position>=total-1;
      pager.replaceChildren(previous,node('span',`Page ${position+1} of ${total}`),next); pager.hidden=total<2;
      const closed = current.filter(({result}) => result!==null).sort((a,b) => a.closedAt.localeCompare(b.closedAt));
      const {sum,winRate,average}=closedSummary(current);
      const winners=closed.filter(({result})=>result>0),losers=closed.filter(({result})=>result<0);
      const grossWins=winners.reduce((total,{result})=>total+result,0);
      const grossLoss=-losers.reduce((total,{result})=>total+result,0);
      const color=(value)=>value>0?'is-win':value<0?'is-loss':'';
      select(page,'[data-history-metrics]').replaceChildren(
        metric('Trades',String(current.length),current.filter(({closedAt})=>!closedAt).length+' open'),
        metric('Win rate',rate(winRate),winners.length+' wins · '+losers.length+' losses'),
        metric('Average R',signedR(average),'Expectancy per closed trade',color(average)),
        metric('Net R',signedR(sum),winners.length?'Best trade '+signedR(Math.max(...winners.map(({result})=>result))):'',color(sum)),
        metric('Profit factor',grossLoss?number.format(grossWins/grossLoss):'—','Gross wins over gross losses'));
      const totalLabel=select(page,'[data-history-total]');
      totalLabel.hidden=sum===null;totalLabel.textContent=signedR(sum);
      let equity=0, peak=0, drawdown=0;
      const points=closed.map(({result}) => {equity+=result; peak=Math.max(peak,equity); drawdown=Math.min(drawdown,equity-peak); return equity;});
      drawLine(chart,points.length?[0,...points]:[],{dark:true});
      curveEmpty.textContent=points.length?'Worst drawdown '+signedR(drawdown):'Close a trade to draw your equity curve.';
      const groups=groupSetups(closed), setupList=select(page,'[data-history-setups]');
      const max=Math.max(1,...groups.map(([,value])=>Math.abs(value.total/value.count)));
      setupList.replaceChildren(...groups.map(([label,value])=>{
        const average=value.total/value.count;
        const row=node('div','','history-setup-row');
        const name=node('div');name.append(node('strong',label),node('small',value.count+' trades'));
        const progress=node('progress');progress.max=max;progress.value=Math.abs(average);
        progress.setAttribute('aria-label',label+' average '+signedR(average));
        progress.className=color(average);
        row.append(name,progress,node('strong',signedR(average),color(average)));
        return row;
      }));
      paginate(setupList,'History setups',6,resultFilter+market.value+term);
      if(!groups.length)setupList.append(message('Close trades to compare setups.'));
    }
    for(const control of [market,search]) control.addEventListener('input',() => {position=0;paint();});
    for(const control of filters)control.addEventListener('click',()=>{resultFilter=control.dataset.historyResult;position=0;paint();});
    const importDialog=select(page,'[data-import-dialog]');
    const importForm=select(page,'[data-import-form]');
    const importProgress=fileCard(importForm,{label:'Upload trade history',maxBytes:120000});
    fileAction(exportButton);
    select(page,'[data-trades-import]').addEventListener('click',()=>importDialog.showModal());
    if(location.hash==='#import') importDialog.showModal();
    importForm.addEventListener('submit',(event)=>submit(event,select(page,'[data-import-status]'),async({file})=>{
      const records=await readTradeCsv(file);
      let done=0;
      try{
        importProgress(0,records.length);
        for(const trade of records){await request('/api/trades','POST',trade);importProgress(++done,records.length);}
      }catch(error){
        if(done){Object.assign(data,await reload());position=0;paint();}
        throw new Error(`${done} of ${records.length} trades imported. ${error.message} You can retry the same file.`);
      }
      Object.assign(data,await reload());position=0;paint();importForm.reset();
      return `${done} ${done===1?'trade':'trades'} imported.`;
    }));
    exportButton.addEventListener('click',() => {
      const escape=(value) => {
        const raw=String(value??'');
        const protectedValue=typeof value==='string' && /^[=+\-@\t\r]/.test(raw) ? "'"+raw : raw;
        return '"'+protectedValue.replaceAll('"','""')+'"';
      };
      const csv=[['Date','Symbol','Market','Side','Setup','Result R'],...current.map((t)=>[t.openedAt,t.symbol,t.market,t.side,t.setup,t.result])]
        .map((row)=>row.map(escape).join(',')).join('\r\n');
      const url=URL.createObjectURL(new Blob([csv],{type:'text/csv;charset=utf-8'}));
      const link=node('a'); link.href=url; link.download='ledgerline-trade-history.csv'; link.click(); startedDownload(exportButton);
      setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    paint();
    if(location.hash==='#export') exportButton.click();
  }
};

export const mistake = {
  title:'Mistake lab',description:'Which habits cost you R, how often they happen, and the one fix to work on.',
  content:`<div class="ws-metric-grid" data-mistake-stats></div><div class="ws-columns">
    <section class="n-out ws-card"><h2>What your mistakes cost</h2><p>Select a habit to review its trades over the last 90 days.</p><div class="ws-stack" data-mistake-groups></div></section>
    <div class="learn-column"><section class="n-out ws-card"><small>Selected habit</small><h2 data-habit-title></h2>
      <p data-habit-caption></p><div class="habit-weeks" data-habit-weeks></div><div class="ws-stack" data-habit-trades></div></section>
    <section class="n-out ws-card"><h2>Tag a trade</h2>
      <form class="ws-form" data-mistake-form><label>Closed trade<select name="tradeId" required></select></label>
      <label>Habit<input name="kind" list="mistake-labels" maxlength="50" required></label><datalist id="mistake-labels"><option value="Moved stop"><option value="Chased entry"><option value="Oversized"><option value="Early exit"></datalist>
      <label>Review note<textarea name="note" maxlength="500" rows="3"></textarea></label><button class="btn btn-primary">Save tag</button></form>
      <p role="status" data-mistake-status></p></section></div></div>`,
  bind(page,{data,save}) {
    const form=select(page,'[data-mistake-form]');
    const closed=data.trades.filter((trade)=>trade.closedAt);
    const trades=new Map(closed.map((trade)=>[trade.id,trade]));
    fillTradeOptions(form.elements.tradeId,closed);
    if (!closed.length) {form.hidden=true; select(page,'[data-mistake-status]').textContent='Log a closed trade to start tagging mistakes.';}
    let entries=data.mistakes, selectedHabit;
    function paint() {
      const windowStart = new Date(Date.parse(data.today)-89*86400000).toISOString().slice(0,10);
      const recent=closed.filter((trade)=>sessionDate.format(new Date(trade.closedAt))>=windowStart);
      const tags=new Set(entries.map((entry)=>entry.tradeId));
      const flagged=closedSummary(recent.filter((trade)=>tags.has(trade.id)));
      const clean=closedSummary(recent.filter((trade)=>!tags.has(trade.id)));
      let streak=0;
      for (const trade of recent) { if(tags.has(trade.id)) break; streak++; }
      select(page,'[data-mistake-stats]').replaceChildren(metric('Flagged trade result',signedR(flagged.sum),'Last 90 days',flagged.sum<0?'is-loss':''),
        metric('Clean trades',signedR(clean.average),clean.closed.length+' trades'),metric('Flagged average',signedR(flagged.average),flagged.closed.length+' trades'),
        metric('Clean streak',String(streak),'Since the last flagged trade'));
      const groups=new Map();
      for(const entry of entries) {
        const trade=trades.get(entry.tradeId);
        if(!trade || sessionDate.format(new Date(trade.closedAt))<windowStart) continue;
        const group=groups.get(entry.kind)??[];
        group.push({entry,trade}); groups.set(entry.kind,group);
      }
      const list=select(page,'[data-mistake-groups]');
      const ranked=[...groups].map(([kind,rows])=>({kind,rows,sum:rows.reduce((total,row)=>total+row.trade.result,0)}))
        .sort((a,b)=>a.sum-b.sum);
      if(!groups.has(selectedHabit)) selectedHabit=ranked[0]?.kind;
      const scale=Math.max(1,...ranked.map(({sum})=>Math.abs(sum)));
      list.replaceChildren(...ranked.map(({kind,rows,sum})=>{
        const choice=button('',()=>{selectedHabit=kind;paint();list.querySelector('[aria-pressed=true]')?.focus({preventScroll:true});});
        choice.className='n-in habit-choice';
        choice.setAttribute('aria-pressed',String(kind===selectedHabit));
        const bar=node('progress');bar.max=scale;bar.value=Math.abs(sum);bar.setAttribute('aria-label',signedR(sum));
        choice.append(node('strong',kind),node('span',signedR(sum),sum<0?'is-loss':'is-win'),bar,node('small',rows.length+' trades'));
        return choice;
      }));
      paginate(list,'Tagged habits',5);
      const examples=groups.get(selectedHabit)??[];
      select(page,'[data-habit-title]').textContent=selectedHabit??'No habit selected';
      select(page,'[data-habit-caption]').textContent=examples.length?'Occurrences per week · last eight weeks':'Tag a closed trade to see its pattern.';
      const weeks=Array(8).fill(0);
      for(const {trade} of examples){
        const age=Math.floor((Date.parse(data.today)-Date.parse(sessionDate.format(new Date(trade.closedAt))))/86400000);
        if(age>=0 && age<56)weeks[7-Math.floor(age/7)]++;
      }
      const chart=select(page,'[data-habit-weeks]');
      chart.hidden=!examples.length;
      chart.replaceChildren(...weeks.map((count,index)=>{
        const col=node('div');col.title=(index===7?'Last seven days':(7-index)+' weeks ago')+' · '+count+' occurrences';
        const bar=node('i');bar.style.height=Math.max(2,75*count/Math.max(1,...weeks))+'px';
        col.append(node('small',String(count)),bar);return col;
      }));
      const detail=select(page,'[data-habit-trades]');
      detail.replaceChildren(...examples.map(({entry,trade})=>{
        const link=node('a','','n-in ws-list-card');link.href='/history?tradeId='+encodeURIComponent(trade.id);
        link.append(node('strong',trade.symbol+' · '+signedR(trade.result)),node('small',entry.note||formatDate(trade.closedAt)));return link;
      }));
      paginate(detail,'Tagged trades',4,selectedHabit);
      if(!groups.size) list.append(message('No tagged trades in this window.'));
    }
    form.addEventListener('submit',(event)=>submit(event,select(page,'[data-mistake-status]'),async(values)=>{
      const saved=await save(values); entries=[saved,...entries.filter((item)=>item.tradeId!==saved.tradeId || item.kind!==saved.kind)];
      form.reset(); paint(); return 'Mistake tag saved.';
    }));
    paint();
  }
};
