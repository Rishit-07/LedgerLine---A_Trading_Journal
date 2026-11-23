import { badgesMarkup, paintBadges } from './badge-shelf.js';
import { profileMarkup, paintProfile } from './account-pages.js';
import { settingsMarkup, bindAccountSettings } from './account-settings.js';
import { paginate } from './pagination.js';
import { openCloseTrade } from './close-trade.js';
import dashboardMarkup from './dashboard.html?raw';
import { bindPageTheme, mountPage } from './shared.js';
import { bindWorkspaceAccount, bindToolbarStreak, bindWorkspaceSearch, prepareTradingShell, paintTradingShell } from './workspace-shell.js';
import { signedR, stat, metric, rate, closedSummary, number } from './workspace-ui.js';
import { screenshotPicker, screenshotData, tradeScreenshots } from '../components/trade-screenshots.js';
import { bindQuickTrade, showReceipt } from './quick-trade.js';
import { badgeMarkup, bindBadgeUnlock, notifyStreak, element } from './streak-view.js';
import '@fontsource/instrument-serif/latin-400.css';
import './dashboard.css';

const captions = { journal: 'Trade journal', profile: 'Profile', badges: 'Badges', settings: 'Settings' };
const markets = { stocks: 'Stocks', options: 'Options', futures: 'Futures', forex: 'Forex', crypto: 'Crypto' };
const moods = ['Calm','Rushed','Fearful','Confident'];

