import pageMarkup from './dashboard.html?raw';
import { bindPageTheme, mountPage } from './shared.js';
import '@fontsource/instrument-serif/latin-400.css';
import './dashboard.css';

const marketNames = { stocks: 'Stocks', options: 'Options', futures: 'Futures', forex: 'Forex', crypto: 'Crypto' };
const brokerNames = { zerodha: 'Zerodha', upstox: 'Upstox', 'angel-one': 'Angel One', dhan: 'Dhan', fyers: 'Fyers', csv: 'CSV import', manual: 'Add by hand' };
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
    row.append(details, text('strong', trade.result === null ? 'Open' : r(trade.result), trade.result < 0 ? 'is-loss' : trade.result > 0 ? 'is-win' : ''));
    list.append(row);
  }
  container.replaceChildren(list);
}

function fillCalendar(calendar, days, today) {
  const firstDay = days.length ? new Date(days[0].date) : null;
  const cells = firstDay ? Array((firstDay.getUTCDay() + 6) % 7).fill(null).concat(days) : [];
  const weeks = [];
  for (let start = 0; start < cells.length; start += 7) {
    const row = document.createElement('tr');
    for (let offset = 0; offset < 7; offset++) {
      const entry = cells[start + offset];
      const cell = document.createElement('td');
      row.append(cell);
      if (!entry) continue;
      const value = entry.result;
      const result = value === null ? 'No closed trades' : r(value);
      const state = value === null ? '' : value > 0 ? 'is-win' : value < 0 ? 'is-loss' : 'is-flat';
      const day = new Date(entry.date);
      const tile = text('div', '', 'dash-calendar-day ' + state);
      cell.title = date.format(day) + ' · ' + result;
      cell.setAttribute('aria-label', cell.title);
      if (entry.date === today) cell.setAttribute('aria-current', 'date');
      tile.append(text('span', day.getUTCDate()));
      if (value !== null) tile.append(text('small', result));
      cell.append(tile);
    }
    weeks.push(row);
  }
  calendar.replaceChildren(...weeks);
}

function fillDashboard(page, data, name) {
  const one = (selector) => page.querySelector(selector);
  const set = (selector, value) => { one(selector).textContent = value; };
  const hour = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(new Date()));
  const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const firstName = (data.displayName || name || '').trim().split(/\s+/)[0];
  set('#dash-greeting', firstName ? `${greeting}, ${firstName}.` : `${greeting}.`);
  set('[data-dash-date]', `${date.format(new Date(data.day))} · IST`);
  set('[data-month-result]', r(data.monthlyBooked));
  set('[data-month-note]', data.monthlyBooked === null ? 'No closed trades this month.' : 'Realized result from your closed trades.');
  set('[data-streak]', data.streak + (data.streak === 1 ? ' day' : ' days'));
  set('[data-adherence]', pct(data.rulesFollowed));
  const lossBudget = `${number.format(data.dailyLoss)}R of ${data.dailyLossLimit}R used`;
  set('[data-loss-budget]', lossBudget);
  one('[data-loss-meter]').max = data.dailyLossLimit;
  one('[data-loss-meter]').value = data.dailyLoss;
  const hitLimit = data.dailyLoss >= data.dailyLossLimit;
  page.classList.toggle('dash-loss-limit-hit', hitLimit);
  set('[data-risk-note]', hitLimit ? 'Daily loss limit reached.' : 'Daily loss budget available.');
  set('[data-plan-text]', data.plan ? (data.plan.locked ? 'Plan locked' : 'Plan in progress') : 'No plan for today yet.');
  set('[data-plan-bias]', data.plan?.bias ? ' · ' + data.plan.bias : '');

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
  fillCalendar(one('[data-dash-calendar]'), data.days, data.day);
  const range = data.days.length ? date.formatRange(new Date(data.days[0].date), new Date(data.days.at(-1).date)) : '';
  set('[data-calendar-range]', range ? ' · ' + range : '');
  set('[data-open-count]', data.open.length + (data.open.length === 1 ? ' open position' : ' open positions'));
  tradeList(one('[data-open-list]'), data.open.slice(0, 5), 'No open positions logged.');
  const extraPositions = one('[data-more-positions]');
  extraPositions.hidden = data.open.length <= 5;
  if (!extraPositions.hidden) tradeList(one('[data-extra-positions]'), data.open.slice(5));
  tradeList(one('[data-recent-list]'), data.recentTrades ?? data.today, 'No trades logged in the last 42 days.', true);
}

