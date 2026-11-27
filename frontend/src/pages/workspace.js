import {billing} from '../features/billing/page.js';
import { mountWorkspace, paintTradingShell, bindToolbarStreak } from './workspace-shell.js';
import { history, mistake } from './workspace-analysis.js';
import { reports } from '../features/reports/index.js';
import { sizing, forecast } from './workspace-tools.js';
import { people } from './community.js';
import { spaces } from '../features/spaces/index.js';
import { clubs } from '../features/clubs/index.js';
import { plan } from './workspace-community.js';
import { coach } from './coach-page.js';
import { portfolio } from './workspace-portfolio.js';
import {application} from '../features/spaces/application.js';
import {reviewerPage} from '../features/spaces/reviewer.js';
import {ticketsPage} from '../features/tickets/user.js';
import {ticketAdminPage} from '../features/tickets/admin.js';
import {newsletterAdminPage} from '../features/newsletter/admin.js';
import {mentorshipPage,mentorJoinPage} from '../features/mentorship/page.js';
import {notificationsPage} from '../features/notifications/page.js';
import { calendar } from './workspace-calendar.js';
import { button } from './workspace-ui.js';
import { showSkeleton } from '../skeleton.js';

const pages = { billing, history, mistake, reports, sizing, forecast, plan, coach, people, spaces, clubs, portfolio, calendar, "mentor-verification":application,"mentor-review":reviewerPage,tickets:ticketsPage,notifications:notificationsPage,"ticket-admin":ticketAdminPage,"newsletter-admin":newsletterAdminPage,mentorship:mentorshipPage,"mentor/join":mentorJoinPage };

export async function renderWorkspace(landing, { path, request, uid, name, photoUrl, signOut }) {
  const mode=path.slice(1);
  const screen=pages[mode];
  const endpoint=screen.endpoint ?? '/api/workspace?' + new URLSearchParams({page:mode});
  const page=mountWorkspace(landing,{...screen,mode,name,photoUrl,signOut});
  page.classList.toggle('learn-page',['coach','mistake','reports','sizing','forecast'].includes(mode));
  bindToolbarStreak(page,request);
  const status=page.querySelector('[data-workspace-status]');
  const content=[...page.querySelector('.workspace-content').children].slice(3);
  content.forEach((element)=>{element.hidden=true;});
  status.textContent='Loading your workspace…';
  const hideSkeleton=showSkeleton(status,['people','clubs','spaces','mentor-review','tickets','ticket-admin','notifications','newsletter-admin','mentorship','mentor/join'].includes(mode)?'list':'cards');
  try {
    const roomId=screen.endpoint && location.pathname.split('/')[2];
    const reload=()=>request(roomId?endpoint+'?'+new URLSearchParams({id:roomId}):endpoint,'GET');
    const save=(details)=>request(endpoint,'POST',details);
    const data=await reload();
    if (page.querySelector('[data-workspace-streak]')) {
      paintTradingShell(page, {}, data.account?.streak);
      void request('/api/dashboard','GET').then((dashboard)=>paintTradingShell(page,dashboard)).catch(()=>{});
    }
    content.forEach((element)=>{if(element.tagName!=='DIALOG')element.hidden=false;else element.removeAttribute('hidden');});
    await screen.bind(page,{data,request,save,reload,uid});
    hideSkeleton();
    status.textContent='';
  } catch (error) {
    hideSkeleton();
    content.forEach((element)=>{element.hidden=true;});
    if(error.reason==='needs_plan'){
      status.textContent='';
      const lock=document.createElement('section');lock.className='plan-lock';
      const title=document.createElement('h2');title.textContent=(error.feature||'This feature')+' is part of Pro';
      const copy=document.createElement('p');copy.textContent='Your free plan keeps the journal, streaks and clubs. Pro unlocks this page, and it opens as soon as your payment is confirmed.';
      const see=document.createElement('a');see.className='btn btn-primary';see.href='/billing?from=reports';see.textContent='See plans';
      lock.append(title,copy,see);status.append(lock);return;
    }
    status.textContent=error.message;
    status.append(' ',button('Try again',()=>location.reload()));
  }
}