const journal = `
    <div class="journal-workspace">
      <nav class="n-in journal-mode-switch" aria-label="Journal sections">
        <a class="btn btn-ghost" href="#log">Log a trade</a>
        <a class="btn btn-ghost" href="#review">Review trades</a>
      </nav>
      <section class="journal-entry-panel" data-journal-section="log" aria-label="Log a trade">
      <section class="n-out ws-card journal-new"><h2>New trade</h2>
        <form class="ws-form" data-journal-log>
          <fieldset class="n-in journal-segments"><legend class="ws-visually-hidden">Trade side</legend>
            <label><input type="radio" name="side" value="long" checked>Long</label>
            <label><input type="radio" name="side" value="short">Short</label></fieldset>
          <label>Instrument<input class="n-in" name="symbol" placeholder="Search by symbol or type it here" maxlength="48" list="journal-symbols" required></label>
          <datalist id="journal-symbols"></datalist>
          <div class="trade-detail-metrics"><label>Market<select class="n-in" name="market">${Object.entries(markets).map(([id,label])=>`<option value="${id}">${label}</option>`).join('')}</select></label>
            <label>Entry price<input class="n-in" type="number" name="entry" min=".00000001" step="any" inputmode="decimal"></label></div>
          ${[['stop','Stop distance'],['target','Target distance']].map(([name,label])=>`<label>${label}
            <span class="journal-adjust"><button type="button" class="btn btn-secondary" data-offset="-1" aria-label="Decrease ${label.toLowerCase()}">−</button>
            <input class="n-in" type="number" name="${name}" min=".00000001" step="any" inputmode="decimal">
            <button type="button" class="btn btn-secondary" data-offset="1" aria-label="Increase ${label.toLowerCase()}">+</button></span></label>`).join('')}
          <div class="trade-detail-metrics" data-trade-sizing></div>
          <fieldset class="journal-moods"><legend>Feeling before trade</legend>
            ${moods.map((mood)=>`<label class="n-out"><input type="radio" name="mood" value="${mood}">${mood}</label>`).join('')}</fieldset>
          <details class="ws-disclosure n-in"><summary>Setups, rules and result</summary>
            <label>Setup<input class="n-in" name="setup" maxlength="100"></label>
            <label>Result (R) <small>Leave blank for an open trade</small><input class="n-in" type="number" name="result" min="-10000" max="10000" step="any"></label>
            <div class="ws-stack" data-journal-log-rules></div>
          </details>
          <button class="btn btn-primary journal-hold" type="submit">Log this trade →</button>
          <p class="dash-muted journal-hold-help">Hold to save, or press Enter.</p><p role="status" data-journal-log-status></p>
        </form>
      </section>
      <section class="n-out streak-tile" aria-labelledby="streak-rest-title"><h2 id="streak-rest-title">Rest day</h2>
        <form data-rest-form><label>Note <small>(optional)</small><textarea class="n-in" name="note" maxlength="1000" rows="2"></textarea></label>
        <button class="btn btn-secondary">I sat out today</button></form><div data-rest-days></div></section>
      </section>
      <section class="journal-review-panel" data-journal-section="review" aria-label="Review trades" hidden>
      <section class="n-out ws-card journal-inbox"><div class="ws-section-head journal-review-status">
        <div><h2 data-journal-review-text>Needs review</h2><p>Review each trade’s setup and feeling, then mark it reviewed.</p></div>
        <a class="btn btn-secondary" href="/dashboard#streak">Journal streak</a></div><div class="ws-stack" data-journal-inbox></div></section>
      <div class="ws-metric-grid journal-metrics" data-journal-metrics></div>
      <div class="journal-split">
      <div class="journal-column">
      <section class="n-out streak-tile" aria-labelledby="streak-activity-title">
        <h2 id="streak-activity-title">Trade log</h2>
        <div class="ws-actions journal-filters" aria-label="Filter trades">
          <button type="button" class="btn btn-secondary" data-journal-filter="all">All</button>
          <button type="button" class="btn btn-secondary" data-journal-filter="wins">Wins</button>
          <button type="button" class="btn btn-secondary" data-journal-filter="losses">Losses</button>
          <button type="button" class="btn btn-secondary" data-journal-filter="breaks">Rule breaks</button>
        </div>
        <div class="ws-stack" data-journal-activity></div>
        <button type="button" class="btn btn-secondary" data-more-trades hidden>Load older trades</button>
      </section>
      <section class="n-out ws-card"><h2>R by setup</h2><p>Average R in the trade log</p><div class="ws-stack" data-journal-setup></div></section>
      <section class="n-out ws-card"><h2>R by mood</h2><p>Average R by recorded feeling</p><div class="ws-stack" data-journal-mood></div></section>
      <section class="n-out ws-card"><h2>Time held vs result</h2><p>Average R by hold duration</p><div data-journal-hold></div></section>
      </div>
      <div class="journal-column">
      <section class="n-out streak-tile journal-detail" aria-labelledby="journal-trade-title">
        <header class="ws-section-head"><div><h2 id="journal-trade-title" data-journal-detail-title>Trade review</h2><p data-journal-trade-caption></p></div><strong data-journal-result></strong></header>
        <div class="ws-stack" data-journal-detail></div>
        <form data-journal-note hidden><label>Your note<textarea class="n-in" name="note" maxlength="1000" rows="4"></textarea></label>
          <button class="btn btn-secondary">Save note</button></form>
        <div class="ws-actions" data-journal-actions></div>
      </section>
      </div>
      </div>
      </section>
      <p class="streak-message" role="status" data-journal-status></p>
    </div>`;

const settings = `
  <section class="n-out streak-tile streak-settings" aria-labelledby="streak-settings-title">
    <h2 id="streak-settings-title">Journal streak settings</h2>
    <form data-streak-settings>
      <label>Timezone<input class="n-in" name="timezone" list="streak-timezones" required maxlength="80" /><datalist id="streak-timezones"></datalist></label>
      <button type="button" class="btn btn-secondary" data-local-zone>Use device timezone</button>
      <fieldset><legend>Auto-rest exchanges</legend>
        <label><input type="checkbox" name="exchange" value="NSE" /> NSE</label>
        <label><input type="checkbox" name="exchange" value="BSE" /> BSE</label>
      </fieldset>
      <fieldset><legend>Reminders</legend>
        <label><input type="checkbox" name="reminder" /> Email me when today hasn’t counted</label>
        <label>Local reminder time<input class="n-in" type="time" name="reminderTime" /></label>
        <p class="streak-footnote" data-reminder-info></p>
      </fieldset>
      <button class="btn btn-primary">Save settings</button>
      <p role="status" class="streak-message" data-settings-status></p>
    </form>
  </section>`;

