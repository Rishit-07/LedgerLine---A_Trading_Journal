import {button,node,metric,drawLine} from '../../pages/workspace-ui.js';
import {fileAction} from '../../components/file-actions.js';
import './reports.css';

const tabs={full:'Full report',patterns:'Patterns',plan:'Plan check',experiment:'Experiments',ask:'Ask your journal'};
export const reports={
  title:'Reports',description:'Review your trading process.',endpoint:'/api/reports',
  content:`<div class="ws-section-head"><div class="ws-actions" data-periods></div><button class="n-btn n-out dash-button" data-pdf>Export PDF</button></div>
    <div class="ws-metric-grid" data-numbers></div><div class="ws-columns"><section class="n-out ws-card"><h2>Score trend</h2><canvas class="ws-chart" width="800" height="240" data-trend aria-label="Daily process score"></canvas><p data-trend-note></p></section>
    <section class="n-out ws-card"><h2>Top mistakes</h2><div data-mistakes></div></section></div>
    <section class="n-out ws-card report-ai"><h2>AI review</h2><div class="ws-actions" data-ai-tabs></div><div class="ws-stack" data-review></div></section>
    <section class="n-out ws-card"><h2>Past reviews</h2><div class="ws-stack" data-past></div></section>`,
  async bind(page,{data,request}){
    let period='week',tab='full',version=0,busy=false;
    const el=k=>page.querySelector('[data-'+k+']'),review=el('review');
    fileAction(el('pdf'));el('pdf').onclick=()=>window.print();
    function renderReport(record){
      const box=node('article','','n-in ws-list-card');
      box.append(node('small','AI-written, can be wrong'),node('h3',record.output.summary));
      for(const obs of record.output.observations){
        const row=node('p',obs.text+' · '+obs.value);
        for(const id of obs.trade_ids){const a=node('a','Trade '+id);a.href='/journal?tradeId='+encodeURIComponent(id);row.append(' ',a);}
        box.append(row);
      }
      box.append(node('p',record.output.focus));return box;
    }
    async function load(next=period){
      const seq=++version;
      const fresh=await request('/api/reports?period='+next,'GET');
      if(seq!==version)return;
      data=fresh;period=next;paint();
    }
    function fail(err){review.append(node('p',err.message));}
    async function generate(kind,regenerate=false,question=''){
      if(busy)return;
      busy=true;paint();
      try{
        const result=await request('/api/ai/report','POST',{period,kind,regenerate,question});
        await load();busy=false;paint();
        if(result.insufficient_data)review.append(node('p','Not enough trades yet. Log 10 trades across at least 3 journal days.'));
        else review.append(renderReport(result));
      }catch(err){busy=false;paint();fail(err);}
    }
    function paint(){
      el('periods').replaceChildren(...['week','month'].map(p=>{const b=button('This '+p,()=>load(p).catch(fail));b.disabled=busy;b.setAttribute('aria-pressed',String(p===period));return b;}));
      const n=data.numbers;
      el('numbers').replaceChildren(metric('Process score',n.score??'—'),metric('Rules followed',n.adherence==null?'—':n.adherence+'%'),metric('Journal days',n.days),metric('Streak',data.streak+' days'));
      drawLine(el('trend'),data.trend.map(d=>d.score));el('trend-note').textContent=data.trend.length?data.trend.map(d=>d.day+' · '+d.score).join(' / '):'No scored trades in this period.';
      el('mistakes').replaceChildren(...data.mistakes.map(m=>node('p',m.kind+' · '+m.n)));
      if(!data.mistakes.length)el('mistakes').append(node('p','No recorded mistakes this period.'));
      el('ai-tabs').replaceChildren(...Object.entries(tabs).map(([key,label])=>{const b=button((!data.pro&&key!=='full'?'🔒 ':'')+label,()=>{tab=key;paint();});b.disabled=busy;b.setAttribute('aria-pressed',String(tab===key));return b;}));
      review.replaceChildren();
      if(busy){const p=node('p','Reading your trade checks and journal days…','report-generating');p.setAttribute('role','status');review.append(p);}
      else if(!data.enabled){const a=node('a','Open Settings','n-btn n-out dash-button');a.href='/settings#privacy';review.append(node('p','AI features are off'),a);}
      else if(!data.pro){
        if(tab==='full'){const preview=node('div','What went well · Rule breaks · Patterns · One experiment','report-preview');preview.setAttribute('aria-hidden','true');review.append(preview);}
        review.append(button('See Pro',async()=>{const {upgradeGate}=await import('./upgrade.js');upgradeGate('aiReview',request);}));
        if(tab==='full')review.append(button('Read weekly summary',()=>generate('summary')));
      }else if(data.remaining===0)review.append(node('p','Monthly AI review limit reached. Your past reviews are available below.'));
      else if(n.trades<10||n.days<3)review.append(node('p','Not enough trades yet. Log 10 trades across at least 3 journal days.'));
      else{
        const q=node('input');q.maxLength=300;q.placeholder='Ask about your trading process';q.setAttribute('aria-label','Question for your journal');
        if(tab==='ask')review.append(q);
        review.append(button(tab==='ask'?'Ask':'Generate '+tabs[tab].toLowerCase(),()=>generate(tab,false,q.value)));
      }
      el('past').replaceChildren(...data.past.map(r=>{
        const d=node('details');d.append(node('summary',(tabs[r.kind]??'Weekly summary')+' · '+r.period+' · '+new Date(r.created_at).toLocaleDateString()),renderReport(r));
        if(data.enabled&&(data.pro||r.kind==='summary')&&r.period===period&&r.kind!=='ask')d.append(button('Regenerate',()=>generate(r.kind,true)));
        d.append(button('Delete',async()=>{if(!confirm('Delete this review?'))return;try{await request('/api/ai/report','DELETE',{id:r.id});await load();}catch(err){fail(err);}}));return d;
      }));
      if(!data.past.length)el('past').append(node('p','Your saved reviews will appear here.'));
      for(const x of data.experiments??[])el('past').append(node('p',x.kind+' · Seven-day experiment · '+x.baseline+' before / '+x.current+' during · '+x.status));
    }
    paint();
    if(new URLSearchParams(location.search).has('checkout')){
      const {confirmCheckout}=await import('./upgrade.js');
      await confirmCheckout(review,request,async()=>{await load();await generate('full');});
    }
  }
};
