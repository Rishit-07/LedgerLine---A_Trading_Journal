import dashboardMarkup from './dashboard.html?raw';
import { bindPageTheme, mountPage } from './shared.js';
import { bindQuickTrade } from './quick-trade.js';
import { badgeMarkup, bindBadgeUnlock, element, renderBadges } from './streak-view.js';
import '@fontsource/instrument-serif/latin-400.css';
import './dashboard.css';

const captions = { journal: 'Trade journal', profile: 'Profile', badges: 'Badges', settings: 'Settings' };
const markets = { stocks: 'Stocks', options: 'Options', futures: 'Futures', forex: 'Forex', crypto: 'Crypto' };

const journal = `
    <div class="streak-journal-activity">
      <section class="n-out streak-tile" aria-labelledby="streak-rest-title">
        <h2 id="streak-rest-title">Rest day</h2>
        <form data-rest-form>
          <label>Note <small>(optional)</small><textarea class="n-in" name="note" maxlength="1000" rows="2"></textarea></label>
          <button class="n-btn n-acc streak-btn">I sat out today</button>
        </form>
      </section>
      <section class="n-out streak-tile" aria-labelledby="streak-activity-title">
        <div class="streak-heading"><h2 id="streak-activity-title">Journal activity</h2><button type="button" class="n-btn n-acc streak-btn" data-log-trade>Log trade</button></div>
        <div data-journal-activity></div>
        <button type="button" class="n-btn n-out streak-btn" data-more-trades hidden>Load older trades</button>
        <div data-rest-days></div>
        <p class="streak-message" role="status" data-journal-status></p>
      </section>
    </div>`;

const profile = `
  <section class="n-out streak-tile streak-profile" aria-labelledby="streak-profile-title">
    <div class="streak-heading"><h2 id="streak-profile-title" data-profile-name></h2><a href="/dashboard#streak">Open streak</a></div>
    <dl class="streak-profile-metrics">
      <div class="n-in"><dt>Current streak</dt><dd data-profile-current>—</dd></div>
      <div class="n-in"><dt>Best streak</dt><dd data-profile-best>—</dd></div>
      <div class="n-in"><dt>Level</dt><dd data-profile-level>—</dd></div>
      <div class="n-in"><dt>XP</dt><dd data-profile-xp>—</dd></div>
    </dl>
  </section>
  <section class="n-out streak-tile" aria-labelledby="streak-profile-badges">
    <h2 id="streak-profile-badges">Streak badges</h2><div class="streak-badges" data-profile-badges></div>
  </section>`;

const settings = `
  <section class="n-out streak-tile streak-settings" aria-labelledby="streak-settings-title">
    <h2 id="streak-settings-title">Journal streak settings</h2>
    <form data-streak-settings>
      <label>Timezone<input class="n-in" name="timezone" list="streak-timezones" required maxlength="80" /><datalist id="streak-timezones"></datalist></label>
      <button type="button" class="n-btn n-out streak-btn" data-local-zone>Use device timezone</button>
      <fieldset><legend>Auto-rest exchanges</legend>
        <label><input type="checkbox" name="exchange" value="NSE" /> NSE</label>
        <label><input type="checkbox" name="exchange" value="BSE" /> BSE</label>
      </fieldset>
      <fieldset><legend>Reminders</legend>
        <label><input type="checkbox" name="reminder" /> Email me when today hasn’t counted</label>
        <label>Local reminder time<input class="n-in" type="time" name="reminderTime" /></label>
        <p class="streak-footnote" data-reminder-info></p>
      </fieldset>
      <button class="n-btn n-acc streak-btn">Save settings</button>
      <p role="status" class="streak-message" data-settings-status></p>
    </form>
  </section>`;