export async function renderStreakPage(landing, { path, request, name, photoUrl, signOut }) {
  const mode = path.slice(1);
  document.title = captions[mode] + ' — Ledgerline';
  const shell = document.createElement('template');
  shell.innerHTML = dashboardMarkup.trim();
  const sidebar = shell.content.querySelector('.dash-sidebar');
  for (const link of sidebar.querySelectorAll('a[aria-current]')) {
    link.classList.remove('n-in');
    link.removeAttribute('aria-current');
  }
  const selected = sidebar.querySelector('a[href="/' + mode + '"]');
  selected?.classList.add('n-in');
  selected?.setAttribute('aria-current', 'page');
  const toolbar=prepareTradingShell(shell,mode);
  const tradeDialogs = mode === 'journal' ? ['[data-trade-dialog]', '[data-trade-receipt]'].map((selector) =>
    shell.content.querySelector(selector).outerHTML).join('') : '';
  const page = mountPage(landing, `
    <div class="n-root dashboard-page streak-page workspace-page" data-workspace-mode="${mode}">
      ${sidebar.outerHTML}
      <main class="dash-content">
        ${toolbar.outerHTML}
        <header class="streak-heading streak-page-header">
          <div><h1>${captions[mode]}</h1>${mode === 'journal' ? '' : '<p class="account-deck">' + ({profile:'How you trade and what others can see. Results show as percent and R, never currency.',settings:'Account, brokers, rules and privacy.',badges:'Earned for the way you trade, never for how much you made.'})[mode] + '</p>'}</div>
        </header>
        ${mode === 'journal' ? '<p class="dash-muted journal-deck">Every trade with its checklist, emotion and review.</p>' : ''}
        <p class="streak-message" role="status" data-streak-page-status>Loading…</p>
        ${mode === 'journal' ? journal : mode === 'settings' ? settingsMarkup(settings) : mode === 'badges' ? badgesMarkup : profileMarkup}
      </main>
      ${tradeDialogs}${badgeMarkup}${shell.content.querySelector('[data-search-dialog]').outerHTML}
    </div>`);
  bindPageTheme(page);
  bindWorkspaceSearch(page);
  bindToolbarStreak(page,request);
  const menu = page.querySelector('[data-dash-menu]');
  menu.addEventListener('click', () => {
    menu.setAttribute('aria-expanded', String(page.toggleAttribute('data-menu-open')));
  });
  const pageStatus = page.querySelector('[data-streak-page-status]');
  bindWorkspaceAccount(page, { name, photoUrl, signOut, status:pageStatus });
  const showBadge = bindBadgeUnlock(page, request);
  if (mode !== 'journal') {
    page.querySelector('[data-log-trade]').addEventListener('click', () => location.assign('/journal#log'));
  }
  try {
    if (mode === 'journal') await bindJournal(page, request, showBadge);
    else if (mode === 'settings') {
      void request('/api/streak','GET').then(state=>paintTradingShell(page,{},state.current)).catch(()=>{});
      await Promise.all([bindAccountSettings(page, request),bindSettings(page, request, showBadge)]);
    }
    else {
      const [state,dashboard,portfolio,friends,battles] = await Promise.all([
        request('/api/streak','GET'), mode==='profile' ? request('/api/dashboard','GET') : null,
        mode==='profile' ? request('/api/workspace?page=portfolio','GET') : null,
        mode==='profile' ? request('/api/streak/friends','GET') : null,
        mode==='profile' ? request('/api/streak/battles','GET').catch(()=>null) : null
      ]);
      async function displayProfile(state) {
        paintTradingShell(page,dashboard ?? {},state.current);
        if(mode==='badges') await paintBadges(page,request);
        else paintProfile(page,state,dashboard,portfolio,name,photoUrl,friends,battles?.battles);
        showBadge(state);
      }
      await displayProfile(state);
      page.addEventListener('toolbar-streak',event=>void displayProfile(event.detail).catch(error=>{pageStatus.textContent=error.message;}));
    }
    pageStatus.textContent = '';
  } catch (error) { pageStatus.textContent = error.message; }
}

