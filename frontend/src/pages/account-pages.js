import { openPortfolioShare } from './portfolio-share-card.js';
import { portfolioPath } from './portfolio-preferences.js';
import { communityAvatar } from './profile-picture.js';
import { node, stat, signedR, rate, formatDate } from './workspace-ui.js';
import './account-pages.css';

const thresholds = [7, 14, 30, 60, 100];
const catalog = thresholds.map(days => ({ key: 'streak-' + days, title: days + '-day streak', target: days, mark: String(days) }));
catalog.push({key:'process-cup', title:'Process Cup', target:30, mark:'Cup'});

function medal(item, earned) {
  const tile = node('span', item.mark, 'account-medal' + (earned ? ' earned' : ''));
  tile.setAttribute('aria-hidden','true');
  tile.classList.toggle('cup',item.key==='process-cup');
  return tile;
}
const shelfRows = state => catalog.map(item => ({
  ...item, earned: state.badges.find(badge => badge.key === item.key),
  progress: Math.min(item.target, item.key === 'process-cup' ? state.perfectBest ?? 0 : state.best)
}));

export const profileMarkup = `<div class="account-board"><article class="n-out account-card">
  <div class="account-banner"><svg aria-hidden="true" viewBox="0 0 1100 176" preserveAspectRatio="xMaxYMid slice"><g fill="none" stroke="white" opacity=".16" stroke-width="2"><circle cx="930" cy="150" r="60"/><circle cx="930" cy="150" r="110"/><circle cx="930" cy="150" r="165"/><circle cx="930" cy="150" r="225"/></g><path d="M0 150 C120 140 180 96 270 112 S420 60 520 84 S690 128 780 70 S980 40 1100 24" fill="none" stroke="white" stroke-opacity=".38" stroke-width="3"/></svg><strong>Ledgerline trader card</strong><div data-card-chips></div></div>
  <div class="account-identity"><div class="account-portrait" data-avatar></div><div class="account-person"><div class="account-name-line"><h2 data-person></h2><span class="n-out account-process-tag" data-process-tag hidden></span></div><small data-profile-meta></small><p data-bio></p><div class="account-tags" data-markets></div></div>
  <div class="account-card-side"><div class="account-card-stats" data-card-stats></div><div class="account-actions"><button type="button" class="btn btn-primary" data-share-profile>Share card</button><a href="/settings#account">Edit</a><a data-visitor href="/portfolio">My portfolio</a></div></div></div></article>
  <nav class="account-tabs" aria-label="Profile sections"></nav><div class="account-overview" data-profile-body></div></div>`;

