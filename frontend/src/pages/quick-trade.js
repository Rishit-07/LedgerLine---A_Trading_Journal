import './quick-trade.css';
import { screenshotPicker, screenshotData } from '../components/trade-screenshots.js';

const holdTime = 1200;

function localTradeInstant(value, timezone) {
  if (!value) return undefined;
  const clock = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const wallTime = Date.parse(value + 'Z');
  let guess = wallTime;
  for (let attempt = 0; attempt < 5; attempt++) {
    const p = Object.fromEntries(clock.formatToParts(new Date(guess)).map(({ type, value }) => [type, value]));
    const display = Date.parse(p.year + '-' + p.month + '-' + p.day + 'T' + p.hour + ':' + p.minute + ':' + p.second + 'Z');
    if (wallTime === display) return new Date(guess).toISOString();
    guess += wallTime - display;
  }
  throw new RangeError('Choose a valid time in your streak timezone.');
}

export function bindQuickTrade(page, { save, getDashboard, marketNames, onSaved }) {
  const dialog = page.querySelector('[data-trade-dialog]');
  const receipt = page.querySelector('[data-trade-receipt]');
  const form = dialog.querySelector('form');
  const fields = form.elements;
  const close = form.querySelector('[data-close-trade]');
  const submit = form.querySelector('[type="submit"]');
  const submitLabel = form.querySelector('[data-trade-save-label]');
  const status = form.querySelector('[data-trade-status]');
  const details = form.querySelector('[data-trade-details]');
  const before = screenshotPicker('before');
  details.append(before);
  const resultField = form.querySelector('[data-result-field]');
  const checklist = form.querySelector('[data-trade-rules]');
  const progress = form.querySelector('[data-rule-progress]');
  const score = form.querySelector('[data-rule-score]');
  let rules = [];
  let timezone;
  let requestId;
  let hold;

  function updateChecklist() {
    const checked = checklist.querySelectorAll(':checked').length;
    const broken = checked < rules.length;
    [...progress.children].forEach((pip, index) => pip.classList.toggle('is-filled', index < checked));
    score.textContent = rules.length ? checked + ' of ' + rules.length + ' rules followed. Trade results do not affect this check.' : 'No active rules to check.';
    submit.classList.toggle('n-acc', !broken);
    submit.classList.toggle('n-out', broken);
    submit.classList.toggle('ql-warn', broken);
    submitLabel.textContent = broken ? 'Save with broken rule' : 'Save trade';
  }

  function updateDetails() {
    resultField.hidden = fields.closed.disabled || !fields.closed.checked;
    fields.result.disabled = resultField.hidden;
    fields.result.required = !resultField.hidden;
    const symbols=new Set((getDashboard().recentTrades ?? []).filter(t=>t.market===fields.market.value).map(t=>t.symbol));
    form.querySelector('#ql-symbols').replaceChildren(...Array.from(symbols,symbol=>new Option(symbol)));
    form.querySelector('[data-trade-market]').textContent = marketNames[fields.market.value] ?? '';
  }

  function open() {
    if (page.querySelector('dialog[open]')) return;
    const data = getDashboard();
    timezone = data.streakTimezone ?? 'Asia/Kolkata';
    form.querySelector('[data-trade-timezone]').textContent = timezone;
    if (!requestId) {
      form.reset();
      details.open = false;
      requestId = crypto.randomUUID();
      fields.market.replaceChildren(...Object.entries(marketNames).map(([market, label]) => new Option(label, market)));
      fields.market.value = data.markets.find((market) => market in marketNames) ?? Object.keys(marketNames)[0];
      rules = data.rules;
      checklist.replaceChildren(...rules.map((rule) => {
        const label = document.createElement('label');
        label.className = 'n-in ql-rule';
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.name = 'kept';
        input.value = rule.id;
        const mark = document.createElement('span');
        mark.className = 'ql-mark';
        mark.setAttribute('aria-hidden', 'true');
        const name = document.createElement('span');
        name.textContent = rule.text + (rule.hard ? ' · Hard rule' : '');
        label.append(input, mark, name);
        return label;
      }));
      progress.replaceChildren(...rules.map(() => document.createElement('span')));
    }
    updateDetails();
    updateChecklist();
    status.textContent = data.dailyLoss >= data.dailyLossLimit ? 'Daily loss limit reached. You can still record trades already taken.' : '';
    dialog.showModal();
    dialog.scrollTop = 0;
    fields.symbol.focus();
  }

  function endHold() {
    clearTimeout(hold);
    hold = undefined;
    form.classList.remove('ql-holding');
  }

  dialog.addEventListener('close', endHold);
  dialog.addEventListener('cancel', (event) => { if (submit.disabled) event.preventDefault(); });
  dialog.addEventListener('click', (event) => {
    if (event.target === dialog && !submit.disabled) dialog.close();
  });
  close.addEventListener('click', () => { if (!submit.disabled) dialog.close(); });
  fields.market.addEventListener('change', updateDetails);
  fields.closed.addEventListener('change', updateDetails);
  checklist.addEventListener('change', updateChecklist);
  form.addEventListener('invalid', (event) => {
    if (details.contains(event.target)) details.open = true;
  }, true);
  for (const button of page.querySelectorAll('[data-log-trade]')) button.addEventListener('click', open);
  window.addEventListener('keydown', (event) => {
    if (event.key.toLowerCase() !== 'l' || event.repeat || event.ctrlKey || event.metaKey || event.altKey ||
      event.target.closest?.('input, textarea, select, [contenteditable]') || !page.isConnected) return;
    if (event.defaultPrevented || page.querySelector('dialog[open]')) return;
    event.preventDefault();
    open();
  });

  submit.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary || submit.disabled) return;
    endHold();
    form.classList.add('ql-holding');
    hold = setTimeout(() => {
      endHold();
      form.requestSubmit(submit);
    }, holdTime);
  });
  for (const event of ['pointerup', 'pointerleave', 'pointercancel', 'blur']) submit.addEventListener(event, endHold);
  submit.addEventListener('pointermove', ({ clientX, clientY }) => {
    if (!hold) return;
    const { left, right, top, bottom } = submit.getBoundingClientRect();
    if (clientX < left || clientX > right || clientY < top || clientY > bottom) endHold();
  });
  // Keyboard and assistive technology can activate the submit button without a pointer hold.
  submit.addEventListener('click', (event) => { if (event.detail > 0) event.preventDefault(); });
  submit.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    event.preventDefault();
    if (!event.repeat && !submit.disabled) form.requestSubmit(submit);
  });

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (submit.disabled) return;
    endHold();
    let occurredAt;
    try { occurredAt = localTradeInstant(fields.occurredAt.value, timezone); }
    catch { details.open = true; status.textContent = 'Choose a valid time in ' + timezone + '.'; return; }
    const optional = (name) => fields[name].value === '' ? null : fields[name].valueAsNumber;
    const trade = {
      requestId, symbol: fields.symbol.value.trim(), side: fields.side.value, market: fields.market.value,
      setup: fields.setup.value, stop: optional('stop'), target: optional('target'),
      result: fields.closed.checked ? optional('result') : null, mood: fields.mood.value || null,
      kept: new FormData(form).getAll('kept'), occurredAt,
    };
    const controls = [...form.querySelectorAll('input, select, button')].filter((control) => !control.disabled);
    controls.forEach((control) => { control.disabled = true; });
    status.textContent = 'Saving your trade…';
    try {
      trade.beforeScreenshot = await screenshotData(before.querySelector('input').files[0]);
      const saved = await save(trade);
      requestId = undefined;
      dialog.close();
      showReceipt(receipt, trade, rules, saved);
      void onSaved(saved);
    } catch (error) {
      status.textContent = error.message || 'Unable to save the trade. Try again.';
    } finally {
      controls.forEach((control) => { control.disabled = false; });
      updateDetails();
    }
  });

  const tear = receipt.querySelector('form');
  const button = tear.querySelector('[data-tear-receipt]');
  const paper = receipt.querySelector('.ql-paper');
  const paperWindow = receipt.querySelector('.ql-paper-window');
  function markPrinted() {
    receipt.classList.add('ql-printed');
    button.disabled = false;
  }
  paper.addEventListener('animationend', (event) => {
    if (event.animationName === 'ql-print') markPrinted();
  });
  receipt.addEventListener('close', () => {
    receipt.classList.remove('ql-printed', 'ql-torn');
    paperWindow.style.removeProperty('transform');
  });
  let drag;
  button.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || !event.isPrimary || button.disabled) return;
    drag = { id: event.pointerId, start: event.clientY };
    button.setPointerCapture(event.pointerId);
  });
  button.addEventListener('pointermove', (event) => {
    if (drag?.id !== event.pointerId) return;
    const distance = Math.max(0, event.clientY - drag.start);
    paperWindow.style.transform = 'translateY(' + distance / 2 + 'px) rotate(' + Math.min(distance / 110, 1) * 4 + 'deg)';
  });
  button.addEventListener('lostpointercapture', () => {
    drag = undefined;
    if (!receipt.classList.contains('ql-torn')) paperWindow.style.removeProperty('transform');
  });
  button.addEventListener('pointerup', (event) => {
    if (drag?.id === event.pointerId && event.clientY - drag.start > 90) tear.requestSubmit(button);
  });
  tear.addEventListener('submit', (event) => {
    if (event.submitter !== button || matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    event.preventDefault();
    if (receipt.classList.contains('ql-torn')) return;
    button.disabled = true;
    receipt.classList.add('ql-torn');
    const motion = paperWindow.animate([
      { transform: paperWindow.style.transform || 'translateY(46px) rotate(4deg)', opacity: 1 },
      { transform: 'translateY(120px) rotate(9deg)', opacity: 1, offset: .35 },
      { transform: 'translate(90px, 520px) rotate(18deg)', opacity: 0 },
    ], {
      duration: 700, easing: 'cubic-bezier(.32,.72,0,1)', fill: 'forwards',
    });
    motion.finished.then(() => { if (receipt.open) receipt.close(); }).finally(() => {
      motion.cancel();
      button.disabled = false;
    });
    receipt.addEventListener('close', () => {
      if (motion.playState === 'running') motion.finish();
    }, { once: true });
  });
}

