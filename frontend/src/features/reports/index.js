import {processingCard} from '../../components/billing-ready.js';
import {button,node,metric,drawLine} from '../../pages/workspace-ui.js';
import {fileAction} from '../../components/file-actions.js';
import {confirmationCard} from '../../components/confirmation-motion.js';
import {upgradeGate} from './upgrade.js';
import './reports.css';

const tabs={full:'Full report',patterns:'Patterns',plan:'Plan check',experiment:'Experiments',ask:'Ask your journal'};
export const reports={
  title:'Reports',description:'Review your trading process.',endpoint:'/api/reports',
  content:`<div class="ws-section-head"><div class="ws-actions" data-periods></div><button class="n-btn n-out dash-button" data-pdf>Export PDF</button></div>
    <div class="report-metrics" data-numbers></div><div><section class="n-out ws-card"><h2>Score trend</h2><canvas class="ws-chart" width="800" height="240" data-trend aria-label="Daily process score"></canvas><p data-trend-note></p><h3>Top mistakes</h3><div data-mistakes></div></section></div>
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
        const row=node('div');row.append(node('p',obs.text+' · '+obs.value));const refs=node('details');refs.append(node('summary','View cited trades ('+obs.trade_ids.length+')'));
        for(const id of obs.trade_ids){const a=node('a','Trade '+id);a.href='/journal?tradeId='+encodeURIComponent(id);refs.append(' ',a);}
        if(obs.trade_ids.length)row.append(refs);box.append(row);
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
    async function generate(kind,regenerate=false,question='',mistake=''){
      if(busy)return;
      busy=true;paint();
      try{
        const result=await request('/api/ai/report','POST',{period,kind,regenerate,question,mistake});
        await load();busy=false;paint();
        if(result.insufficient_data)review.append(node('p','Not enough trades yet. Log 10 trades across at least 3 journal days.'));
        else review.append(renderReport(result));
      }catch(err){busy=false;paint();fail(err);}
    }
    function paint(){
      el('periods').replaceChildren(...['week','month'].map(p=>{const b=button('This '+p,()=>load(p).catch(fail));b.disabled=busy;b.setAttribute('aria-pressed',String(p===period));return b;}));
      const n=data.numbers;
      el('numbers').replaceChildren(metric('Process score',n.score??'—',data.previous!=null&&n.score!=null?(n.score-data.previous>=0?'+':'')+(n.score-data.previous)+' vs last '+period:''),metric('Rules followed',n.adherence==null?'—':n.adherence+'%',n.checks?n.kept+' of '+n.checks+' checks':''),metric('Journal days / streak',n.days+' / '+data.streak));
      drawLine(el('trend'),data.trend.map(d=>d.score));el('trend-note').textContent=data.trend.length?data.trend.map(d=>d.day+' · '+d.score).join(' / '):'No scored trades in this period.';
      el('mistakes').replaceChildren(...data.mistakes.map(m=>node('p',m.kind+' · '+m.n)));
      if(!data.mistakes.length)el('mistakes').append(node('p','No recorded mistakes this period.'));
      el('ai-tabs').replaceChildren(...Object.entries(tabs).map(([key,label])=>{const b=button((!data.pro&&key!=='full'?'🔒 ':'')+label,()=>{tab=key;paint();});b.disabled=busy;b.setAttribute('aria-pressed',String(tab===key));return b;}));
      review.classList.remove('is-locked');review.replaceChildren();
      if(busy){const p=node('p','Reading your trade checks and journal days…','report-generating');p.setAttribute('role','status');review.append(p);}
      else if(!data.enabled){const a=node('a','Open Settings','n-btn n-out dash-button');a.href='/settings#privacy';review.append(node('p','AI features are off'),a);}
      else if(!data.pro){
        const gate=node('div','','report-gate n-out');review.classList.add('is-locked');
        if(tab==='full'){const preview=node('div','What went well · Rule breaks · Patterns · One experiment','report-preview');preview.setAttribute('aria-hidden','true');review.append(preview);}
        review.append(gate);gate.append(node('h3','Full AI review, patterns and more'),node('p','Free includes one short AI summary a week.'),button('See Pro',()=>upgradeGate('aiReview',request)));
        if(tab==='full')gate.append(button('Read weekly summary',()=>generate('summary')));
      }else if(data.remaining===0)review.append(node('p','Monthly AI review limit reached. Your past reviews are available below.'));
      else if(n.trades<10||n.days<3)review.append(node('p','Not enough trades yet. Log 10 trades across at least 3 journal days.'));
      else{
        const q=node('select');for(const question of ['How consistently did I follow my rules?','How many trades broke a rule?','How often did I journal?','What was my process score?'])q.append(new Option(question,question));q.setAttribute('aria-label','Question for your journal');
        if(tab==='ask')review.append(q);
        const habit=node('select');habit.setAttribute('aria-label','Recurring mistake to work on');
        if(tab==='experiment'){for(const m of data.mistakes.filter(m=>m.n>=2))habit.append(new Option(m.kind,m.kind));if(habit.length)review.append(habit);}
        if(tab==='plan'){const a=node('a','Edit tomorrow’s plan','n-btn n-out dash-button');a.href='/plan?day=tomorrow';review.append(a);}
        review.append(button(tab==='ask'?'Ask':'Generate '+tabs[tab].toLowerCase(),()=>generate(tab,false,q.value,habit.value)));
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
    const order=new URLSearchParams(location.search).get('checkout');
    if(new URLSearchParams(location.search).get('welcome')==='pro'&&data.pro&&data.enabled){history.replaceState(history.state,'','/reports');await generate('full');}
    if(order){
      const message=processingCard();message.setAttribute('role','status');review.prepend(message);
      try{
        for(let attempt=0;attempt<40&&page.isConnected;attempt++){
          const status=await request('/api/billing/status?id='+encodeURIComponent(order),'GET');
          if(['underpaid','expired','failed'].includes(status.payment_state)){
            message.textContent=status.payment_state==='underpaid'?'Payment is short. Open your hosted invoice to check the remaining amount.':'Checkout '+status.payment_state+'. Open See Pro to start a new checkout.';return;
          }
          if(status.confirmed){
            history.replaceState(history.state,'','/reports');await load();
            page.querySelector('.report-ai').before(confirmationCard('payment','Your Pro access is ready.'));
            if(data.pro&&data.enabled)await generate('full');return;
          }
          await new Promise(resolve=>setTimeout(resolve,3000));
        }
        message.textContent='Payment confirmation is pending. Reopen this page to check again.';
      }catch(err){message.textContent=err.message;}
    }
  }
};
