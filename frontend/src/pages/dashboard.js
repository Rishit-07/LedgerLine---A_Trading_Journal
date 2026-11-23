import { streakChip, paintStreakChip } from './streak-chip.js';
import { openCloseTrade } from './close-trade.js';
import { paginate } from './pagination.js';
import { bindQuickTrade } from './quick-trade.js';
import { badgeMarkup, bindBadgeUnlock, notifyStreak } from './streak-view.js';
import { bindStreakDialog, streakPanelMarkup } from './streak-panel.js';
import { streakInviteCode } from '../streak-invite.js';
import { bindTradingCalendar } from './trading-calendar.js';
import { bindDashboardPlan } from './dashboard-plan.js';
import { bindWorkspaceAccount } from './workspace-shell.js';
import pageMarkup from './dashboard.html?raw';
import { bindPageTheme, mountPage } from './shared.js';
import '@fontsource/instrument-serif/latin-400.css';
import './dashboard.css';

const marketNames = { stocks: 'Stocks', options: 'Options', futures: 'Futures', forex: 'Forex', crypto: 'Crypto' };
const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const date = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', dateStyle: 'medium' });
const text = (tag, value, className) => {
  const element = document.createElement(tag);
  if (className) element.className = className;
  element.textContent = value;
  return element;
};
const r = (value) => value === null ? '—' : `${value > 0 ? '+' : ''}${number.format(value)}R`;
const pct = (value) => value === null ? '—' : `${number.format(value)}%`;

function tradeList(container, trades, empty, showDate = false) {
  if (!trades.length) return container.replaceChildren(text('p', empty, 'n-in dash-empty'));
  const list = text('ul', '', 'dash-trades');
  for (const trade of trades) {
    const row = text('li', '', 'n-in');
    const details = text('div', '');
    details.append(text('strong', trade.symbol), text('small', `${marketNames[trade.market]} · ${trade.side === 'long' ? 'Long' : 'Short'}`));
    if (trade.result === null && (trade.stop !== null || trade.target !== null)) {
      details.append(text('small', `Stop ${trade.stop ?? '—'} · Target ${trade.target ?? '—'}`));
    }
    if (showDate) details.append(text('small', date.format(new Date(trade.closedDay ?? trade.openedDay))));
    const view = text('a',trade.symbol);
    view.href = '/history?' + new URLSearchParams({tradeId:trade.id});
    details.querySelector('strong').replaceChildren(view);
    row.append(details);
    if (trade.result === null) {
      const close = text('button','Close trade','n-btn n-out dash-button');
      close.type = 'button';
      close.addEventListener('click',()=>close.dispatchEvent(new CustomEvent('close-position',{bubbles:true,detail:trade})));
      row.append(close);
    } else row.append(text('strong',r(trade.result),trade.result < 0 ? 'is-loss' : trade.result > 0 ? 'is-win' : ''));
    list.append(row);
  }
  container.replaceChildren(list);
}

function tradePager(container, controls, empty, showDate) {
  let trades = [];
  let page = 0;
  const previous = text('button', 'Previous', 'n-btn n-out dash-button');
  const next = text('button', 'Next', 'n-btn n-out dash-button');
  const status = text('span', '');
  status.setAttribute('role', 'status');
  previous.type = next.type = 'button';
  controls.setAttribute('role', 'group');
  controls.setAttribute('aria-label', showDate ? 'Recent trades pages' : 'Open positions pages');
  controls.append(previous, status, next);

  function render() {
    const pageCount = Math.max(1, Math.ceil(trades.length / 5));
    page = Math.min(page, pageCount - 1);
    tradeList(container, trades.slice(page * 5, page * 5 + 5), empty, showDate);
    controls.hidden = pageCount < 2;
    status.textContent = `Page ${page + 1} of ${pageCount}`;
    previous.disabled = page === 0;
    next.disabled = page === pageCount - 1;
  }

  previous.addEventListener('click', () => { page--; render(); if (previous.disabled) next.focus(); });
  next.addEventListener('click', () => { page++; render(); if (next.disabled) previous.focus(); });
  return (items, reset = false) => {
    trades = items;
    if (reset) page = 0;
    render();
  };
}