export function showReceipt(receipt, trade, rules, saved) {
  const detail = receipt.querySelector('[data-receipt-details]');
  const rows = [
    ['Instrument', trade.symbol.toUpperCase()], ['Side', trade.side === 'long' ? 'Long' : 'Short'],
    ['Stop', trade.stop], ['Target', trade.target], ['Feeling', trade.mood],
    ['Result', trade.result === null ? 'Open' : trade.result + 'R'],
  ];
  if (saved?.openedAt) rows.unshift(['Logged', new Intl.DateTimeFormat('en-IN', {
    dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Kolkata',
  }).format(new Date(saved.openedAt)) + ' IST']);
  detail.replaceChildren(...rows.flatMap(([label, value]) => {
    if (value === null) return [];
    const term = document.createElement('dt');
    const description = document.createElement('dd');
    term.textContent = label;
    description.textContent = value;
    return [term, description];
  }));
  const score = receipt.querySelector('[data-receipt-score]');
  const accepted = new Set(trade.kept);
  score.textContent = rules.length ? trade.kept.length + ' / ' + rules.length : '—';
  const ring = receipt.querySelector('[data-receipt-ring]');
  ring.setAttribute('stroke-dasharray', (rules.length ? trade.kept.length / rules.length * 100 : 0) + ' 100');
  const stamp = receipt.querySelector('[data-receipt-stamp]');
  stamp.hidden = rules.length === 0;
  stamp.textContent = trade.kept.length === rules.length ? 'RULES KEPT' : 'REVIEW IT';
  stamp.classList.toggle('is-review', trade.kept.length !== rules.length);
  receipt.querySelector('[data-receipt-rules]').replaceChildren(...rules.map(({ text, id }) => {
    const item = document.createElement('li');
    item.textContent = (accepted.has(id) ? '✓ ' : '× ') + text;
    return item;
  }));
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  receipt.classList.toggle('ql-printed', reduced);
  receipt.querySelector('[data-tear-receipt]').disabled = !reduced;
  receipt.showModal();
}
