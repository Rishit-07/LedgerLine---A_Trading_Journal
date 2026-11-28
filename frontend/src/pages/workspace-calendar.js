import { paginate } from './pagination.js';
import dashboardMarkup from './dashboard.html?raw';
import { bindTradingCalendar } from './trading-calendar.js';
import { node, select, signedR, formatDate, markets } from './workspace-ui.js';

const zone = 'Asia/Kolkata';
const ist = new Intl.DateTimeFormat('en-IN', { timeZone:zone, dateStyle:'medium', timeStyle:'short' });
const istTime = new Intl.DateTimeFormat('en-IN', { timeZone:zone, timeStyle:'short' });
const istDate = new Intl.DateTimeFormat('en-CA', { timeZone:zone, dateStyle:'short' });
const dayOf = (event) => event.date ?? istDate.format(new Date(event.at));
const isDollarNews = (event) => event?.currency === 'USD'
  || event?.country === 'United States'
  || /\b(usd|u\.s\.|dollar|fed|fomc|powell|cpi|nfp|nonfarm|payroll|pce|treasury|gdp)\b/i.test(event?.title || '');

function eventCard(event) {
  const usd = isDollarNews(event);
  const card = node('article','','n-in ws-list-card calendar-event' + (usd ? ' is-usd-event' : ''));
  const head = node('div', '', 'calendar-event-head');
  if (usd) {
    const badge = node('span', '$ USD', 'calendar-usd-badge');
    badge.title = 'USD high-impact news';
    head.append(badge);
  }
  head.append(node('small',(event.at ? ist.format(new Date(event.at)) : formatDate(event.date))+' · '+event.source));
  const title = node(event.url ? 'a' : 'strong', event.title);
  if (event.url) { title.href=event.url; title.target='_blank'; title.rel='noopener noreferrer'; }
  card.append(head, title);
  if (event.impact || usd) {
    const impactText = event.impact ? ['','Low impact','Medium impact','High impact'][event.impact] : 'High impact · USD';
    card.append(node('small', impactText, (event.impact===3 || usd) ? 'is-loss' : ''));
  }
  if (event.forecast != null || event.actual != null) {
    card.append(node('small','Expected '+(event.forecast??'—')+' · Actual '+(event.actual??'—')));
  }
  return card;
}

function calendarMarkup() {
  const template = document.createElement('template');
  template.innerHTML = dashboardMarkup;
  const calendar = template.content.querySelector('#trading-calendar');
  const metrics = calendar.querySelector('[data-calendar-metrics]');
  metrics.className = 'ws-metric-grid ws-calendar-metric-grid';
  metrics.setAttribute('data-workspace-calendar-metrics','');
  metrics.remove();
  const header = calendar.querySelector('.dash-calendar-header');
  header.classList.add('ws-visually-hidden');
  const options = document.createElement('div');
  options.className = 'ws-actions ws-calendar-toggles';
  options.innerHTML = `<button class="btn btn-secondary" type="button" data-calendar-mode="result">Result</button>
    <button class="btn btn-secondary" type="button" data-calendar-mode="process">Process</button>
    <button class="btn btn-secondary" type="button" data-calendar-today>Today</button>`;
  const controls = node('div','','ws-calendar-header');
  const monthNav = calendar.querySelector('.dash-month-nav');
  monthNav.before(controls);
  controls.append(monthNav,options);
  const filter=document.createElement('select');
  filter.dataset.calendarMarket='';filter.setAttribute('aria-label','Trade markets');
  filter.className='n-in calendar-market-filter';
  filter.add(new Option('My markets','preferred'));filter.add(new Option('All markets',''));
  for(const [id,label] of Object.entries(markets))filter.add(new Option(label,id));
  options.prepend(filter);
  const marketEvents = header.querySelector('[data-calendar-events]');
  const legend = node('p','','ws-calendar-legend');
  legend.innerHTML = '<span class="is-win">● Win day</span><span class="is-loss">● Loss day</span><span class="calendar-legend-mark">● Rule break</span><span class="calendar-legend-event">● Market event</span><span class="calendar-legend-usd">$ USD news</span><span class="calendar-legend-rest">● Rest day</span>';
  calendar.querySelector('table').after(legend);
  calendar.append(marketEvents);
  return { metrics:metrics.outerHTML, calendar:calendar.outerHTML, dialog:template.content.querySelector('[data-calendar-dialog]').outerHTML };
}

