import {fileAction,startedDownload} from '../components/file-actions.js';
import { paginate } from './pagination.js';
const india = 'Asia/Kolkata';
const date = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', dateStyle: 'medium' });
const monthLabel = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', month: 'long', year: 'numeric' });
const tradingDate = new Intl.DateTimeFormat('en-CA', { timeZone: india, dateStyle: 'short' });
const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const liveRefresh = 5 * 60_000;
const eventDay = (event) => event.date ?? tradingDate.format(new Date(event.at));
const result = (value) => value == null ? '—' : (value > 0 ? '+' : '') + number.format(value) + 'R';
const percent = (value) => value == null ? '—' : number.format(value) + '%';

const resultClass = (value) => value > 0 ? 'is-win' : value < 0 ? 'is-loss' : value === 0 ? 'is-flat' : '';
const tradeCount = (count) => count + (count === 1 ? ' trade' : ' trades');

function element(tag, content = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = content;
  node.className = className;
  return node;
}

export function bindTradingCalendar(page, { loadCalendar, loadCalendarMonth, loadCalendarDay, renderTrades, onDaySelected, onMonthRendered }) {
  const one = (selector) => page.querySelector(selector);
  const grid = one('[data-dash-calendar]');
  const dialog = one('[data-calendar-dialog]');
  const dayInput = one('[data-calendar-date]');
  const zone = one('[data-calendar-zone]');
  const impact = one('[data-calendar-impact]');
  const agenda = one('[data-calendar-agenda]');
  const journal = one('[data-calendar-day]');
  const agendaTitle = one('#dash-agenda-title');
  const upcomingButton = one('[data-calendar-upcoming]');
  const previousMonth = one('[data-previous-month]');
  const nextMonth = one('[data-next-month]');
  const monthStatus = one('[data-month-status]');
  let currentDay;
  let selectedMonth;
  let selectedDay;
  let summary;
  let monthRequest = 0;
  let marketView = false;
  let feed;
  let feedFailed = false;
  let dayData;
  let dayError = false;
  let upcoming;
  let dayRequest = 0;
  let lastFetch = 0;
  let pending;
  let mode = 'result';
  const modeControls = [...page.querySelectorAll('[data-calendar-mode]')];
  const exportMonth = one('[data-calendar-export]');
  fileAction(exportMonth);

  function timeFormatter() {
    return new Intl.DateTimeFormat(undefined, {
      timeZone: zone.value === 'local' ? undefined : zone.value,
      month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZoneName: 'short',
    });
  }

  function renderMonth() {
    const start = new Date(selectedMonth + '-01');
    one('[data-calendar-month]').textContent = monthLabel.format(start);
    previousMonth.disabled = selectedMonth === '0001-01';
    nextMonth.disabled = selectedMonth >= currentDay.slice(0, 7);
    if (exportMonth) exportMonth.disabled = !summary;
    modeControls.forEach((control) => control.setAttribute('aria-pressed', String(control.dataset.calendarMode === mode)));
    const metricsContainer = one('[data-calendar-metrics]');
    const workspaceMetrics = metricsContainer.hasAttribute('data-workspace-calendar-metrics');
    const dayResults = (summary?.days ?? []).map(({result})=>result).filter((value)=>value!=null);
    const countBreaks = (summary?.days ?? []).reduce((total,day)=>total+((day.checks??0)-(day.kept??0)),0);
    const metrics = workspaceMetrics ? [
      ['Net R',result(summary?.netR),resultClass(summary?.netR)],['Trading days',summary?.tradingDays ?? '—'],
      ['Win days',percent(dayResults.length?100*dayResults.filter((value)=>value>0).length/dayResults.length:null)],
      ['Best day',result(dayResults.length?Math.max(...dayResults):null),resultClass(dayResults.length?Math.max(...dayResults):null)],
      ['Worst day',result(dayResults.length?Math.min(...dayResults):null),resultClass(dayResults.length?Math.min(...dayResults):null)],
      ['Rule breaks',summary?countBreaks:'—',countBreaks?'is-loss':''],
      ['News window',summary?.newsWindow?.samples ? result(summary.newsWindow.average)+' avg' : '—',resultClass(summary?.newsWindow?.average)],
    ] : [
      ['Closed trades', summary?.tradeCount ?? '—'],
      ['Trading days', summary?.tradingDays ?? '—'],
      ['Avg. realized R', result(summary?.averageR)],
      ['Most traded asset', summary?.mostTraded ?? '—'],
      ['Win rate', percent(summary?.winRate)],
      ['Month P&L', result(summary?.netR), resultClass(summary?.netR)],
    ];
    metricsContainer.replaceChildren(...metrics.map(([label, value, state]) => {
      const tile = element('div', '', workspaceMetrics?'n-out ws-stat ws-metric':'dash-month-metric');
      tile.append(element('span', label), element('strong', value, state));
      if(label==='News window') tile.title='Average R of closed trades entered within 30 minutes of a high-impact release in the connected calendar.';
      return tile;
    }));

    const blankBefore = (start.getUTCDay() + 6) % 7;
    const next = new Date(start);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const last = new Date(next.getTime() - 86_400_000).getUTCDate();
    const daily = new Map((summary?.days ?? []).map((entry) => [entry.date, entry]));
    const restDays = new Set(summary?.restDays);
    const weeks = [];
    const weekStats = [];
    for (let offset = 0; offset < blankBefore + last; offset += 7) {
      const row = element('tr');
      let weekResult = 0;
      let weekCount = 0;
      let wins = 0;
      let checks = 0;
      let kept = 0;
      let firstDay;
      let lastDay;
      for (let weekday = 0; weekday < 7; weekday++) {
        const day = offset + weekday + 1 - blankBefore;
        const cell = element('td');
        row.append(cell);
        if (day < 1 || day > last) continue;
        const key = selectedMonth + '-' + String(day).padStart(2, '0');
        firstDay ??= key;
        lastDay = key;
        const entry = daily.get(key);
        const count = entry?.count ?? 0;
        const total = entry?.result;
        if (count) {
          weekCount += count;
          weekResult += Math.round(total * 10_000);
          wins += entry.wins ?? 0;
          checks += entry.checks ?? 0;
          kept += entry.kept ?? 0;
        }
        const adherence = entry?.checks ? 100*entry.kept/entry.checks : null;
        const state = mode === 'process' ? adherence === null ? '' : adherence === 100 ? 'is-win' : 'is-loss' : resultClass(total);
        const button = element('button', '', 'dash-calendar-day ' + state);
        if (onDaySelected) button.setAttribute('aria-pressed', String(key === selectedDay));
        button.type = 'button';
        button.dataset.day = key;
        button.disabled = !onDaySelected && key > currentDay;
        const value = mode === 'process' ? percent(adherence) : result(total);
        const opened = entry?.opened ?? 0;
        const activity = !summary ? '' : (count ? ' · ' + value + ' · ' + count + ' closed' : '') +
          (opened ? ' · ' + opened + ' opened' : '') + (!count && !opened ? ' · No trades' : '');
        button.title = date.format(new Date(key)) + activity;
        button.setAttribute('aria-label', button.title);
        if (key === currentDay) button.setAttribute('aria-current', 'date');
        button.append(element('span', day, 'dash-date-number'));
        if (count) button.append(element('strong', value), element('small', tradeCount(count)));
        if (opened) button.append(element('small', opened + ' opened', 'dash-entry-marker'));
        if (onDaySelected && entry?.checks > entry?.kept) {
          button.append(element('span', '', 'calendar-rule-marker'));
          button.title += ' · Rules broken';
        }
        if (onDaySelected && restDays.has(key)) {
          button.append(element('span', '', 'calendar-rest-marker'));
          button.title += ' · Rest day';
        }
        cell.append(button);
      }
      const weekTotal = summary ? weekResult / 10_000 : null;
      const weekly = element('td', '', 'dash-week-cell');
      const processRate = checks ? 100 * kept / checks : null;
      const weekClass = mode === 'process' ? processRate === null ? '' : processRate === 100 ? 'is-win' : 'is-loss'
        : resultClass(weekCount ? weekTotal : null);
      const tile = element('div', '', 'dash-calendar-week ' + weekClass);
      tile.append(element('strong', mode === 'process' ? percent(processRate) : result(weekTotal)));
      if (summary) tile.append(element('small', tradeCount(weekCount)));
      weekly.append(tile);
      row.append(weekly);
      weeks.push(row);
      if (weekCount) weekStats.push([
        date.formatRange(new Date(firstDay), new Date(lastDay)), wins * 100 / weekCount, checks ? kept * 100 / checks : null,
      ]);
    }
    grid.replaceChildren(...weeks);
    onMonthRendered?.();
    one('[data-calendar-rollups]').hidden = !summary?.tradeCount;
    one('[data-calendar-rollup-list]').replaceChildren(...[
      ['Month total', summary?.winRate, summary?.adherence], ...weekStats,
    ].map(([label, winRate, adherence]) => {
      const item = element('li');
      item.append(element('strong', label), element('span', percent(winRate) + ' win rate · ' + percent(adherence) + ' rules followed'));
      return item;
    }));
  }

  async function selectMonth(month, refresh = false) {
    const request = ++monthRequest;
    if (!refresh) summary = undefined;
    selectedMonth = month;
    renderMonth();
    monthStatus.textContent = 'Loading journal results…';
    try {
      const updated = await loadCalendarMonth(month);
      if (request !== monthRequest) return;
      summary = updated;
      renderMonth();
      monthStatus.textContent = '';
    } catch {
      if (request !== monthRequest) return;
      const retry = element('button', 'Try again', 'btn btn-secondary');
      retry.type = 'button';
      retry.addEventListener('click', () => void selectMonth(month, true));
      monthStatus.replaceChildren(element('span', 'Monthly results are unavailable. '), retry);
    }
  }

  function stepMonth(step) {
    const target = new Date(selectedMonth + '-01');
    target.setUTCMonth(target.getUTCMonth() + step);
    void selectMonth(target.toISOString().slice(0, 7));
  }
  previousMonth.addEventListener('click', () => stepMonth(-1));
  nextMonth.addEventListener('click', () => {
    stepMonth(1);
    if (nextMonth.disabled) previousMonth.focus();
  });
  modeControls.forEach((control) => control.addEventListener('click', () => {
    if (!selectedMonth) return;
    mode = control.dataset.calendarMode;
    renderMonth();
  }));
  one('[data-calendar-today]')?.addEventListener('click', async () => {
    if (!currentDay) return;
    const month = currentDay.slice(0,7);
    if (month !== selectedMonth) await selectMonth(month);
    one('[data-day][aria-current=date]')?.click();
  });
  exportMonth?.addEventListener('click', () => {
    if (!summary) return;
    const lines = [['Date','Opened','Closed','Result R','Rules checked','Rules kept'], ...summary.days.map((entry) =>
      [entry.date,entry.opened,entry.count,entry.result,entry.checks,entry.kept])];
    const file = URL.createObjectURL(new Blob([lines.map((line) => line.join(',')).join('\r\n')],{type:'text/csv'}));
    const link = element('a');
    link.href = file; link.download = 'ledgerline-calendar-' + selectedMonth + '.csv'; link.click();startedDownload(exportMonth);
    setTimeout(() => URL.revokeObjectURL(file),1000);
  });

  function renderJournal() {
    journal.replaceChildren();
    if (marketView) return;
    if (!dayData) {
      journal.append(element('p', dayError ? 'Unable to load this day. Reopen it to retry.' : 'Loading your trading activity…', 'dash-muted'));
      return;
    }
    const formatTime = timeFormatter();
    const trades = element('div');
    renderTrades(trades, dayData.trades, 'No trades opened or closed on this date.');
    const rows = trades.querySelectorAll('li > div');
    dayData.trades.forEach((trade, index) => {
      if (trade.setup) rows[index]?.append(element('small', 'Setup ' + trade.setup));
      const fills = [trade.qty == null ? '' : 'Qty ' + trade.qty, trade.entry == null ? '' : 'Entry ' + trade.entry,
        trade.exit == null ? '' : 'Exit ' + trade.exit].filter(Boolean);
      if (fills.length) rows[index]?.append(element('small', fills.join(' · ')));
      rows[index]?.append(element('small', 'Opened ' + formatTime.format(new Date(trade.openedAt))));
      if (trade.closedAt) rows[index]?.append(element('small', 'Closed ' + formatTime.format(new Date(trade.closedAt))));
    });
    journal.append(element('h3', 'Trading activity'));
    const closed = dayData.trades.filter(({ closedAt }) => closedAt && tradingDate.format(new Date(closedAt)) === dayInput.value);
    if (closed.length) {
      const net = closed.reduce((sum, trade) => sum + Math.round(trade.result * 10_000), 0) / 10_000;
      journal.append(element('p', result(net) + ' realized · ' + tradeCount(closed.length) + ' closed', 'dash-muted'));
    }
    journal.append(trades);
    if(trades.querySelector('ul'))paginate(trades.querySelector('ul'),'Daily trades');
    const report = element('a','Open day report','btn btn-secondary');
    report.href = '/reports?' + new URLSearchParams({date:dayInput.value});
    journal.append(report);
    if (dayData.notes.length) {
      const notes = element('ul', '', 'dash-agenda-list');
      for (const note of dayData.notes) {
        const row = element('li', '', 'n-in');
        if (note.symbol) row.append(element('strong', note.symbol));
        if (note.mood) row.append(element('small', 'Feeling · ' + note.mood));
        if (note.note) row.append(element('p', note.note));
        if (note.tags.length) row.append(element('small', note.tags.join(' · ')));
        notes.append(row);
      }
      journal.append(element('h3', 'Journal notes'), notes);
      paginate(notes,'Journal notes');
    }
  }

  function eventRow(event, formatTime) {
    const row = element('li', '', 'n-in');
    const levels = { 1: 'Low impact', 2: 'Medium impact', 3: 'High impact' };
    const agendaDate = event.at ? formatTime.format(new Date(event.at)) : date.format(new Date(event.date));
    const details = [agendaDate, event.country, event.kind === 'catalyst' ? event.symbol : null, levels[event.impact], event.source];
    if (event.type) details.push(event.type.toLowerCase().replaceAll('_', ' '));
    if (event.closed?.length) details.push('Closed ' + event.closed.join(', '));
    row.append(element('strong', event.title), element('small', details.filter(Boolean).join(' · ')));
    if (event.actual || event.forecast) row.append(element('small', 'Expected ' + (event.forecast || '—') + ' · Actual ' + (event.actual || '—')));
    for (const { exchange, opensAt, closesAt } of event.sessions ?? []) {
      if (opensAt && closesAt) row.append(element('small', exchange + ' · ' + formatTime.format(new Date(opensAt)) + ' – ' + formatTime.format(new Date(closesAt))));
    }
    if (event.impact === 3) row.classList.add('is-high-impact');
    return row;
  }

  function renderAgenda() {
    if (!marketView) return;
    const formatTime = timeFormatter();
    agenda.replaceChildren();
    agendaTitle.textContent = upcoming ? 'Upcoming market events' : 'Market events';
    upcomingButton.setAttribute('aria-pressed', String(upcoming));
    if (!upcoming) {
      const hours = dayData?.marketHours;
      if (hours?.status === 'live' || hours?.status === 'published') {
        const list = element('ul', '', 'dash-agenda-list');
        for (const { exchange, opensAt, closesAt } of hours.data) {
          list.append(element('li', exchange + ' · ' + formatTime.format(new Date(opensAt)) + ' – ' + formatTime.format(new Date(closesAt)), 'n-in'));
        }
        agenda.append(element('h4', hours.status === 'published' ? 'Scheduled exchange hours' : 'Exchange hours'));
        if (hours.data.length) agenda.append(list);
        else if (!hours.specialHoursUnlisted) agenda.append(element('p', 'No trading sessions listed for this date.', 'dash-muted'));
        if (hours.specialHoursUnlisted) agenda.append(element('p', 'A special session is listed without published hours in this calendar.', 'dash-muted'));
      } else if (hours) {
        agenda.append(element('p', hours.status === 'not-configured' ? 'Live exchange hours are not connected.' : 'Exchange hours are temporarily unavailable.', 'dash-muted'));
      }
    }
    if (!feed) {
      agenda.append(element('p', feedFailed ? 'Live calendar sources are temporarily unavailable.' : 'Loading live market events…', 'dash-muted'));
      return;
    }
    if (feedFailed) agenda.append(element('p', 'Refresh failed. Showing the last available feed.', 'dash-muted'));
    const scope = upcoming ? (event) => eventDay(event) >= currentDay : (event) => eventDay(event) === dayInput.value;
    const events = feed.events.filter((event) => event.kind !== 'news' && scope(event) && (event.kind !== 'economic' || impact.value === 'all' || event.impact === Number(impact.value)))
      .sort((a, b) => eventDay(a).localeCompare(eventDay(b)) || (a.at ?? '').localeCompare(b.at ?? ''));
    const list = element('ul', '', 'dash-agenda-list');
    list.append(...events.map((event) => eventRow(event, formatTime)));
    const { rbi, fed, ...agendaSources } = feed.sources;
    const live = Object.values(agendaSources).some(({ status }) => ['live', 'published'].includes(status));
    const limited = Object.values(feed.sources).some(({ status }) => ['not-configured', 'unavailable'].includes(status));
    const empty = !live ? 'No market event feeds are available right now.'
      : limited ? 'No matching events in the available feeds. Coverage is limited.'
        : 'No matching events for this selection.';
    agenda.append(events.length ? list : element('p', empty, 'dash-muted'));
    if(events.length)paginate(list,'Market events');
    const sources = { economic: 'Global economic calendar', bea: 'U.S. BEA release schedule', earnings: 'Earnings',
      dividends: 'Dividends', catalysts: 'Company and sector news', holidays: 'Exchange holidays', expiries: 'Contract expiries' };
    const updates = Object.entries(agendaSources).flatMap(([key, source]) => {
      if (source.status === 'standby') return [];
      const state = { live: () => 'updated ' + formatTime.format(new Date(source.updatedAt)),
        published: () => 'published exchange schedule', 'not-configured': () => 'not connected' }[source.status]?.() ?? 'temporarily unavailable';
      return [sources[key] + ' · ' + state];
    });
    const coverage = element('details', '', 'dash-calendar-sources dash-muted');
    coverage.append(element('summary', limited ? 'Data sources · Limited coverage' : 'Data sources'));
    const sourceList = element('ul');
    sourceList.append(...updates.map((update) => element('li', update)));
    coverage.append(sourceList);
    agenda.append(coverage);
  }

  function refreshFeed() {
    if (pending || Date.now() - lastFetch < liveRefresh) return pending;
    pending = loadCalendar().then((next) => {
      feed = next;
      feedFailed = false;
      lastFetch = Date.now();
      dayInput.max = next.last;
      dayInput.min = next.first;
    }).catch(() => { feedFailed = true; }).finally(() => {
      pending = undefined;
      if (dialog.open) renderAgenda();
    });
    return pending;
  }

  async function selectDay(day) {
    const request = ++dayRequest;
    dayData = undefined;
    dayError = false;
    upcoming = false;
    dayInput.value = day;
    renderJournal();
    renderAgenda();
    try {
      const next = await loadCalendarDay(day, marketView);
      if (request !== dayRequest) return;
      dayData = next;
    } catch {
      if (request !== dayRequest) return;
      dayError = true;
    }
    if (dialog.open) {
      renderJournal();
      renderAgenda();
    }
  }

  function showUpcoming() {
    dayRequest++;
    upcoming = true;
    dayInput.value = '';
    renderJournal();
    renderAgenda();
  }

  grid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-day]');
    if (!button || button.disabled) return;
    if (onDaySelected) {
      selectedDay = button.dataset.day;
      grid.querySelector('[aria-pressed="true"]')?.setAttribute('aria-pressed', 'false');
      button.setAttribute('aria-pressed', 'true');
      onDaySelected(selectedDay);
      return;
    }
    marketView = false;
    one('[data-calendar-controls]').hidden = true;
    one('[data-calendar-agenda-section]').hidden = true;
    one('#dash-calendar-dialog-title').textContent = date.format(new Date(button.dataset.day));
    void selectDay(button.dataset.day);
    dialog.showModal();
  });
  one('[data-calendar-events]').addEventListener('click', () => {
    marketView = true;
    one('[data-calendar-controls]').hidden = false;
    one('[data-calendar-agenda-section]').hidden = false;
    one('#dash-calendar-dialog-title').textContent = 'Market events';
    showUpcoming();
    dialog.showModal();
    void refreshFeed();
  });
  upcomingButton.addEventListener('click', showUpcoming);
  dayInput.addEventListener('change', () => {
    if (dayInput.value && dayInput.checkValidity()) void selectDay(dayInput.value);
    else showUpcoming();
  });
  zone.addEventListener('change', () => { renderJournal(); renderAgenda(); });
  impact.addEventListener('change', renderAgenda);
  const timer = setInterval(() => {
    if (!page.isConnected) return clearInterval(timer);
    if (!document.hidden && dialog.open && marketView) void refreshFeed();
  }, liveRefresh);

  return (data) => {
    currentDay = data.day;
    if (onDaySelected && !selectedDay) {
      selectedDay = currentDay;
      onDaySelected(selectedDay);
    }
    const month = selectedMonth ?? currentDay.slice(0, 7);
    void selectMonth(month, Boolean(selectedMonth));
  };
}