export function renderDashboard(landing, { initial, load, name, save, signOut }) {
  document.title = 'Dashboard — Ledgerline';
  const page = mountPage(landing, pageMarkup);
  bindPageTheme(page);
  const menu = page.querySelector('[data-dash-menu]');
  menu.addEventListener('click', () => {
    const expanded = menu.getAttribute('aria-expanded') === 'true';
    menu.setAttribute('aria-expanded', String(!expanded));
    page.toggleAttribute('data-menu-open', !expanded);
  });

  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  let data = initial;
  let requestId;
  fillDashboard(page, data, name);
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
  }
  breakdownTabs.forEach((button) => button.addEventListener('click', () => {
    selectedBreakdown = button.dataset.breakdown;
    fillBreakdown();
  }));
  fillBreakdown();
  const status = page.querySelector('[data-dash-status]');
  const signOutButton = page.querySelector('[data-sign-out]');
  signOutButton.addEventListener('click', async () => {
    signOutButton.disabled = true;
    try { await signOut(); location.replace('/'); }
    catch { status.textContent = 'Unable to sign out. Try again.'; signOutButton.disabled = false; }
  });

  const dialog = page.querySelector('[data-trade-dialog]');
  const form = dialog.querySelector('form');
  const tradeStatus = form.querySelector('[data-trade-status]');
  const saveButton = form.querySelector('button[type="submit"]');
  const resultField = form.querySelector('[data-result-field]');
  function updateClosed() {
    resultField.hidden = !form.elements.closed.checked;
    form.elements.result.disabled = resultField.hidden;
    form.elements.result.required = !resultField.hidden;
  }
  form.elements.closed.addEventListener('change', updateClosed);
  page.querySelectorAll('[data-log-trade]').forEach((button) => button.addEventListener('click', () => {
    if (!requestId) {
      form.reset();
      requestId = crypto.randomUUID();
      form.elements.market.replaceChildren(...data.markets.map((market) => new Option(marketNames[market], market)));
      form.querySelector('[data-trade-rules]').replaceChildren(...data.rules.map((rule) => {
        const label = text('label', '', 'dash-check');
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox'; checkbox.name = 'kept'; checkbox.value = rule.id;
        label.append(checkbox, document.createTextNode(`${rule.text}${rule.hard ? ' · Hard rule' : ''}`));
        return label;
      }));
      updateClosed();
    }
    const broker = brokerNames[data.broker] ?? 'Add by hand';
    form.querySelector('[data-broker-note]').textContent = `Saved entry preference: ${broker}. This form records a trade by hand.`;
    tradeStatus.textContent = data.dailyLoss >= data.dailyLossLimit ? 'Daily loss limit reached. You can still record trades already taken.' : '';
    dialog.showModal();
  }));
  dialog.querySelector('[data-close-trade]').addEventListener('click', () => { if (!saveButton.disabled) dialog.close(); });
  dialog.addEventListener('cancel', (event) => { if (saveButton.disabled) event.preventDefault(); });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saveButton.disabled) return;
    const fields = form.elements;
    const optional = (name) => fields[name].value === '' ? null : fields[name].valueAsNumber;
    const kept = new FormData(form).getAll('kept');
    const trade = { requestId, symbol: fields.symbol.value, market: fields.market.value, side: fields.side.value,
      setup: fields.setup.value, stop: optional('stop'), target: optional('target'), result: fields.closed.checked ? optional('result') : null, kept };
    saveButton.disabled = true;
    [...form.querySelectorAll('input,select')].forEach((field) => { field.disabled = true; });
    tradeStatus.textContent = 'Saving your trade…';
    try {
      await save(trade);
      requestId = undefined;
      dialog.close();
      status.textContent = 'Trade saved.';
      try { data = await load(); fillDashboard(page, data, name); fillBreakdown(); }
      catch { status.textContent = 'Trade saved. Reload Dashboard to see the updated totals.'; }
    } catch (error) {
      tradeStatus.textContent = error.message || 'Unable to save the trade. Try again.';
    } finally {
      [...form.querySelectorAll('input,select')].forEach((field) => { field.disabled = false; });
      updateClosed();
      saveButton.disabled = false;
    }
  });

  const jump = page.querySelector('[data-search-dialog]');
  const search = jump.querySelector('input');
  const results = jump.querySelector('[data-search-results]');
  const links = [...page.querySelectorAll('.dash-navigation a')];
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
    if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'k' || dialog.open || jump.open) return;
    event.preventDefault(); openJump();
  });
}