function fillDashboard(page, data, name) {
  const one = (selector) => page.querySelector(selector);
  const set = (selector, value) => { one(selector).textContent = value; };
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(new Date()));
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (data.displayName || name || '').trim().split(/\s+/)[0];
  set('#dash-greeting', firstName ? greeting+',' : greeting+'.');
  if(firstName) one('#dash-greeting').append(document.createElement('br'),firstName+'.');
  set('[data-dash-date]', `${date.format(new Date(data.day))} · IST`);
  set('[data-month-result]', r(data.monthlyBooked));
  set('[data-month-note]', data.monthlyBooked === null ? 'No closed trades this month.' : 'Realized result from your closed trades.');
  set('[data-adherence]', pct(data.rulesFollowed));
  const score = data.traderScore;
  set('[data-trader-score]', score?.value ?? '—');
  set('[data-score-detail]', score?.value == null ? 'Log a trade to see your score'
    : score.coverage < 100 ? `Of 100 · ${score.coverage}% of weights available` : 'Of 100 · Last 42 days');
  const scoreRing = one('.dash-score-ring');
  scoreRing.style.setProperty('--score-fill', (score?.value ?? 0) + '%');
  if (score?.value != null) scoreRing.setAttribute('aria-label', 'Trader Score ' + score.value + ' out of 100');
  else scoreRing.removeAttribute('aria-label');
  const lossBudget = `${number.format(data.dailyLoss)}R of ${data.dailyLossLimit}R used`;
  set('[data-loss-budget]', lossBudget);
  one('[data-loss-meter]').max = data.dailyLossLimit;
  one('[data-loss-meter]').value = data.dailyLoss;
  const hitLimit = data.dailyLoss >= data.dailyLossLimit;
  page.classList.toggle('dash-loss-limit-hit', hitLimit);
  set('[data-risk-note]', hitLimit ? 'Daily loss limit reached.' : 'Daily loss budget available.');

  one('[data-dash-kpis]').replaceChildren(...[
    ['Win rate', pct(data.winRate), 'Last 7 days'],
    ['Average per trade', r(data.average), 'Last 7 days', data.average],
    ['Max drawdown', r(data.curve.length ? data.drawdown : null), 'Last 42 days', data.drawdown],
    ['Open positions', String(data.open.length), 'Currently logged'],
  ].map(([label, value, period, signedValue]) => {
    const card = text('div', '', 'n-out dash-kpi');
    const valueClass = signedValue > 0 ? 'is-win' : signedValue < 0 ? 'is-loss' : '';
    card.append(text('span', label), text('strong', value, valueClass), text('small', period));
    return card;
  }));

  const openedToday = data.today.filter((trade) => trade.openedDay === data.day).length;
  const activity = Array.from({length:7},(_,index)=>{
    const day = new Date(data.day);
    day.setUTCDate(day.getUTCDate()-6+index);
    const key = day.toISOString().slice(0,10);
    return {day,count:(data.recentTrades ?? data.today).filter(trade=>trade.openedDay===key).length};
  });
  const maxCount = Math.max(1,...activity.map(item=>item.count));
  one('[data-entry-chart]').replaceChildren(...activity.map(({day,count})=>{
    const column=text('li','');
    const bar=text('i','');
    bar.style.height=(count/maxCount*38)+'px';
    column.title=date.format(day)+' · '+count+' opened';
    column.setAttribute('aria-label',column.title);
    column.append(text('strong',count),bar,text('small',day.toLocaleDateString('en-IN',{weekday:'short',timeZone:'UTC'})));
    return column;
  }));
  const risk = one('[data-risk-list]');
  risk.replaceChildren();
  for (const [label, value] of [['Risk per trade', pct(data.riskPerTrade)], ['Daily loss limit', lossBudget], ['Opened today / daily max', openedToday + ' / ' + data.maxTrades]]) {
    risk.append(text('dt', label), text('dd', value));
  }
  one('[data-rule-list]').replaceChildren(...data.rules.map((rule) => {
    const item = text('li', rule.text, 'n-in');
    if (rule.hard) item.append(text('small', 'Hard rule'));
    return item;
  }));
  set('[data-open-count]', data.open.length + (data.open.length === 1 ? ' open position' : ' open positions'));

}