function panel(title) {
  const section = node('section','','n-out account-panel');
  section.append(node('h2',title));
  return section;
}
function link(label,path) {
  const a = node('a',label,'btn btn-secondary');
  a.href=path;
  return a;
}
export function paintProfile(page,state,dashboard,portfolio,name,photoUrl,friends,battles) {
  const profile=portfolio.portfolio ?? {};
  const display=dashboard.displayName || name || 'Trader';
  page.querySelector('[data-person]').textContent=display;
  const memberSince=portfolio.memberSince?new Intl.DateTimeFormat('en-IN',{month:'short',year:'numeric'}).format(new Date(portfolio.memberSince)):'';
  page.querySelector('[data-profile-meta]').textContent=memberSince?'Member since '+memberSince:'';
  const processTag=page.querySelector('[data-process-tag]');
  processTag.hidden=dashboard.traderScore?.value==null;
  processTag.textContent='Process score · '+(dashboard.traderScore?.value ?? '');
  page.querySelector('[data-bio]').textContent=profile.about || profile.headline || '';
  const avatar=page.querySelector('[data-avatar]');
  avatar.textContent=display[0].toUpperCase();
  avatar.style.setProperty('--score',(dashboard.traderScore?.value ?? 0)+'%');
  if(photoUrl) {
    const img=document.createElement('img'); img.alt=''; img.src=photoUrl;
    img.onerror=()=>img.remove(); avatar.append(img);
  }
  avatar.append(node('small','Score '+(dashboard.traderScore?.value ?? '—')));
  page.querySelector('[data-card-chips]').replaceChildren(node('span','Level '+state.level),node('span',state.current+' day streak'));
  page.querySelector('[data-markets]').replaceChildren(...(dashboard.markets ?? []).map(m=>node('span',m)));
  page.querySelector('[data-card-stats]').replaceChildren(stat('Followers','—'),stat('Following','—'),stat('Clubs',portfolio.clubCount ?? 0));
  const visitor=page.querySelector('[data-visitor]');
  visitor.href=profile.slug?portfolioPath(profile.slug):'/portfolio';
  page.querySelector('[data-share-profile]').onclick=()=>openPortfolioShare(profile,{...portfolio.stats,streak:state.current,avatar:portfolio.avatar},display);
  const tabs=page.querySelector('.account-tabs');
  const current=tabs.querySelector('[aria-pressed=true]')?.textContent ?? 'Overview';
  const body=page.querySelector('[data-profile-body]');
  const score=dashboard.traderScore;
  function view(tab) {
    for(const button of tabs.children) button.setAttribute('aria-pressed',String(button.textContent===tab));
    body.replaceChildren();
    body.dataset.profileTab=tab;
    if(tab==='Overview') {
      const process=panel('Trader Score');
      process.append(node('strong',String(score?.value ?? '—'),'account-score'));
      if(score?.value==null)process.append(node('p','Log and review trades to see your Trader Score.'));
      if(score?.components?.length===5) process.append(scorePlot(score.components));
      for(const component of score?.components ?? []) {
        const row=node('div','','account-score-row');
        row.append(node('span',component.label),node('b',component.value==null?'—':component.value+'%'));
        process.append(row);
      }
      const badges=panel('Badges');
      const preview=node('div','','account-tags');
      shelfRows(state).slice(0,3).forEach(item=>preview.append(medal(item,!!item.earned)));
      badges.append(preview,node('p',state.badges.length+' earned'),link('View shelf','/badges'));
      const streak=panel('Streaks together');
      const active=friends?.friends?.filter(item=>item.status==='active') ?? [];
      for(const friend of active.slice(0,3)){
        const row=node('div','','account-score-row account-friend-row');row.append(communityAvatar(friend.name,friend.avatar),node('strong',friend.name || 'Ledgerline member'),node('span',friend.current+' days'));streak.append(row);
      }
      if(!active.length)streak.append(node('p','Invite a friend to keep a journal streak together.'));
      streak.append(link('Open journal streak','/dashboard#streak'));
      const challenges=panel('Streak battles');
      challenges.classList.add('profile-challenges');
      if(battles?.length){
        for(const battle of battles.slice(0,4)){
          const row=node('div','','account-score-row');
          row.append(node('strong',battle.name || 'Ledgerline member'),node('span',battle.lengthDays+' days · '+({won:'Won',lost:'Lost',tie:'Tie'}[battle.result]??'In progress')));
          challenges.append(row);
        }
      }else challenges.append(node('p',battles?'Challenge a friend to see who can keep their streak going.':'No streak battles to show.'));
      challenges.append(link('Challenge a friend','/dashboard#streak'));
      body.append(process,badges,streak,challenges);
    } else if(tab==='Performance') {
      const totals=node('div','','account-summary profile-totals');
      totals.append(stat('Net result',signedR(dashboard.monthlyBooked),'This month'),stat('Win rate',rate(dashboard.winRate)),stat('Rules followed',rate(portfolio.stats?.adherence)),stat('Max drawdown',dashboard.curve?.length?signedR(dashboard.drawdown):'—'));
      const monthly=panel('Monthly result');
      const months=new Map();
      let equity=0;
      for(const point of dashboard.curve ?? []){
        const month=point.date.slice(0,7);
        months.set(month,(months.get(month)??0)+point.equity-equity);
        equity=point.equity;
      }
      if(!months.size)monthly.append(node('p','Closed trades will appear here.'));
      for(const [month,r] of [...months].slice(-6)){
        const row=node('div','','account-score-row');row.append(node('span',month),node('strong',signedR(r)));monthly.append(row);
      }
      const setup=panel('Setup mix'),weekday=panel('Weekday edge');
      for(const [box,rows] of [[setup,dashboard.breakdown?.setup],[weekday,dashboard.breakdown?.weekday]]){
        if(!rows?.length)box.append(node('p','Close a trade to see this breakdown.'));
        for(const item of (rows??[]).slice(0,6)){
          const row=node('div','','account-score-row');
          row.append(node('span',item.label),node('strong',signedR(item.average)));
          box.append(row);
        }
      }
      body.append(totals,monthly,setup,weekday);
    } else {
      const activity=panel('Recent activity');
      const rows=(dashboard.recentTrades ?? []).filter(trade=>trade.closedAt);
      if(!rows.length) activity.append(node('p','Your logged trades will appear here.'));
      rows.slice(0,5).forEach(trade=>activity.append(link(trade.symbol+' · '+formatDate(trade.openedAt),'/journal?tradeId='+encodeURIComponent(trade.id))));
      activity.append(link('Trade history','/history')); body.append(activity);
    }
  }
  tabs.replaceChildren(...['Overview','Performance','Activity'].map(tab=>{const button=node('button',tab,'btn btn-ghost');button.onclick=()=>view(tab);return button;}));
  view(current);
}

function scorePlot(components) {
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  svg.setAttribute('viewBox','0 0 180 160');
  svg.setAttribute('class','account-performance-plot');
  svg.setAttribute('aria-hidden','true');
  const polygon=(values,fill,stroke)=>{
    const shape=document.createElementNS(svg.namespaceURI,'polygon');
    const points=values.map((v,i)=>{
      const angle=i*Math.PI*2/5-Math.PI/2;
      return [90+v*.7*Math.cos(angle),80+v*.7*Math.sin(angle)].join(',');
    });
    shape.setAttribute('points',points.join(' '));shape.setAttribute('fill',fill);shape.setAttribute('stroke',stroke);svg.append(shape);
  };
  for(const limit of [25,50,75,100]) polygon(Array(5).fill(limit),'none','var(--track)');
  if(components.every(c=>c.value!==null)) polygon(components.map(c=>c.value),'var(--glow)','var(--acc)');
  else components.forEach((c,i)=>{
    if(c.value==null)return;
    const angle=i*Math.PI*2/5-Math.PI/2;
    const mark=document.createElementNS(svg.namespaceURI,'circle');
    mark.setAttribute('cx',90+c.value*.7*Math.cos(angle));mark.setAttribute('cy',80+c.value*.7*Math.sin(angle));
    mark.setAttribute('r',4);mark.setAttribute('fill','var(--acc)');svg.append(mark);
  });
  return svg;
}