export async function renderStreakPage(landing, { path, request, name, signOut }) {
  const mode = path.slice(1);
  document.title = captions[mode] + ' — Ledgerline';
  const shell = document.createElement('template');
  shell.innerHTML = dashboardMarkup.trim();
  const sidebar = shell.content.querySelector('.dash-sidebar');
  for (const link of sidebar.querySelectorAll('a[aria-current]')) {
    link.classList.remove('n-in');
    link.removeAttribute('aria-current');
  }
  const selected = sidebar.querySelector('a[href="/' + (mode === 'badges' ? 'profile' : mode) + '"]');
  selected?.classList.add('n-in');
  selected?.setAttribute('aria-current', 'page');
  sidebar.querySelector('.dash-side-limit').remove();
  const tradeDialogs = mode === 'journal' ? ['[data-trade-dialog]', '[data-trade-receipt]'].map((selector) =>
    shell.content.querySelector(selector).outerHTML).join('') : '';
  const page = mountPage(landing, `
    <div class="n-root dashboard-page streak-page">
      ${sidebar.outerHTML}
      <main class="dash-content">
        <header class="streak-heading streak-page-header">
          <h1>${captions[mode]}</h1>
          <div><button type="button" class="n-btn n-out streak-btn" data-page-theme>Dark mode</button>
          <button type="button" class="n-btn n-out streak-btn" data-streak-signout>Sign out</button></div>
        </header>
        <p class="streak-message" role="status" data-streak-page-status>Loading…</p>
        ${mode === 'journal' ? journal : mode === 'settings' ? settings : profile}
      </main>
      ${tradeDialogs}${badgeMarkup}
    </div>`);
  bindPageTheme(page);
  const menu = page.querySelector('[data-dash-menu]');
  menu.addEventListener('click', () => {
    menu.setAttribute('aria-expanded', String(page.toggleAttribute('data-menu-open')));
  });
  const pageStatus = page.querySelector('[data-streak-page-status]');
  page.querySelector('[data-streak-signout]').addEventListener('click', async () => {
    try { await signOut(); location.replace('/'); }
    catch { pageStatus.textContent = 'Unable to sign out. Try again.'; }
  });
  const showBadge = bindBadgeUnlock(page, request);
  if (mode !== 'journal') {
    page.querySelector('[data-log-trade]').addEventListener('click', () => location.assign('/journal#log'));
  }
  try {
    if (mode === 'journal') await bindJournal(page, request, showBadge);
    else if (mode === 'settings') await bindSettings(page, request, showBadge);
    else {
      const state = await request('/api/streak', 'GET');
      page.querySelector('[data-profile-name]').textContent = name || 'Your profile';
      page.querySelector('[data-profile-current]').textContent = state.current + (state.current === 1 ? ' day' : ' days');
      page.querySelector('[data-profile-best]').textContent = state.best + (state.best === 1 ? ' day' : ' days');
      page.querySelector('[data-profile-level]').textContent = state.level;
      page.querySelector('[data-profile-xp]').textContent = state.xp;
      renderBadges(page.querySelector('[data-profile-badges]'), state.badges);
      showBadge(state);
    }
    pageStatus.textContent = '';
  } catch (error) { pageStatus.textContent = error.message; }
}

