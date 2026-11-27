import './panel.css';

const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const btn=(text,cls,onclick)=>{const b=el('button',text,'btn '+cls);b.type='button';b.onclick=onclick;return b;};

export const metatraderMarkup='<p>Bring your MetaTrader 4 or 5 trades into the journal. Ledgerline only ever reads closed trades. It never places or changes an order, and it never asks for a broker password.</p><div data-mt></div>';

export function bindMetaTrader(root,request){
  const host=root.querySelector('[data-mt]');
  let state=null,secret='';
  const apiUrl=(import.meta.env?.VITE_API_URL||location.origin).replace(/\/$/,'')+'/api/metatrader/ingest';

  async function load(){
    try{state=await request('/api/metatrader','GET');}catch(e){host.replaceChildren(el('p',e.message,'mt-note'));return;}
    paint();
  }
  const note=(p,text)=>{p.textContent=text;};

  function importCard(){
    const card=el('section',undefined,'n-out mt-card'),meter=el('p',undefined,'mt-meter');
    card.append(el('h3','Import a report'));
    card.append(el('p','In MetaTrader open History (MT5) or Account History (MT4), right-click, choose a report, and save it as HTML or CSV. Trades need a stop loss so R can be worked out. Times are read as your platform’s server time.'));
    if(state.limit!==null){
      meter.textContent=`${state.used} of ${state.limit} free imports used this month`;
      const bar=el('span',undefined,'mt-bar'),fill=el('i');fill.style.width=Math.min(100,state.used/state.limit*100)+'%';bar.append(fill);card.append(meter,bar);
    }else card.append(el('p','No monthly limit on your plan.','mt-meter'));
    const file=el('input');file.type='file';file.accept='.html,.htm,.csv,.txt';file.className='n-in';file.setAttribute('aria-label','MetaTrader report file');
    const out=el('p',undefined,'mt-result');out.setAttribute('role','status');
    const go=btn('Import report','btn-primary',async()=>{
      if(!file.files[0]){note(out,'Choose a report file first.');return;}
      if(file.files[0].size>1_500_000){note(out,'That file is too large. Export a shorter date range.');return;}
      go.classList.add('is-loading');go.disabled=true;note(out,'');
      try{
        const r=await request('/api/metatrader','POST',{action:'import',text:await file.files[0].text()});
        state=r;paint();
        const done=host.querySelector('.mt-result');
        done.textContent=`${r.imported} imported, ${r.duplicates} already in your journal, ${r.skippedCount} skipped.`+(r.limited?` ${r.limited} more are waiting on Pro.`:'');
        if(r.skipped?.length){const list=el('ul',undefined,'mt-skips');for(const s of r.skipped.slice(0,5))list.append(el('li',s.reason));done.append(list);}
        if(r.limited)done.after(upgrade('Your free limit is reached. Pro removes it.'));
      }catch(e){note(out,e.message);go.classList.remove('is-loading');go.disabled=false;}
    });
    card.append(file,go,out);return card;
  }
  const upgrade=(text)=>{const box=el('div',undefined,'mt-lock');const a=el('a','See plans','btn btn-primary');a.href='/billing?from=reports';box.append(el('p',text),a);return box;};

  function liveCard(){
    const card=el('section',undefined,'n-out mt-card');card.append(el('h3','Live sync'));
    card.append(el('p','Optional. A small read-only script on your terminal sends each closed trade to your journal within a couple of minutes.'));
    if(!state.live){card.append(upgrade('Live sync is part of Pro. It switches on as soon as your payment is confirmed.'));return card;}
    const steps=el('ol',undefined,'mt-steps');
    for(const t of ['Download the script for your platform and put it in MQL5/Experts (or MQL4/Experts), then restart the terminal.','In Tools > Options > Expert Advisors tick Allow WebRequest and add this address: '+new URL(apiUrl).origin,'Create a connection below, paste the token and the address into the script inputs, and attach it to any chart.'])steps.append(el('li',t));
    const dl=el('div',undefined,'mt-actions');
    for(const [label,file] of [['Download MT5 script','LedgerlineBridge.mq5'],['Download MT4 script','LedgerlineBridge.mq4']]){const a=el('a',label,'btn btn-secondary');a.href='/metatrader/'+file;a.download=file;dl.append(a);}
    const name=el('input');name.className='n-in';name.placeholder='Name, like My MT5';name.maxLength=40;name.setAttribute('aria-label','Connection name');
    const kind=el('select');kind.className='n-in';kind.setAttribute('aria-label','Platform');for(const [v,t] of [['mt5','MetaTrader 5'],['mt4','MetaTrader 4']]){const o=el('option',t);o.value=v;kind.append(o);}
    const out=el('p',undefined,'mt-result');out.setAttribute('role','status');
    const make=btn('Create connection','btn-primary',async()=>{
      make.classList.add('is-loading');make.disabled=true;
      try{const r=await request('/api/metatrader','POST',{action:'link',label:name.value,platform:kind.value});secret=r.token;state=r;paint();}
      catch(e){note(out,e.message);make.classList.remove('is-loading');make.disabled=false;}
    });
    card.append(steps,dl,el('h4','Connections'));
    if(secret){
      const box=el('div',undefined,'mt-token'),code=el('code',secret);
      const copy=btn('Copy token','btn-secondary',async()=>{try{await navigator.clipboard.writeText(secret);copy.textContent='Copied';}catch{copy.textContent='Select and copy it';}});
      box.append(el('p','Copy this token now. It is shown once and Ledgerline keeps only a fingerprint.'),code,copy,el('p','Address for the script: '+apiUrl));card.append(box);
    }
    const list=el('ul',undefined,'mt-links');
    for(const l of state.links){
      const li=el('li'),when=l.lastSeenAt?'last seen '+new Date(l.lastSeenAt).toLocaleString():'not seen yet';
      li.append(el('span',`${l.label} (${l.platform.toUpperCase()}), ${when}`),btn('Disconnect','btn-danger',async()=>{try{state=await request('/api/metatrader','POST',{action:'revoke',id:l.id});secret='';paint();}catch(e){note(out,e.message);}}));
      list.append(li);
    }
    if(!state.links.length)list.append(el('li','No terminal connected yet.'));
    const row=el('div',undefined,'mt-actions');row.append(name,kind,make);
    card.append(list,row,out);return card;
  }

  function paint(){host.replaceChildren(importCard(),liveCard());}
  void load();
}