async function bindJournal(page, request, showBadge) {
  const links=page.querySelectorAll('.journal-mode-switch a');
  function showSection(){
    const hasTrade=new URLSearchParams(location.search).has('tradeId');
    const review=location.hash==='#review' || (hasTrade && location.hash!=='#log');
    const active=review?'review':'log';
    for(const panel of page.querySelectorAll('[data-journal-section]')) panel.hidden=panel.dataset.journalSection!==active;
    for(const link of links){
      const current=link.hash==='#'+active;
      link.classList.toggle('n-out',current);
      if(current) link.setAttribute('aria-current','location');
      else link.removeAttribute('aria-current');
    }
  }
  showSection();
  window.addEventListener('hashchange',showSection);
  const journalStatus = page.querySelector('[data-journal-status]');
  const tradeList = page.querySelector('[data-journal-activity]');
  const restDays = page.querySelector('[data-rest-days]');
  const more = page.querySelector('[data-more-trades]');
  const rest = page.querySelector('[data-rest-form]');
  let state;
  let cursor;
  let dashboard;
  let trades = [];
  const directTrade = new URLSearchParams(location.search).get('tradeId');
  let selected = /^[1-9]\d{0,17}$/.test(directTrade ?? '') ? directTrade : undefined;
  let filter = 'all';
  const filterControls = [...page.querySelectorAll('[data-journal-filter]')];
  const noteForm = page.querySelector('[data-journal-note]');

  let revealTrade = selected;
  function drawJournal() {
    const time = new Intl.DateTimeFormat(undefined, { dateStyle:'medium', timeStyle:'short', timeZone:state.timezone });
    filterControls.forEach((control)=>control.setAttribute('aria-pressed',String(control.dataset.journalFilter===filter)));
    const visible = trades.filter((trade)=>({all:true,wins:trade.result>0,losses:trade.result<0,breaks:trade.checks.some((rule)=>!rule.kept)})[filter]);
    if (!visible.some((trade)=>trade.id===selected)) selected=visible[0]?.id;
    page.querySelector('[data-journal-review-text]').textContent = !trades.length ? 'No trades to review yet'
      : 'Needs review: ' + trades.filter((trade)=>!trade.reviewed).length + (cursor?' in loaded trades':'');
    const {closed,sum,winRate,average}=closedSummary(trades);
    const breaks=trades.reduce((count,trade)=>count+trade.checks.filter((rule)=>!rule.kept).length,0);
    const held=closed.map((trade)=>Date.parse(trade.closedAt)-Date.parse(trade.openedAt)).filter((ms)=>ms>0);
    page.querySelector('[data-journal-metrics]').replaceChildren(
      metric('Trades',String(trades.length)),metric('Net R',signedR(sum),'',sum>0?'is-win':sum<0?'is-loss':''),
      metric('Win rate',rate(winRate)),metric('Average R',signedR(average),'',average>0?'is-win':average<0?'is-loss':''),
      metric('Rule breaks',String(breaks),'',breaks?'is-loss':''),
      metric('Average hold',held.length?Math.round(held.reduce((sum,ms)=>sum+ms,0)/held.length/60000)+' min':'—'));
    page.querySelector('[data-journal-inbox]').replaceChildren(...trades.filter((trade)=>!trade.reviewed).map((trade)=>{
      const row=element('article','','n-in journal-inbox-row');
      const info=element('div');
      info.append(element('strong',trade.symbol),element('small',[time.format(new Date(trade.openedAt)),trade.result===null?'Open':signedR(trade.result)].join(' · ')));
      const choices=element('div','','journal-inbox-choices');
      const setup=element('select', '', 'n-out');
      const mood=element('select', '', 'n-out');
      setup.setAttribute('aria-label','Setup for '+trade.symbol);
      mood.setAttribute('aria-label','Feeling for '+trade.symbol);
      setup.append(new Option('Setup',''),...[...new Set([trade.setup,'Opening range breakout','Pullback','Reversal'].filter(Boolean))]
        .map((value)=>new Option(value,value)));
      mood.append(new Option('Feeling',''),...['Calm','Rushed','Fearful','Confident'].map((value)=>new Option(value,value)));
      setup.value=trade.setup??'';mood.value=trade.mood??'';
      const review=action('Mark reviewed',async()=>{
        const result=await request('/api/streak/journal/review','POST',{tradeId:trade.id,
          ...(setup.value?{setup:setup.value}:{}),...(mood.value?{mood:mood.value}:{})});
        applyStreak(result);await loadJournal();
      },journalStatus);
      review.classList.replace('btn-secondary','btn-primary');
      choices.append(setup,mood,review);row.append(info,choices);
      return row;
    }));
    paginate(page.querySelector('[data-journal-inbox]'),'Reviews',4);
    tradeList.replaceChildren(...visible.map((trade)=>{
      const item=element('button','','n-in journal-log-row');
      item.type='button';item.setAttribute('aria-pressed',String(trade.id===selected));
      item.append(element('strong',trade.symbol),element('span',signedR(trade.result)),
        element('small',time.format(new Date(trade.openedAt))+' · '+(trade.reviewed?'Reviewed':'Needs review')));
      item.addEventListener('click',()=>{
        selected=trade.id;
        drawJournal();
        tradeList.querySelector('[aria-pressed=true]')?.focus({preventScroll:true});
      });
      return item;
    }));
    if (!visible.length) tradeList.append(element('p',trades.length?'No trades match this filter.':'No trades logged yet.'));
    paginate(tradeList,'Trade log',7,filter,visible.findIndex((row)=>row.id===revealTrade));
    revealTrade=undefined;
    const trade=visible.find((row)=>row.id===selected);
    const detail=page.querySelector('[data-journal-detail]');
    const actions=page.querySelector('[data-journal-actions]');
    page.querySelector('[data-journal-detail-title]').textContent=trade?.symbol ?? 'Trade review';
    page.querySelector('[data-journal-trade-caption]').textContent=trade?[markets[trade.market],trade.side,trade.setup].filter(Boolean).join(' · '):'';
    const result=page.querySelector('[data-journal-result]');
    result.textContent=trade?(trade.result===null?'Open':signedR(trade.result)):'';
    result.className=trade?.result>0?'is-win':trade?.result<0?'is-loss':'';
    detail.replaceChildren();actions.replaceChildren();noteForm.hidden=!trade;
    if (trade) {
      detail.append(tradeScreenshots(trade,request));
      const metrics=element('div','','trade-detail-metrics journal-trade-metrics');
      const duration=trade.closedAt?(Date.parse(trade.closedAt)-Date.parse(trade.openedAt))/60000:0;
      metrics.append(...[['Entry',trade.entry],['Exit',trade.exit],['Stop',trade.stop],['Target',trade.target],
        ['Quantity',trade.qty],['Time held',duration>0?number.format(duration)+' min':null],['Feeling',trade.mood],
        ['Rules kept',trade.checks.length?trade.checks.filter((check)=>check.kept).length+' / '+trade.checks.length:null]]
        .map(([label,value])=>stat(label,typeof value==='number'?number.format(value):value??'—')));
      detail.append(metrics);
      detail.append(element('h3','Checklist'));
      if (trade.checks.length) for (const check of trade.checks) detail.append(element('p',(check.kept?'✓ ':'× ')+check.text,'n-in ws-list-card'));
      else detail.append(element('p','No rule checks recorded.'));
      noteForm.elements.note.value=trade.note;
      if (!trade.closedAt) {
        const close=element('button','Close trade','btn btn-primary');
        close.type='button';
        close.onclick=()=>openCloseTrade(page,trade,request,loadJournal);
        actions.append(close);
      }

      if (!trade.reviewed) actions.append(action('Mark reviewed',async()=>{
        applyStreak(await request('/api/streak/review','POST',{tradeId:trade.id}));await loadJournal();
      },journalStatus));
      actions.append(action('Delete',async()=>{
        if (!confirm('Delete this trade and its journal entries?')) return;
        applyStreak(await request('/api/trades?tradeId='+trade.id,'DELETE'));await loadJournal();
      },journalStatus));
    } else detail.append(element('p','Select a logged trade to review it.'));

    for(const key of ['setup','mood']){
      const groups=new Map();
      for(const record of trades){
        if(record.result===null || !record[key])continue;
        const group=groups.get(record[key])??{total:0,count:0};group.total+=record.result;group.count++;groups.set(record[key],group);
      }
      const target=page.querySelector('[data-journal-'+key+']');
      const ranked=[...groups].map(([label,{total,count}])=>[label,total/count]).sort((left,right)=>right[1]-left[1]);
      const scale=Math.max(1,...ranked.map(([,value])=>Math.abs(value)));
      target.replaceChildren(...ranked.map(([label,value])=>{
        const row=element('div','','history-setup-row');
        const bar=element('progress');bar.max=scale;bar.value=Math.abs(value);bar.className=value<0?'is-loss':'is-win';
        bar.setAttribute('aria-label',label+' average '+signedR(value));
        row.append(element('strong',label),bar,element('small',signedR(value),bar.className));return row;
      }));
      paginate(target,'R by '+key,6);
      if(!groups.size)target.append(element('p','No closed trades with a recorded '+key+'.'));
    }
    const durations=[[5,'<5m'],[15,'5–15m'],[30,'15–30m'],[60,'30–60m'],[240,'1–4h'],[Infinity,'4h+']];
    const buckets=durations.map(([limit,label])=>({limit,label,sum:0,count:0}));
    for(const trade of closed){
      const minutes=(Date.parse(trade.closedAt)-Date.parse(trade.openedAt))/60000;
      if(minutes<=0 || !Number.isFinite(minutes))continue;
      const bucket=buckets.find(({limit})=>minutes<limit);
      bucket.sum+=trade.result;bucket.count++;
    }
    const hold=page.querySelector('[data-journal-hold]');
    if(held.length){
      const scale=Math.max(1,...buckets.map(({sum,count})=>count?Math.abs(sum/count):0));
      const chart=element('div','','journal-hold-chart');
      for(const {label,sum,count} of buckets){
        const value=count?sum/count:null;
        const column=element('div','','journal-hold-column '+(value<0?'is-loss':'is-win'));
        const meter=element('div','','journal-hold-bar');
        if(count)meter.style.height=Math.max(3,Math.abs(value)*100/scale)+'%';
        column.append(element('small',signedR(value)),element('div','','journal-hold-track'),element('span',label));
        column.children[1].append(meter);chart.append(column);
      }
      hold.replaceChildren(chart);
    }else hold.replaceChildren(element('p','No closed trades with a recorded holding duration.','ws-empty'));
  }

  function applyStreak(next) {
    state = next;
    if(dashboard) paintTradingShell(page,dashboard,state.current);
    rest.querySelector('button').textContent = state.manualRestToday ? 'Update rest-day note' : 'I sat out today';
    showBadge(state);
    notifyStreak(page,state);
  }

  async function loadJournal(append = false) {
    const query=new URLSearchParams(append?{before:cursor}:selected?{tradeId:selected}:{});
    const payload = await request('/api/streak/journal?' + query, 'GET');
    if(append) revealTrade=payload.trades.find((row)=>!trades.some((existing)=>existing.id===row.id))?.id;
    trades = append ? [...new Map([...trades,...payload.trades].map((trade)=>[trade.id,trade])).values()] : payload.trades;
    page.querySelector('#journal-symbols').replaceChildren(...[...new Set(trades.map(({symbol})=>symbol))].map((symbol)=>new Option(symbol)));
    if (!append) restDays.replaceChildren();
    if (payload.restDays.length) {
      restDays.append(element('h3', 'Rest days'));
      const list = element('ul');
      for (const day of payload.restDays) list.append(element('li', day.day + (day.note ? ' · ' + day.note : '')));
      restDays.append(list);
      paginate(list,'Rest days');
    }
    cursor = payload.next;
    more.hidden = !cursor;
    drawJournal();
  }

  const [initial, dashboardData] = await Promise.all([request('/api/streak', 'GET'), request('/api/dashboard', 'GET')]);
  dashboard = initialDashboard(dashboardData, initial);
  applyStreak(initial);
  page.addEventListener('toolbar-streak',event=>{applyStreak(event.detail);void loadJournal().catch(()=>{});});
  const onSaved=async(saved)=>{
    applyStreak(saved.streak);
    try {
      await loadJournal();
      dashboard=initialDashboard(await request('/api/dashboard','GET'),state);
      paintTradingShell(page,dashboard,state.current);
    }
    catch(error){ journalStatus.textContent=error.message; }
  };
  bindQuickTrade(page, {
    marketNames: markets, getDashboard: () => dashboard,
    save: (trade) => request('/api/trades', 'POST', trade),
    onSaved,
  });
  bindJournalLog(page, dashboard, request, onSaved);

  more.addEventListener('click', () => run(more, journalStatus, () => loadJournal(true)));
  filterControls.forEach((control)=>control.addEventListener('click',()=>{filter=control.dataset.journalFilter;drawJournal();}));
  bindSubmit(noteForm,journalStatus,async(values)=>{
    const trade=trades.find((row)=>row.id===selected);
    if(!trade)return;
    const {note}=await request('/api/streak/journal/note','POST',{tradeId:trade.id,note:values.get('note')});
    trade.note=note;
    journalStatus.textContent='Note saved.';
  });
  bindSubmit(rest, journalStatus, async (data) => {
    const next = await request('/api/streak/rest-day', 'POST', { note: data.get('note') });
    applyStreak(next);
    rest.reset();
    await loadJournal();
  });
  await loadJournal();
}

