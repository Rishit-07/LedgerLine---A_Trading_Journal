import './panel.css';

const el=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;};
const btn=(text,cls,onclick)=>{const b=el('button',text,'btn '+cls);b.type='button';b.onclick=onclick;return b;};

export const metatraderMarkup='<p>Bring your MetaTrader 4 or 5 trades into the journal. Ledgerline only ever reads closed trades. It never places or changes an order, and it never asks for a broker password.</p><div data-mt></div>';

export function bindMetaTrader(root,request){
  const host=root.querySelector('[data-mt]');
  let state=null,secret='';
  const apiUrl=location.origin+'/api/metatrader/ingest';

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

  const SEEN_MS=10*60_000;
  const connected=(l)=>l.lastSeenAt&&Date.now()-new Date(l.lastSeenAt).getTime()<SEEN_MS;
  const copyButton=(label,text)=>{const b=btn(label,'btn-secondary',async()=>{try{await navigator.clipboard.writeText(text);b.textContent='Copied';}catch{b.textContent='Select and copy it';}setTimeout(()=>{b.textContent=label;},2000);});return b;};
  const step=(n,title,...body)=>{const li=el('li',undefined,'mt-step');li.append(el('span',String(n),'mt-n n-in'));const box=el('div');box.append(el('h4',title),...body);li.append(box);return li;};

  function liveCard(){
    const card=el('section',undefined,'n-out mt-card');card.append(el('h3','Live sync'));
    card.append(el('p','Optional, and set up once. A small read-only script inside MetaTrader sends each closed trade to your journal within a couple of minutes. It never places, changes or closes a trade.'));
    if(!state.live){card.append(upgrade('Live sync is part of Pro. It switches on as soon as your payment is confirmed.'));return card;}
    const origin=new URL(apiUrl).origin;
    const steps=el('ol',undefined,'mt-steps');

    const dl=el('div',undefined,'mt-actions');
    for(const [label,file] of [['Download MT5 script','LedgerlineBridge.mq5'],['Download MT4 script','LedgerlineBridge.mq4']]){const a=el('a',label,'btn btn-secondary');a.href='/metatrader/'+file;a.download=file;dl.append(a);}
    steps.append(step(1,'Add the script to MetaTrader',el('p','In MetaTrader choose File, Open Data Folder. Put the file in MQL5/Experts (MT5) or MQL4/Experts (MT4), then restart MetaTrader.'),dl));

    const addr=el('div',undefined,'mt-actions');addr.append(el('code',origin,'mt-code'),copyButton('Copy address',origin));
    steps.append(step(2,'Let MetaTrader reach Ledgerline',el('p','Open Tools, Options, Expert Advisors. Tick Allow WebRequest for listed URL and add this address. MetaTrader blocks the connection until you do.'),addr));

    const name=el('input');name.className='n-in';name.placeholder='Name, like My MT5';name.maxLength=40;name.setAttribute('aria-label','Connection name');
    const kind=el('select');kind.className='n-in';kind.setAttribute('aria-label','Platform');for(const [v,t] of [['mt5','MetaTrader 5'],['mt4','MetaTrader 4']]){const o=el('option',t);o.value=v;kind.append(o);}
    const out=el('p',undefined,'mt-result');out.setAttribute('role','status');
    const make=btn('Create connection','btn-primary',async()=>{
      make.classList.add('is-loading');make.disabled=true;
      try{const r=await request('/api/metatrader','POST',{action:'link',label:name.value,platform:kind.value});secret=r.token;state=r;paint();}
      catch(e){note(out,e.message);make.classList.remove('is-loading');make.disabled=false;}
    });
    const row=el('div',undefined,'mt-actions');row.append(name,kind,make);
    const three=[el('p','Create a connection, copy the token, and paste the token and the address into the script settings. Then drag the script onto any chart.')];
    if(secret){
      const box=el('div',undefined,'mt-token');
      box.append(el('p','Copy this token now. It is shown once and Ledgerline keeps only a fingerprint.'),el('code',secret),copyButton('Copy token',secret));three.push(box);
    }
    three.push(row,out);steps.append(step(3,'Create your connection',...three));

    const list=el('ul',undefined,'mt-links');
    for(const l of state.links){
      const li=el('li'),ok=connected(l);
      const when=ok?'Connected':l.lastSeenAt?'Last seen '+new Date(l.lastSeenAt).toLocaleString()+'. Is MetaTrader open with the script on a chart?':'Waiting for the script to connect.';
      const chip=el('span',ok?'Connected':l.lastSeenAt?'Not seen lately':'Waiting','mt-chip'+(ok?' is-ok':''));
      const text=el('span');text.append(el('strong',`${l.label} (${l.platform.toUpperCase()})`),el('br'),el('small',when));
      const left=el('span',undefined,'mt-left');left.append(chip,text);
      li.append(left,btn('Disconnect','btn-danger',async()=>{try{state=await request('/api/metatrader','POST',{action:'revoke',id:l.id});secret='';paint();}catch(e){note(out,e.message);}}));
      list.append(li);
    }
    if(!state.links.length)list.append(el('li','No terminal connected yet.'));
    const check=btn('Check now','btn-secondary',async()=>{check.classList.add('is-loading');await refresh();check.classList.remove('is-loading');});
    steps.append(step(4,'Check that it is connected',el('p','This turns green within a few minutes. MetaTrader has to stay open with the script on a chart, or run on a VPS. Trades with no stop loss are skipped.'),list,check));
    card.append(steps);return card;
  }

  let pollTimer=0,polls=0;
  async function refresh(){
    try{const next=await request('/api/metatrader','GET');const sig=(s)=>JSON.stringify(s.links.map((l)=>[l.id,connected(l),l.lastSeenAt]));if(sig(next)!==sig(state)||next.used!==state.used){state=next;paint();}}catch{/* keep what is on screen */}
  }
  function poll(){
    clearTimeout(pollTimer);
    if(!host.isConnected||polls>75||!state?.live||!state.links.some((l)=>!connected(l)))return;
    pollTimer=setTimeout(async()=>{polls++;await refresh();poll();},8000);
  }

  function paint(){host.replaceChildren(importCard(),liveCard());polls=0;poll();}
  void load();
}
