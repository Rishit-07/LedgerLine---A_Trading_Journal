const india = 'Asia/Kolkata';
const date = new Intl.DateTimeFormat('en-IN', { timeZone: 'UTC', dateStyle: 'medium' });
const tradingDate = new Intl.DateTimeFormat('en-CA', { timeZone: india, dateStyle: 'short' });
const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });
const liveRefresh = 5 * 60_000;
const eventDay = (event) => event.date ?? tradingDate.format(new Date(event.at));
const result = (value) => value == null ? '—' : (value > 0 ? '+' : '') + number.format(value) + 'R';
const percent = (value) => value == null ? '—' : value + '%';

function element(tag, content = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = content;
  node.className = className;
  return node;
}

export function bindTradingCalendar(page, { loadCalendar, loadCalendarDay, renderTrades }) {
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
  let model;
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

  function paintMarkers() {
    const marked = new Map();
    for (const event of feed?.events ?? []) {
      const key = eventDay(event);
      const priority = event.impact === 3 || ['holiday', 'expiry'].includes(event.kind) ? 2 : 1;
      marked.set(key, Math.max(marked.get(key) ?? 0, priority));
    }
    for (const button of grid.querySelectorAll('[data-day]')) {
      const priority = marked.get(button.dataset.day);
      button.classList.toggle('has-event', Boolean(priority));
      button.classList.toggle('has-priority-event', priority === 2);
      button.setAttribute('aria-label', button.title + (priority ? ' · Market events' : ''));
    }
  }

  function renderCalendar() {
    const days = model.days;
    const first = days[0]?.date;
    dayInput.min = first ?? model.day;
    dayInput.max = feed?.last ?? model.day;
    one('[data-calendar-range]').textContent = first ? ' · ' + date.formatRange(new Date(first), new Date(days.at(-1).date)) : '';
    const cells = first ? Array((new Date(first).getUTCDay() + 6) % 7).fill(null).concat(days) : [];
    const weeks = [];
    for (let start = 0; start < cells.length; start += 7) {
      const row = element('tr');
      for (let offset = 0; offset < 7; offset++) {
        const entry = cells[start + offset];
        const cell = element('td');
        row.append(cell);
        if (!entry) continue;
        const value = entry.result;
        const state = value == null ? '' : value > 0 ? 'is-win' : value < 0 ? 'is-loss' : 'is-flat';
        const day = new Date(entry.date);
        const button = element('button', '', 'dash-calendar-day ' + state);
        button.type = 'button';
        button.dataset.day = entry.date;
        const count = entry.count == null ? '' : ' · ' + entry.count + (entry.count === 1 ? ' close' : ' closes');
        button.title = date.format(day) + ' · ' + (value == null ? 'No closed trades' : result(value) + count);
        if (entry.date === model.day) button.setAttribute('aria-current', 'date');
        button.append(element('span', day.getUTCDate()));
        if (value != null) {
          const subtitle = element('small', result(value));
          if (entry.count != null) subtitle.append(element('span', ' / ' + entry.count, 'dash-close-count'));
          button.append(subtitle);
        }
        cell.append(button);
      }
      weeks.push(row);
    }
    grid.replaceChildren(...weeks);
    paintMarkers();
    one('[data-calendar-periods]').replaceChildren(...(model.periods ?? []).map((period) => {
      const tile = element('article', '', 'n-in');
      tile.append(element('h3', period.label), element('strong', result(period.result)), element('p',
        period.count + (period.count === 1 ? ' close' : ' closes') + ' · ' + percent(period.winRate) + ' win · ' + percent(period.adherence) + ' rules followed'));
      return tile;
    }));
  }

  function renderJournal() {
    journal.replaceChildren();
    if (upcoming) return;
    if (!dayData) {
      journal.append(element('p', dayError ? 'Unable to load this day. Choose a date to retry.' : 'Loading your trading activity…', 'dash-muted'));
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
    const summary = model.days.find(({ date }) => date === dayInput.value);
    if (summary?.count) journal.append(element('p', result(summary.result) + ' realized · ' + summary.count
      + (summary.count === 1 ? ' trade closed' : ' trades closed'), 'dash-muted'));
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
    const scope = upcoming ? (event) => eventDay(event) >= model.day : (event) => eventDay(event) === dayInput.value;
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
      paintMarkers();
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
      const next = await loadCalendarDay(day);
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
    upcoming = true;
    dayInput.value = '';
    renderJournal();
    renderAgenda();
  }

  grid.addEventListener('click', (event) => {
    const button = event.target.closest('[data-day]');
    if (!button) return;
    dialog.showModal();
    void selectDay(button.dataset.day);
    void refreshFeed();
  });
  one('[data-calendar-events]').addEventListener('click', () => {
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
    if (!document.hidden) void refreshFeed();
  }, liveRefresh);

  return (data) => {
    model = data;
    renderCalendar();
    void refreshFeed();
  };
}