function initialDashboard(data, state) {
  return { ...data, streakTimezone: state.timezone };
}

function bindJournalLog(page, dashboard, request, onSaved) {
  const form=page.querySelector('[data-journal-log]');
  const status=form.querySelector('[data-journal-log-status]');
  const save=form.querySelector('button[type=submit]');
  const before=screenshotPicker('before');
  save.before(before);
  const sizing=form.querySelector('[data-trade-sizing]');
  const market=dashboard.markets.find((value)=>value in markets)??Object.keys(markets)[0];
  const fields=form.elements;
  const optional=(name)=>fields[name].value===''?null:fields[name].valueAsNumber;
  const rules=form.querySelector('[data-journal-log-rules]');
  let requestId=crypto.randomUUID(),hold;
  fields.market.value=market;
  rules.replaceChildren(...dashboard.rules.map((rule)=>{
    const label=element('label','','ws-check');
    const input=element('input');input.type='checkbox';input.name='kept';input.value=rule.id;
    label.append(input,element('span',rule.text+(rule.hard?' · Hard rule':'')));
    return label;
  }));
  if(dashboard.rules.length)rules.prepend(element('strong','Rules followed'));
  function size(){
    const stop=optional('stop'),target=optional('target');
    const ratio=stop>0&&target>0?number.format(target/stop)+':1':'—';
    sizing.replaceChildren(stat('Reward / risk',ratio),stat('Risk per trade',number.format(dashboard.riskPerTrade)+'%'));
  }
  size();
  form.addEventListener('input',size);
  for(const button of form.querySelectorAll('[data-offset]')) button.addEventListener('click',()=>{
    const input=button.parentElement.querySelector('input');
    const next=Math.max(0,(Number(input.value)||0)+Number(button.dataset.offset));
    input.value=next?String(Number(next.toFixed(8))):'';
    size();
  });
  function endHold(){clearTimeout(hold);save.classList.remove('is-holding');}
  save.addEventListener('pointerdown',(event)=>{
    if(event.button!==0||!event.isPrimary||save.disabled)return;
    save.classList.add('is-holding');
    hold=setTimeout(()=>{endHold();form.requestSubmit(save);},850);
  });
  for(const type of ['pointerup','pointercancel','pointerleave','blur'])save.addEventListener(type,endHold);
  save.addEventListener('click',(event)=>{if(event.detail>0)event.preventDefault();});
  bindSubmit(form,status,async(data)=>{
    endHold();
    const entry=optional('entry'),stop=optional('stop'),target=optional('target');
    if(entry===null&&(stop!==null||target!==null)) { fields.entry.focus(); throw new Error('Enter a price to calculate stop and target levels.'); }
    const direction=data.get('side')==='long'?1:-1;
    const stopPrice=stop===null?null:Number((entry-direction*stop).toFixed(8));
    const targetPrice=target===null?null:Number((entry+direction*target).toFixed(8));
    if ([stopPrice,targetPrice].some((price)=>price!==null&&price<=0)) throw new Error('Stop and target prices must be greater than zero.');
    const trade={requestId,symbol:data.get('symbol'),market:data.get('market'),side:data.get('side'),entry,
      stop:stopPrice,target:targetPrice,setup:data.get('setup'),mood:data.get('mood'),result:optional('result'),kept:data.getAll('kept')};
    trade.beforeScreenshot=await screenshotData(before.querySelector('input').files[0]);
    const saved=await request('/api/trades','POST',trade);
    requestId=crypto.randomUUID();
    form.reset();fields.market.value=market;size();
    status.textContent='Trade saved.';
    showReceipt(page.querySelector('[data-trade-receipt]'),trade,dashboard.rules,saved);
    await onSaved(saved);
  });
}

