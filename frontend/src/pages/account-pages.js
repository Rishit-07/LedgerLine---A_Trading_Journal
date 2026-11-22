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
  <div class="account-identity"><div class="account-portrait" data-avatar></div><div class="account-person"><h2 data-person></h2><p data-bio></p><div class="account-tags" data-markets></div></div>
  <div class="account-card-side"><div class="account-card-stats" data-card-stats></div><div class="account-actions"><button type="button" class="n-btn n-acc dash-button" data-share-profile>Share card</button><a href="/settings#account">Edit profile</a><a data-visitor href="/portfolio">Set up sharing</a></div></div></div></article>
  <nav class="account-tabs" aria-label="Profile sections"></nav><div class="account-overview" data-profile-body></div></div>`;

function panel(title) {
  const section = node('section','','n-out account-panel');
  section.append(node('h2',title));
  return section;
}
function link(label,path) {
  const a = node('a',label,'n-btn n-out dash-button');
  a.href=path;
  return a;
}
export function paintProfile(page,state,dashboard,portfolio,name,photoUrl,friends) {
  const profile=portfolio.portfolio ?? {};
  const display=dashboard.displayName || name || 'Trader';
  page.querySelector('[data-person]').textContent=display;
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
  page.querySelector('[data-card-stats]').replaceChildren(stat('Best streak',state.best+' days'),stat('Reviews',portfolio.stats?.reviews ?? 0),stat('Badges',state.badges.length));
  const visitor=page.querySelector('[data-visitor]');
  if(profile.slug && profile.visibility!=='private') { visitor.href='/p/'+encodeURIComponent(profile.slug); visitor.textContent='View as visitor'; }
  page.querySelector('[data-share-profile]').onclick=async event=>{
    const trigger=event.currentTarget;
    trigger.disabled=true;
    try { await shareTraderCard(display,state,dashboard.traderScore?.value); }
    catch(error) { if(error.name!=='AbortError') page.querySelector('[data-streak-page-status]').textContent='Could not share the card. Try again.'; }
    finally { trigger.disabled=false; }
  };
  const tabs=page.querySelector('.account-tabs');
  const current=tabs.querySelector('[aria-pressed=true]')?.textContent ?? 'Overview';
  const body=page.querySelector('[data-profile-body]');
  const score=dashboard.traderScore;
  function view(tab) {
    for(const button of tabs.children) button.setAttribute('aria-pressed',String(button.textContent===tab));
    body.replaceChildren();
    if(tab==='Overview') {
      const process=panel('Trader Score');
      process.append(node('strong',String(score?.value ?? '—'),'account-score'));
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
        const row=node('div','','account-score-row');row.append(node('strong',friend.name || 'Ledgerline member'),node('span',friend.current+' days'));streak.append(row);
      }
      if(!active.length)streak.append(node('p','Invite a friend to keep a journal streak together.'));
      streak.append(link('Open journal streak','/dashboard#streak'));
      body.append(process,badges,streak);
    } else if(tab==='Performance') {
      body.append(stat('Win rate',rate(dashboard.winRate)),stat('Monthly booked result',signedR(dashboard.monthlyBooked)),stat('Rules followed',rate(portfolio.stats?.adherence)));
    } else {
      const activity=panel('Recent activity');
      const rows=dashboard.recentTrades ?? [];
      if(!rows.length) activity.append(node('p','Your logged trades will appear here.'));
      rows.slice(0,5).forEach(trade=>activity.append(link(trade.symbol+' · '+formatDate(trade.openedAt),'/journal?tradeId='+encodeURIComponent(trade.id))));
      activity.append(link('Trade history','/history')); body.append(activity);
    }
  }
  tabs.replaceChildren(...['Overview','Performance','Activity'].map(tab=>{const button=node('button',tab,'n-btn');button.onclick=()=>view(tab);return button;}));
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

async function shareTraderCard(name,state,score) {
  const canvas=document.createElement('canvas');
  canvas.width=1080;canvas.height=720;
  const ctx=canvas.getContext('2d');
  ctx.fillStyle='#f3f2ec';ctx.fillRect(0,0,1080,720);
  const cover=ctx.createLinearGradient(0,0,1080,250);
  cover.addColorStop(0,'#6b76ea');cover.addColorStop(1,'#3944a9');
  ctx.fillStyle=cover;ctx.fillRect(0,0,1080,220);
  ctx.fillStyle='#fff';ctx.font='bold 32px sans-serif';ctx.fillText('Ledgerline trader card',54,82);
  ctx.fillStyle='#20221f';ctx.font='bold 64px sans-serif';ctx.fillText(name,54,330,960);
  ctx.font='36px sans-serif';ctx.fillText('Trader Score   '+(score ?? '—'),54,425);
  ctx.fillText('Journal streak   '+state.current+' days',54,505);
  ctx.fillText('Level   '+state.level,54,585);
  const blob=await new Promise((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(new Error('Image unavailable')),'image/png'));
  const file=new File([blob],'ledgerline-trader-card.png',{type:'image/png'});
  if(navigator.canShare?.({files:[file]})) return navigator.share({files:[file],title:'Ledgerline trader card'});
  const url=URL.createObjectURL(blob);
  const anchor=document.createElement('a');anchor.href=url;anchor.download=file.name;anchor.click();
  setTimeout(()=>URL.revokeObjectURL(url),30000);
}
