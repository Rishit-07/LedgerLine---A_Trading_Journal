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

export function bindTradingCalendar(page, { loadCalendar, loadCalendarMonth, loadCalendarDay, renderTrades }) {
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
    const metrics = [
      ['Closed trades', summary?.tradeCount ?? '—'],
      ['Trading days', summary?.tradingDays ?? '—'],
      ['Avg. realized R', result(summary?.averageR)],
      ['Most traded asset', summary?.mostTraded ?? '—'],
      ['Win rate', percent(summary?.winRate)],
      ['Month P&L', result(summary?.netR), resultClass(summary?.netR)],
    ];
    one('[data-calendar-metrics]').replaceChildren(...metrics.map(([label, value, state]) => {
      const tile = element('div', '', 'dash-month-metric');
      tile.append(element('span', label), element('strong', value, state));
      return tile;
    }));

    const blankBefore = (start.getUTCDay() + 6) % 7;
    const next = new Date(start);
    next.setUTCMonth(next.getUTCMonth() + 1);
    const last = new Date(next.getTime() - 86_400_000).getUTCDate();
    const daily = new Map((summary?.days ?? []).map((entry) => [entry.date, entry]));
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
        const button = element('button', '', 'dash-calendar-day ' + resultClass(total));
        button.type = 'button';
        button.dataset.day = key;
        button.disabled = key > currentDay;
        const activity = !summary ? '' : count ? ' · ' + result(total) + ' · ' + tradeCount(count) : ' · No closed trades';
        button.title = date.format(new Date(key)) + activity;
        button.setAttribute('aria-label', button.title);
        if (key === currentDay) button.setAttribute('aria-current', 'date');
        button.append(element('span', day, 'dash-date-number'));
        if (count) button.append(element('strong', result(total)), element('small', tradeCount(count)));
        cell.append(button);
      }
      const weekTotal = summary ? weekResult / 10_000 : null;
      const weekly = element('td', '', 'dash-week-cell');
      const tile = element('div', '', 'dash-calendar-week ' + resultClass(weekCount ? weekTotal : null));
      tile.append(element('strong', result(weekTotal)));
      if (summary) tile.append(element('small', tradeCount(weekCount)));
      weekly.append(tile);
      row.append(weekly);
      weeks.push(row);
      if (weekCount) weekStats.push([
        date.formatRange(new Date(firstDay), new Date(lastDay)), wins * 100 / weekCount, checks ? kept * 100 / checks : null,
      ]);
    }
    grid.replaceChildren(...weeks);
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
      const retry = element('button', 'Try again', 'n-btn n-out dash-button');
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
    if (dayData.notes.length) {
      const notes = element('ul', '', 'dash-agenda-list');
      for (const note of dayData.notes) {
        const row = element('li', '', 'n-in');
        if (note.symbol) row.append(element('strong', note.symbol));
        row.append(element('p', note.note));
        if (note.tags.length) row.append(element('small', note.tags.join(' · ')));
        notes.append(row);
      }
      journal.append(element('h3', 'Journal notes'), notes);
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
      if (hours?.status === 'live') {
        const list = element('ul', '', 'dash-agenda-list');
        for (const { exchange, opensAt, closesAt } of hours.data) {
          list.append(element('li', exchange + ' · ' + formatTime.format(new Date(opensAt)) + ' – ' + formatTime.format(new Date(closesAt)), 'n-in'));
        }
        agenda.append(element('h4', 'Exchange hours'), hours.data.length ? list : element('p', 'Upstox lists no sessions for this day.', 'dash-muted'));
      } else if (hours) {
        agenda.append(element('p', hours.status === 'not-configured' ? 'Exchange-hours feed is awaiting connection.' : 'Exchange hours are temporarily unavailable.', 'dash-muted'));
      }
    }
    if (!feed) {
      agenda.append(element('p', feedFailed ? 'Live calendar sources are temporarily unavailable.' : 'Loading live market events…', 'dash-muted'));
      return;
    }
    if (feedFailed) agenda.append(element('p', 'Refresh failed. Showing the last available feed.', 'dash-muted'));
    const scope = upcoming ? (event) => eventDay(event) >= currentDay : (event) => eventDay(event) === dayInput.value;
    const events = feed.events.filter((event) => scope(event) && (event.kind !== 'economic' || impact.value === 'all' || event.impact === Number(impact.value)))
      .sort((a, b) => eventDay(a).localeCompare(eventDay(b)) || (a.at ?? '').localeCompare(b.at ?? ''));
    const list = element('ul', '', 'dash-agenda-list');
    list.append(...events.map((event) => eventRow(event, formatTime)));
    agenda.append(events.length ? list : element('p', 'No matching events in connected feeds.', 'dash-muted'));
    const sources = { economic: 'Global economic calendar', bea: 'U.S. BEA release schedule', earnings: 'Earnings',
      dividends: 'Dividends', catalysts: 'Company and sector news', holidays: 'Exchange holidays', expiries: 'Contract expiries' };
    const updates = Object.entries(feed.sources).flatMap(([key, source]) => {
      if (source.status === 'standby') return [];
      const state = source.status === 'live' ? 'updated ' + formatTime.format(new Date(source.updatedAt))
        : source.status === 'not-configured' ? 'awaiting connection' : 'temporarily unavailable';
      return [sources[key] + ' · ' + state];
    });
    agenda.append(element('p', updates.join(' | '), 'dash-calendar-sources dash-muted'));
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
    const month = selectedMonth ?? currentDay.slice(0, 7);
    void selectMonth(month, Boolean(selectedMonth));
  };
}