async function bindJournal(page, request, showBadge) {
  const journalStatus = page.querySelector('[data-journal-status]');
  const tradeList = page.querySelector('[data-journal-activity]');
  const restDays = page.querySelector('[data-rest-days]');
  const more = page.querySelector('[data-more-trades]');
  const rest = page.querySelector('[data-rest-form]');
  let state;
  let cursor;
  let dashboard;

  function applyStreak(next) {
    state = next;
    rest.querySelector('button').textContent = state.manualRestToday ? 'Update rest-day note' : 'I sat out today';
    showBadge(state);
  }

  async function loadJournal(append = false) {
    const payload = await request('/api/streak/journal' + (append ? '?before=' + encodeURIComponent(cursor) : ''), 'GET');
    if (!append) {
      tradeList.replaceChildren();
      restDays.replaceChildren();
    }
    const time = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: state.timezone });
    for (const trade of payload.trades) {
      const row = element('article', '', 'n-in streak-activity-row');
      const info = element('div');
      info.append(element('strong', trade.symbol), element('small', [
        markets[trade.market], trade.side, trade.setup, time.format(new Date(trade.openedAt)),
      ].filter(Boolean).join(' · ')));
      row.append(info);
      if (trade.reviewed) row.append(element('span', 'Reviewed', 'streak-reviewed'));
      else row.append(action('Mark reviewed', async () => {
        applyStreak(await request('/api/streak/review', 'POST', { tradeId: trade.id }));
        await loadJournal();
      }, journalStatus));
      row.append(action('Delete', async () => {
        if (!confirm('Delete this trade and its journal entries?')) return;
        applyStreak(await request('/api/trades?tradeId=' + trade.id, 'DELETE'));
        await loadJournal();
      }, journalStatus));
      tradeList.append(row);
    }
    if (!tradeList.children.length) tradeList.append(element('p', 'No trades logged yet.'));
    if (payload.restDays.length) {
      restDays.append(element('h3', 'Rest days'));
      const list = element('ul');
      for (const day of payload.restDays) list.append(element('li', day.day + (day.note ? ' · ' + day.note : '')));
      restDays.append(list);
    }
    cursor = payload.next;
    more.hidden = !cursor;
  }

  const [initial, dashboardData] = await Promise.all([request('/api/streak', 'GET'), request('/api/dashboard', 'GET')]);
  dashboard = initialDashboard(dashboardData, initial);
  applyStreak(initial);
  bindQuickTrade(page, {
    marketNames: markets, getDashboard: () => dashboard,
    save: (trade) => request('/api/trades', 'POST', trade),
    onSaved: async (saved) => {
      applyStreak(saved.streak);
      try { await loadJournal(); dashboard = initialDashboard(await request('/api/dashboard', 'GET'), state); }
      catch (error) { journalStatus.textContent = error.message; }
    },
  });
  if (location.hash === '#log' && !page.querySelector('dialog[open]')) page.querySelector('[data-log-trade]').click();
  more.addEventListener('click', () => run(more, journalStatus, () => loadJournal(true)));
  bindSubmit(rest, journalStatus, async (data) => {
    const next = await request('/api/streak/rest-day', 'POST', { note: data.get('note') });
    applyStreak(next);
    rest.reset();
    await loadJournal();
  });
  await loadJournal();
}

function initialDashboard(data, state) {
  return { ...data, streakTimezone: state.timezone };
}

async function bindSettings(page, request, showBadge) {
  const form = page.querySelector('[data-streak-settings]');
  const { timezone, exchanges, reminderTime, remindersAvailable } = await request('/api/streak/preferences', 'GET');
  form.elements.timezone.value = timezone;
  page.querySelector('#streak-timezones').append(...['UTC', ...Intl.supportedValuesOf('timeZone')].map((zone) => new Option(zone)));
  page.querySelector('[data-local-zone]').addEventListener('click', () => {
    form.elements.timezone.value = Intl.DateTimeFormat().resolvedOptions().timeZone;
  });
  for (const checkbox of form.querySelectorAll('[name="exchange"]')) checkbox.checked = exchanges.includes(checkbox.value);
  form.elements.reminder.checked = Boolean(reminderTime);
  form.elements.reminder.disabled = !remindersAvailable;
  form.elements.reminderTime.value = reminderTime ?? '';
  const toggle = () => {
    form.elements.reminderTime.disabled = !form.elements.reminder.checked || !remindersAvailable;
    form.elements.reminderTime.required = !form.elements.reminderTime.disabled;
  };
  toggle();
  form.elements.reminder.addEventListener('change', toggle);
  page.querySelector('[data-reminder-info]').textContent = remindersAvailable
    ? 'Reminders go to the verified email on your account.' : 'Email reminders are currently unavailable.';
  const status = page.querySelector('[data-settings-status]');
  bindSubmit(form, status, async (data) => {
    const updated = await request('/api/streak/preferences', 'PUT', {
      timezone: data.get('timezone').trim(), exchanges: data.getAll('exchange'), reminderTime: data.get('reminderTime'),
    });
    status.textContent = 'Settings saved.';
    showBadge(updated);
  });
}

async function run(button, status, handler) {
  if (button.disabled) return;
  status.textContent = '';
  button.disabled = true;
  try { await handler(); }
  catch (error) { status.textContent = error.message; }
  finally { button.disabled = false; }
}

function action(label, handler, status) {
  const button = element('button', label, 'n-btn n-out streak-btn');
  button.type = 'button';
  button.addEventListener('click', () => run(button, status, handler));
  return button;
}

function bindSubmit(form, status, handler) {
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const data = new FormData(form);
    const submit = event.submitter ?? form.querySelector('button:not([type]), button[type="submit"]');
    void run(submit, status, () => handler(data));
  });
}