export function renderDashboard(landing, { initial, load, name, photoUrl, save, signOut, request, loadCalendar, loadCalendarMonth, loadCalendarDay }) {
  document.title = 'Dashboard — Ledgerline';
  const page = mountPage(landing, pageMarkup);
  page.insertAdjacentHTML('beforeend', streakPanelMarkup + badgeMarkup);
  bindPageTheme(page);
  const menu = page.querySelector('[data-dash-menu]');
  menu.addEventListener('click', () => {
    const expanded = menu.getAttribute('aria-expanded') === 'true';
    menu.setAttribute('aria-expanded', String(!expanded));
    page.toggleAttribute('data-menu-open', !expanded);
  });

  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  let data = initial;
  const paintPlan = bindDashboardPlan(page, request, () => data, (plan) => { data = { ...data, plan }; });
  const recent = tradePager(page.querySelector('[data-recent-list]'), page.querySelector('[data-recent-pager]'), 'No recent trades logged.', true);
  const open = tradePager(page.querySelector('[data-open-list]'), page.querySelector('[data-open-pager]'), 'No open positions logged.', false);
  const calendar = bindTradingCalendar(page, { loadCalendar, loadCalendarMonth, loadCalendarDay, renderTrades: tradeList });
  function renderData() {
    fillDashboard(page, data, name);
    paintPlan();
    recent(data.recentTrades ?? data.today, true);
    open(data.open);
    calendar(data);
  }
  renderData();
  const breakdown = page.querySelector('[data-breakdown-list]');
  const breakdownTabs = [...page.querySelectorAll('[data-breakdown]')];
  let selectedBreakdown = 'setup';
  function fillBreakdown() {
    breakdownTabs.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.breakdown === selectedBreakdown)));
    const groups = data.breakdown[selectedBreakdown];
    if (!groups.length) return breakdown.replaceChildren(text('p', 'Close a trade to see its contribution here.', 'n-in dash-empty'));
    const list = text('ul', '', 'dash-breakdown-list');
    for (const group of groups) {
      const row = text('li', '');
      const description = text('div', '');
      description.append(text('strong', group.label), text('small', `${group.count} ${group.count === 1 ? 'trade' : 'trades'}`));
      row.append(description, text('strong', r(group.average), group.average < 0 ? 'is-loss' : group.average > 0 ? 'is-win' : ''));
      list.append(row);
    }
    breakdown.replaceChildren(list);
    paginate(list,'Performance breakdown',6);
  }
  breakdownTabs.forEach((button) => button.addEventListener('click', () => {
    selectedBreakdown = button.dataset.breakdown;
    fillBreakdown();
  }));
  fillBreakdown();
  const status = page.querySelector('[data-dash-status]');
  page.addEventListener('close-position',event=>openCloseTrade(page,event.detail,request,async()=>{
    data=await load(); renderData(); fillBreakdown(); status.textContent='Trade closed.';
    page.querySelector('[data-calendar-dialog]')?.close();
  }));
  bindWorkspaceAccount(page, { name:initial.displayName || name, photoUrl, signOut, status });
  page.querySelector('.dash-toolbar .dash-actions').insertAdjacentHTML('afterbegin',streakChip);
  paintStreakChip(page,initial.streak);
  const badge = page.querySelector('[data-open-streak]');
  const showBadge = request ? bindBadgeUnlock(page, request) : () => {};
  let streak;
  const streakDialog = request ? bindStreakDialog(page, { request, getState: () => streak, onState: applyStreak }) : null;
  function applyStreak(next) {
    streak = next;
    page.querySelector('[data-hero-level]').textContent=Number.isInteger(next.level)?'Level '+next.level:'';
    paintStreakChip(page,streak.current);
    badge.querySelector('[data-streak]').textContent = streak.current + (streak.current === 1 ? ' day' : ' days');
    if (streakDialog?.dialog.open) streakDialog.paintState(streak);
    showBadge(streak);
    notifyStreak(page,streak);
  }
  if (streakDialog) {
    badge.addEventListener('click', () => streakDialog.open());
    page.querySelector('[data-workspace-streak]').addEventListener('click',event=>{event.preventDefault();streakDialog.open();});
    const invite = streakInviteCode(location.search);
    if (invite || location.hash === '#streak') streakDialog.open(invite);
    else void request('/api/streak', 'GET').then((initialStreak) => {
      if (!streak) applyStreak(initialStreak);
    }).catch(() => { if (!streak) badge.querySelector('[data-streak]').textContent = 'View'; });
  }
  bindQuickTrade(page, {
    save, marketNames, getDashboard: () => ({ ...data, streakTimezone: streak?.timezone ?? data.streakTimezone }),
    onSaved: async (saved) => {
      if (saved?.streak) applyStreak(saved.streak);
      status.textContent = 'Trade saved.';
      try { data = await load(); renderData(); fillBreakdown(); }
      catch { status.textContent = 'Trade saved. Reload Dashboard to see the updated totals.'; }
    },
  });

  if (location.hash === '#log-trade') page.querySelector('[data-log-trade]').click();

  const jump = page.querySelector('[data-search-dialog]');
  const search = jump.querySelector('input');
  const results = jump.querySelector('[data-search-results]');
  const links = [...page.querySelectorAll('.dash-navigation a, .dash-account-popover a')];
  function filterLinks() {
    const term = search.value.trim().toLowerCase();
    const matches = links.filter((link) => link.textContent.toLowerCase().includes(term));
    results.replaceChildren(...matches.map((link) => {
      const result = text('a', link.textContent, 'n-out');
      result.href = link.href;
      return result;
    }));
    if (!matches.length) results.append(text('p', 'No matching pages.'));
  }
  function openJump() { search.value = ''; filterLinks(); jump.showModal(); search.focus(); }
  page.querySelector('[data-dash-jump]').addEventListener('click', openJump);
  jump.querySelector('[data-close-jump]').addEventListener('click', () => jump.close());
  search.addEventListener('input', filterLinks);
  search.addEventListener('keydown', (event) => { if (event.key === 'Enter') results.querySelector('a')?.click(); });
  page.addEventListener('keydown', (event) => {
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k' || page.querySelector('dialog[open]')) return;
    event.preventDefault(); openJump();
  });
}
