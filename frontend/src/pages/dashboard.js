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

function tradeList(container, trades, empty) {
  if (!trades.length) return container.replaceChildren(text('p', empty, 'n-in dash-empty'));
  const list = text('ul', '', 'dash-trades');
  for (const trade of trades) {
    const row = text('li', '', 'n-in');
    const details = text('div', '');
    details.append(text('strong', trade.symbol), text('small', `${marketNames[trade.market]} · ${trade.side === 'long' ? 'Long' : 'Short'}`));
    if (trade.result === null && (trade.stop !== null || trade.target !== null)) {
      details.append(text('small', `Stop ${trade.stop ?? '—'} · Target ${trade.target ?? '—'}`));
    }
    if (trade.checks) details.append(text('small', `${trade.kept} of ${trade.checks} rules followed`));
    row.append(details, text('strong', trade.result === null ? 'Open' : r(trade.result), trade.result < 0 ? 'is-loss' : trade.result > 0 ? 'is-win' : ''));
    list.append(row);
  }
  container.replaceChildren(list);
}

function equityChart(container, curve) {
  if (!curve.length) return container.replaceChildren(text('p', 'Closed trades will appear on this chart.'));
  const values = [0, ...curve.map(({ equity }) => equity)];
  const low = values.reduce((min, value) => Math.min(min, value), 0);
  const high = values.reduce((max, value) => Math.max(max, value), 0);
  const y = (value) => 192 - (value - low) / (high - low || 1) * 168;
  const points = values.map((value, index) => `${12 + index / (values.length - 1) * 576},${y(value)}`).join(' ');
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 600 216');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', `Cumulative realized result ends at ${r(values.at(-1))}.`);
  const line = document.createElementNS(svg.namespaceURI, 'polyline');
  line.setAttribute('points', points);
  svg.append(line);
  container.replaceChildren(svg);
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
  set('[data-streak]', `${data.streak} ${data.streak === 1 ? 'day' : 'days'}`);
  set('[data-adherence]', pct(data.rulesFollowed));
  const lossBudget = `${number.format(data.dailyLoss)}R of ${data.dailyLossLimit}R used`;
  set('[data-loss-budget]', lossBudget);
  one('[data-loss-meter]').max = data.dailyLossLimit;
  one('[data-loss-meter]').value = data.dailyLoss;
  const hitLimit = data.dailyLoss >= data.dailyLossLimit;
  page.classList.toggle('dash-loss-limit-hit', hitLimit);
  set('[data-risk-note]', hitLimit ? 'Daily loss limit reached.' : 'Realized losses are within your daily limit.');
  set('[data-plan-text]', data.plan ? (data.plan.locked ? 'Plan locked' : 'Plan in progress') : 'No plan for today yet.');
  set('[data-plan-bias]', data.plan?.bias ?? '');
  set('[data-today-count]', `${data.today.length} ${data.today.length === 1 ? 'trade' : 'trades'} logged`);

  one('[data-dash-kpis]').replaceChildren(...[
    ['Rules followed', pct(data.rulesFollowed)], ['Journal streak', `${data.streak}d`], ['Win rate', pct(data.winRate)],
    ['Average per trade', r(data.average)], ['Risk used today', `${number.format(data.dailyLoss)}R`], ['Today’s trades', String(data.today.length)],
  ].map(([label, value]) => {
    const card = text('div', '', 'n-out dash-kpi');
    card.append(text('span', label), text('strong', value));
    return card;
  }));

  one('[data-start-list]').replaceChildren(...[
    [data.streak || data.today.length ? 'Trading activity recorded' : 'Log your first trade', Boolean(data.streak || data.today.length)],
    [`Trade entry: ${brokerNames[data.broker] ?? 'Add by hand'}`, true],
    [`Markets: ${data.markets.map((market) => marketNames[market]).join(', ')}`, data.markets.length > 0],
    [data.rules.length ? `${data.rules.length} starting rules saved` : 'Set a starting rule', data.rules.length > 0],
  ].map(([label, done]) => text('li', label, done ? 'is-done' : '')));

  const risk = one('[data-risk-list]');
  risk.replaceChildren();
  for (const [label, value] of [['Risk per trade', pct(data.riskPerTrade)], ['Daily loss limit', lossBudget], ['Max trades per day', String(data.maxTrades)]]) {
    risk.append(text('dt', label), text('dd', value));
  }
  one('[data-rule-list]').replaceChildren(...data.rules.map((rule) => {
    const item = text('li', rule.text, 'n-in');
    if (rule.hard) item.append(text('small', 'Hard rule'));
    return item;
  }));
  one('[data-dash-calendar]').replaceChildren(...data.days.map(({ date: day, result }) => {
    const cell = text('span', '', result < 0 ? 'is-loss' : result > 0 ? 'is-win' : result === 0 ? 'is-flat' : '');
    cell.title = `${date.format(new Date(day))} · ${result === null ? 'No closed trades' : r(result)}`;
    cell.setAttribute('aria-label', cell.title);
    return cell;
  }));
  equityChart(one('[data-equity-chart]'), data.curve);
  const totals = one('[data-equity-totals]');
  totals.hidden = !data.curve.length;
  totals.textContent = `Max drawdown ${r(data.drawdown)} · Peak ${r(data.peak)}`;
  tradeList(one('[data-open-list]'), data.open, 'No open positions logged.');
  tradeList(one('[data-today-list]'), data.today, 'No trades logged today.');
}

export function renderDashboard(landing, { initial, load, name, save, signOut }) {
  document.title = 'Dashboard — Ledgerline';
  const page = mountPage(landing, pageMarkup);
  bindPageTheme(page);
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
    const list = text('ul', '', 'dash-trades');
    for (const group of groups) {
      const row = text('li', '', 'n-in');
      const description = text('div', '');
      description.append(text('strong', group.label), text('small', `${group.count} ${group.count === 1 ? 'trade' : 'trades'}`));
      row.append(description, text('strong', r(group.average), group.average < 0 ? 'is-loss' : 'is-win'));
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
