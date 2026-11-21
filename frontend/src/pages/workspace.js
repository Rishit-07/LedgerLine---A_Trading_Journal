import { mountWorkspace, paintTradingShell, bindToolbarStreak } from './workspace-shell.js';
import { history, mistake, reports } from './workspace-analysis.js';
import { sizing, forecast } from './workspace-tools.js';
import { people } from './community.js';
import { spaces } from '../features/spaces/index.js';
import { clubs } from '../features/clubs/index.js';
import { plan } from './workspace-community.js';
import { coach } from './coach-page.js';
import { portfolio } from './workspace-portfolio.js';
import { replay } from './workspace-replay.js';
import { calendar } from './workspace-calendar.js';
import { button } from './workspace-ui.js';

const pages = { history, mistake, reports, sizing, forecast, plan, coach, people, spaces, clubs, portfolio, replay, calendar };

export async function renderWorkspace(landing, { path, request, name, photoUrl, signOut }) {
  const mode=path.slice(1);
  const screen=pages[mode];
  const endpoint='/api/workspace?' + new URLSearchParams({page:mode});
  const page=mountWorkspace(landing,{...screen,mode,name,photoUrl,signOut});
  page.classList.toggle('learn-page',['coach','replay','mistake','reports','sizing','forecast'].includes(mode));
  bindToolbarStreak(page,request);
  const status=page.querySelector('[data-workspace-status]');
  const content=[...page.querySelector('.workspace-content').children].slice(3);
  content.forEach((element)=>{element.hidden=true;});
  status.textContent='Loading your workspace…';
  try {
    const reload=()=>request(endpoint,'GET');
    const save=(details)=>request(endpoint,'POST',details);
    const data=await reload();
    if (page.querySelector('[data-workspace-streak]')) {
      paintTradingShell(page, {}, data.account.streak);
      void request('/api/dashboard','GET').then((dashboard)=>paintTradingShell(page,dashboard)).catch(()=>{});
    }
    content.forEach((element)=>{if(element.tagName!=='DIALOG')element.hidden=false;else element.removeAttribute('hidden');});
    await screen.bind(page,{data,request,save,reload});
    status.textContent='';
  } catch (error) {
    content.forEach((element)=>{element.hidden=true;});
    status.textContent=error.message;
    status.append(' ',button('Try again',()=>location.reload()));
  }
}