async function bindSettings(page, request, showBadge) {
  const form = page.querySelector('[data-streak-settings]');
  const { timezone, exchanges, reminderTime, remindersAvailable } = await request('/api/streak/preferences', 'GET');
  form.elements.timezone.value = timezone;
  page.querySelector('#streak-timezones').append(...['UTC', ...Intl.supportedValuesOf('timeZone')].map((zone) => new Option(zone)));
  page.querySelector('[data-local-zone]').addEventListener('click', () => {
    form.elements.timezone.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  });
  for (const checkbox of form.querySelectorAll('[name="exchange"]')) checkbox.checked = exchanges.includes(checkbox.value);
  form.elements.reminder.checked = Boolean(reminderTime);
  form.elements.reminder.disabled = !remindersAvailable;
  form.elements.reminderTime.value = reminderTime ?? '';
  const toggle = () => {
    form.elements.reminderTime.disabled = !form.elements.reminder.checked || !remindersAvailable;
    form.elements.reminderTime.required = !form.elements.reminderTime.disabled;
  };
  toggle();
  form.elements.reminder.addEventListener('change', toggle);
  page.querySelector('[data-reminder-info]').textContent = remindersAvailable
    ? 'Reminders go to the verified email on your account.' : 'Email reminders are currently unavailable.';
  const status = page.querySelector('[data-settings-status]');
  bindSubmit(form, status, async (data) => {
    const updated = await request('/api/streak/preferences', 'PUT', {
      timezone: data.get('timezone').trim(), exchanges: data.getAll('exchange'), reminderTime: data.get('reminderTime'),
    });
    paintTradingShell(page,{},updated.current);
    status.textContent = 'Settings saved.';
    showBadge(updated);
  });
}

async function run(button, status, handler) {
  if (button.disabled) return;
  status.textContent = '';
  button.disabled = true;
  try { await handler(); }
  catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
}

function action(label, handler, status) {
  const button = element('button', label, 'btn btn-secondary');
  button.type = 'button';
  button.addEventListener('click', () => run(button, status, handler));
  return button;
}

function bindSubmit(form, status, handler) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const submit = event.submitter ?? form.querySelector('button:not([type]), button[type="submit"]');
    void run(submit, status, () => handler(data));
  });
}