export const calendar = {
  title:'Trading calendar',description:'Every day at a glance. Tap a day to see its trades and review.',
  action:'<button class="btn btn-secondary" type="button" data-calendar-export>Export month</button>',
  get content() {
    const { metrics, calendar, dialog } = calendarMarkup();
    return metrics + `<div class="ws-calendar-board"><div class="calendar-column">${calendar}
      <section class="n-out ws-card"><div class="ws-section-head"><h2>Economic events, this week</h2><div class="ws-actions">
        <button type="button" class="btn btn-secondary" data-event-impact="all" aria-pressed="true">All impacts</button>
        <button type="button" class="btn btn-secondary" data-event-impact="high" aria-pressed="false">High only</button></div></div>
        <p>Scheduled releases · IST</p><div class="ws-stack" data-calendar-week-events></div></section>
      </div><div class="calendar-column"><aside class="n-out ws-card calendar-day-review" data-calendar-selected aria-label="Selected trading day"></aside>
      <section class="n-out ws-card"><h2>Market news</h2><p>Latest headlines from connected sources</p>
        <div class="ws-actions calendar-news-filters"><button type="button" class="btn btn-secondary" data-news-country="all" aria-pressed="true">All</button>
          <button type="button" class="btn btn-secondary" data-news-country="india" aria-pressed="false">India</button>
          <button type="button" class="btn btn-secondary" data-news-country="global" aria-pressed="false">Global</button></div>
        <div class="ws-stack" data-calendar-catalysts></div></section>
    </div></div>` + dialog;
  },
  bind(page,{data,request}) {
    const loadCalendar = () => request('/api/calendar','GET');
    const panel=select(page,'[data-calendar-selected]');
    const economic=select(page,'[data-calendar-week-events]'),corporate=select(page,'[data-calendar-catalysts]');
    let activeDay, dayData, dayError, marketHours, feed, feedFailed, selectedImpact='all', selectedCountry='all';
    let dayVersion=0;
    const filter=select(page,'[data-calendar-market]');
    function query(params) {
      const query=new URLSearchParams(params);
      const selected=filter.value==='preferred'?data.account.markets:filter.value?[filter.value]:[];
      for(const market of selected)query.append('market',market);
      return query;
    }
    const loadDay=(date,market)=>request('/api/calendar/day?'+query({date,...(market?{view:'market'}:{})}),'GET');

    function paintDay() {
      const date = new Date(activeDay+'T00:00:00Z');
      const weekday = new Intl.DateTimeFormat('en-IN',{weekday:'long',timeZone:'UTC'}).format(date);
      const heading = new Intl.DateTimeFormat('en-US',{day:'numeric',month:'short',timeZone:'UTC'}).format(date);
      panel.replaceChildren(node('small',weekday,'calendar-kicker'),node('h2',heading));
      if (!dayData) {
        const status=node('p',dayError?'Could not load this day.':'Loading journal…','ws-empty');
        status.setAttribute('role','status');
        panel.append(status);
        if (dayError) {
          const retry=node('button','Try again','btn btn-secondary');
          retry.onclick=()=>selectDay(activeDay);
          panel.append(retry);
        }
        return;
      }
      const closed=dayData.trades.filter((trade)=>trade.closedAt && istDate.format(new Date(trade.closedAt))===activeDay);
      const net=closed.length?closed.reduce((total,trade)=>total+trade.result,0):null;
      const breaks=closed.reduce((total,trade)=>total+(trade.breaks??0),0);
      if(activeDay<=data.today) panel.append(node('strong',signedR(net),'calendar-day-net '+(net>0?'is-win':net<0?'is-loss':'')),
        node('p',closed.length+' closed · '+breaks+' rule '+(breaks===1?'break':'breaks')));
      const trades=node('div','','calendar-day-list');
      panel.append(trades);
      for (const trade of dayData.trades) {
        const closedHere=closed.includes(trade);
        const action=node('a','','n-in calendar-day-trade');
        action.href='/history?'+new URLSearchParams({tradeId:trade.id});
        action.append(node('small',istTime.format(new Date(closedHere?trade.closedAt:trade.openedAt))),
          node('span',trade.symbol),node('strong',closedHere?signedR(trade.result):'Opened',
            closedHere?(trade.result>0?'is-win':trade.result<0?'is-loss':''):''));
        trades.append(action);
      }
      paginate(trades,'Daily trades');
      if (!dayData.trades.length && activeDay<=data.today) panel.append(node('p','No trades recorded for this day.','ws-empty'));
      if (['live','published'].includes(marketHours?.status)) {
        for (const {exchange,opensAt,closesAt} of marketHours.data) {
          if (!opensAt||!closesAt) continue;
          panel.append(node('p',exchange+' · '+istTime.format(new Date(opensAt))+' – '+istTime.format(new Date(closesAt))+' IST','n-in ws-list-card'));
        }
      }
      const events=feed?.events.filter((event)=>dayOf(event)===activeDay && (['economic','earnings','dividend','holiday','expiry'].includes(event.kind) || isDollarNews(event)))??[];
      panel.append(node('h3','Events this day'));
      if(events.length) {
        const list=node('div','','ws-stack');panel.append(list);list.append(...events.map(eventCard));paginate(list,'Daily events');
      }
      else panel.append(node('p',feed?'No events listed in the connected feeds.':feedFailed?'Event feeds could not load.':'Loading events…','ws-empty'));
      const notes=dayData.notes.filter(({note})=>note);
      if (dayData.notes.some(({isRestDay})=>isRestDay)) panel.append(node('p','Rest day logged','n-in ws-list-card'));
      if(notes.length) {
        const list=node('div','','ws-stack');panel.append(node('h3','Journal notes'),list);
        list.append(...notes.map(({symbol,note})=>node('p',(symbol?symbol+' · ':'')+note,'n-in ws-list-card')));
        paginate(list,'Daily notes');
      }
      if(activeDay<=data.today) {
        const report=node('a','Open day report','btn btn-primary');
        report.href='/reports?'+new URLSearchParams({date:activeDay});
        panel.append(report);
      }
    }

    async function selectDay(day) {
      const version=++dayVersion;
      activeDay=day;dayData=undefined;marketHours=undefined;dayError=false;paintDay();
      if (day>=new Date(Date.parse(data.today)-34*86400000).toISOString().slice(0,10)
        && day<=new Date(Date.parse(data.today)+14*86400000).toISOString().slice(0,10)) {
        void loadDay(day,true).then((next)=>{
          if(version===dayVersion){marketHours=next.marketHours;paintDay();}
        }).catch(()=>{});
      }
      try {
        const next=day>data.today?{trades:[],notes:[]}:await loadDay(day,false);
        if(version!==dayVersion)return;
        dayData=next;
      } catch {
        if(version!==dayVersion)return;
        dayError=true;
      }
      paintDay();
    }
    function paintEventMarkers() {
      const dates=new Set(feed?.events.filter((event)=>['economic','earnings','dividend','holiday','expiry'].includes(event.kind) || isDollarNews(event)).map(dayOf));
      const usdDates=new Set(feed?.events.filter(isDollarNews).map(dayOf));
      for(const button of page.querySelectorAll('[data-day]')) {
        const hasEvent=dates.has(button.dataset.day);
        const hasUsd=usdDates.has(button.dataset.day);
        button.classList.toggle('calendar-has-event',hasEvent);
        button.classList.toggle('calendar-has-usd',hasUsd);
        button.querySelector('.calendar-usd-marker')?.remove();
        if (hasUsd) {
          const icon = node('span', '$', 'calendar-usd-marker');
          icon.title = 'USD high-impact news';
          icon.setAttribute('aria-hidden', 'true');
          button.append(icon);
        }
        button.setAttribute('aria-label',button.title+(hasUsd?' · USD news':hasEvent?' · Market events':''));
      }
    }
    const paintCalendar=bindTradingCalendar(page,{
      loadCalendar,
      loadCalendarMonth:(month)=>request('/api/calendar/month?'+query({month,includeNews:'1'}),'GET'),
      loadCalendarDay:loadDay,
      onDaySelected:selectDay,
      onMonthRendered:paintEventMarkers,
      renderTrades:(container,trades,empty)=>{
        container.replaceChildren();
        if(!trades.length){container.append(node('p',empty,'ws-empty'));return;}
        const list=node('ul','','dash-agenda-list');
        for(const trade of trades){
          const row=node('li','','n-in'), body=node('div');
          body.append(node('strong',trade.symbol),node('small',trade.result===null?'Open':signedR(trade.result)));
          row.append(body);list.append(row);
        }
        container.append(list);
      },
    });
    paintCalendar({day:data.today});
    filter.onchange=()=>{paintCalendar({day:data.today});if(activeDay)selectDay(activeDay);};
    economic.textContent=corporate.textContent='Loading connected feeds…';
    const monday = Date.parse(data.today)-((new Date(data.today).getUTCDay()+6)%7)*86400000;
    const first = new Date(monday).toISOString().slice(0,10);
    const end = new Date(monday+6*86400000).toISOString().slice(0,10);
    function paintFeeds() {
      if (!feed) return;
      const {events,sources}=feed;
      const releases=events.filter((event)=>event.kind==='economic' && dayOf(event)>=first && dayOf(event)<=end &&
        (selectedImpact==='all'||event.impact===3)).sort((a,b)=>(a.at??a.date).localeCompare(b.at??b.date));
      const headlines=events.filter((event)=>['news','catalyst','earnings','dividend'].includes(event.kind) && dayOf(event)<=data.today &&
        (selectedCountry==='all'||(selectedCountry==='india'?event.country==='India':event.country&&event.country!=='India')))
        .sort((a,b)=>(b.at??b.date).localeCompare(a.at??a.date));
      economic.replaceChildren(...releases.map(eventCard));
      corporate.replaceChildren(...headlines.map(eventCard));
      paginate(economic,'Weekly releases',5,selectedImpact);
      paginate(corporate,'Market news',5,selectedCountry);
      if(!releases.length) economic.textContent=['bea','economic'].some((key)=>sources[key]?.status==='live')
        ? 'No matching releases in the connected feeds this week.' : 'Economic releases are temporarily unavailable.';
      if(!headlines.length) corporate.textContent='No matching headlines from the connected feeds.';
    }
    for(const button of page.querySelectorAll('[data-event-impact],[data-news-country]')){
      button.addEventListener('click',()=>{
        if (button.dataset.eventImpact) selectedImpact=button.dataset.eventImpact;
        else selectedCountry=button.dataset.newsCountry;
        for (const sibling of button.parentElement.querySelectorAll('button')) sibling.setAttribute('aria-pressed',String(sibling===button));
        paintFeeds();
      });
    }
    async function refreshFeeds() {
      try { feed=await loadCalendar();feedFailed=false;paintFeeds();paintEventMarkers(); }
      catch { feedFailed=true;if(!feed)economic.textContent=corporate.textContent='Market feeds could not load.'; }
      paintDay();
    }
    void refreshFeeds();
    const refresh=setInterval(()=>{if(!page.isConnected)clearInterval(refresh);else if(!document.hidden)void refreshFeeds();},300000);
    window.addEventListener('pagehide',()=>clearInterval(refresh),{once:true});
  },
};
