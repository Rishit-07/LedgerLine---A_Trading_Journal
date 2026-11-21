import { streakChip, paintStreakChip } from './streak-chip.js';
import dashboardMarkup from './dashboard.html?raw';
import { bindPageTheme, mountPage } from './shared.js';
import '@fontsource/instrument-serif/latin-400.css';
import './dashboard.css';
import './workspace.css';

export function prepareTradingShell(template) {
  const toolbar = template.content.querySelector('.dash-toolbar');
  const limit = template.content.querySelector('.dash-side-limit');
  limit.hidden = true;
  const actions = toolbar.querySelector('.dash-actions');
  actions.insertAdjacentHTML('afterbegin', streakChip);
  const avatar = template.content.querySelector('.dash-avatar').cloneNode(true);
  const profile = document.createElement('a');
  profile.className = 'n-btn n-out workspace-profile';
  profile.href = '/profile';
  profile.setAttribute('aria-label','Open your profile');
  profile.append(avatar);
  actions.append(profile);
  return toolbar;
}

export function bindToolbarStreak(page, request) {
  const trigger=page.querySelector('[data-workspace-streak]');
  let panel, loading, state;
  trigger.setAttribute('aria-haspopup','dialog');
  trigger.addEventListener('click',async event=>{
    if(event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    try {
      loading ??= import('./streak-panel.js');
      const {bindStreakDialog,streakPanelMarkup}=await loading;
      if(!panel) {
        page.insertAdjacentHTML('beforeend',streakPanelMarkup);
        panel=bindStreakDialog(page,{request,getState:()=>state,onState:next=>{
          state=next;paintStreakChip(page,next.current);panel.paintState(next);
          page.dispatchEvent(new CustomEvent('toolbar-streak',{detail:next}));
        }});
      }
      panel.open();
    } catch {location.assign(trigger.href);}
  });
}

export function paintTradingShell(page, dashboard, streak = dashboard.streak) {
  paintStreakChip(page,streak);
  const limit = page.querySelector('.dash-side-limit');
  if (!limit || !Number.isFinite(dashboard.dailyLoss) || !(dashboard.dailyLossLimit > 0)) return;
  const meter = limit.querySelector('progress');
  meter.max = dashboard.dailyLossLimit;
  meter.value = dashboard.dailyLoss;
  limit.querySelector('strong').textContent = new Intl.NumberFormat('en-IN',{maximumFractionDigits:2}).format(dashboard.dailyLoss)
    + 'R of ' + dashboard.dailyLossLimit + 'R used';
  limit.hidden = false;
}

export function bindWorkspaceAccount(page, { name, photoUrl, signOut, status }) {
  const account = page.querySelector('[data-dash-account]');
  const trigger = account.querySelector('[data-account-trigger]');
  const links = account.querySelector('nav');
  const displayName = name?.trim() || 'Your account';
  account.querySelector('[data-account-name]').textContent = displayName;
  const initials = displayName.split(/\s+/).slice(0, 2).map((word) => Array.from(word)[0]).join('').toLocaleUpperCase();
  for(const label of page.querySelectorAll('[data-account-initials]')) label.textContent=initials;
  if (typeof photoUrl === 'string' && /^https:\/\//i.test(photoUrl)) {
    for(const photo of page.querySelectorAll('[data-account-photo]')){
      photo.addEventListener('load', () => { photo.hidden = false; }, { once: true });
      photo.src = photoUrl;
    }
  }
  function toggle(open) {
    trigger.setAttribute('aria-expanded', String(open));
    links.hidden = !open;
  }
  trigger.addEventListener('click', () => toggle(links.hidden));
  account.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape' || links.hidden) return;
    event.preventDefault();
    toggle(false);
    trigger.focus();
  });
  account.addEventListener('focusout', (event) => { if (!account.contains(event.relatedTarget)) toggle(false); });
  page.addEventListener('pointerdown', (event) => { if (!account.contains(event.target)) toggle(false); });
  const signOutButton = account.querySelector('[data-sign-out]');
  signOutButton.addEventListener('click', async () => {
    signOutButton.disabled = true;
    try { await signOut(); location.replace('/'); }
    catch { status.textContent = 'Unable to sign out. Try again.'; signOutButton.disabled = false; }
  });
}

export function mountWorkspace(landing, { mode, title, description, content, action = '', name, photoUrl, signOut }) {
  const template = document.createElement('template');
  template.innerHTML = dashboardMarkup.trim();
  const sidebar = template.content.querySelector('.dash-sidebar');
  const trade = sidebar.querySelector('[data-log-trade]');
  const logLink = document.createElement('a');
  logLink.href = '/dashboard#log-trade';
  logLink.className = trade.className;
  logLink.innerHTML = trade.innerHTML;
  trade.replaceWith(logLink);
  for (const link of sidebar.querySelectorAll('a[aria-current]')) {
    link.removeAttribute('aria-current');
    link.classList.remove('n-in');
  }
  const active = sidebar.querySelector('a[href="/' + mode + '"]');
  active?.classList.add('n-in');
  active?.setAttribute('aria-current', 'page');
  const toolbar = prepareTradingShell(template, mode);
  const searchDialog = template.content.querySelector('[data-search-dialog]');
  document.title = title + ' — Ledgerline';
  const page = mountPage(landing, `<div class="n-root dashboard-page workspace-page" data-workspace-mode="${mode}">
    ${sidebar.outerHTML}
    <main class="dash-content workspace-content">
      ${toolbar.outerHTML}
      <header class="workspace-heading"><div><h1>${title}</h1><p>${description}</p></div>${action}</header>
      <p class="dash-status" data-workspace-status role="status"></p>
      ${content}
    </main>${searchDialog.outerHTML}
  </div>`);
  bindPageTheme(page);
  bindWorkspaceAccount(page, { name, photoUrl, signOut, status: page.querySelector('[data-workspace-status]') });
  const menu = page.querySelector('[data-dash-menu]');
  menu.addEventListener('click', () => menu.setAttribute('aria-expanded', String(page.toggleAttribute('data-menu-open'))));
  bindWorkspaceSearch(page);
  return page;
}

export function bindWorkspaceSearch(page) {
  const dialog=page.querySelector('[data-search-dialog]');
  const input=dialog.querySelector('input');
  const results=dialog.querySelector('[data-search-results]');
  const links=[...page.querySelectorAll('.dash-navigation a,.dash-account-popover a')];
  function render(){
    const term=input.value.toLowerCase().trim();
    results.replaceChildren(...links.filter((link)=>link.textContent.toLowerCase().includes(term)).map((source)=>{
      const result=document.createElement('a');
      result.className='n-out';
      result.href=source.href;
      result.textContent=source.textContent.trim();
      return result;
    }));
    if(!results.children.length)results.textContent='No matching pages.';
  }
  function open(){input.value='';render();dialog.showModal();input.focus();}
  page.querySelector('[data-dash-jump]').addEventListener('click',open);
  dialog.querySelector('[data-close-jump]').addEventListener('click',()=>dialog.close());
  input.addEventListener('input',render);
  input.addEventListener('keydown',(event)=>{if(event.key==='Enter')results.querySelector('a')?.click();});
  page.addEventListener('keydown',(event)=>{
    if(!(event.metaKey||event.ctrlKey)||event.key.toLowerCase()!=='k'||page.querySelector('dialog[open]'))return;
    event.preventDefault();open();
  });
}
