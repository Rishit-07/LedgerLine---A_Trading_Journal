import dashboardMarkup from './dashboard.html?raw';
import { bindPageTheme, mountPage } from './shared.js';
import { bindQuickTrade } from './quick-trade.js';
import { badgeMarkup, bindBadgeUnlock, bindStreakPanel, element, renderBadges, streakRule } from './streak-view.js';
import { bindStreakShare, shareMarkup } from './streak-share.js';
import '@fontsource/instrument-serif/latin-400.css';
import './dashboard.css';

const captions = { journal: 'Trade journal', profile: 'Profile', badges: 'Badges', settings: 'Settings' };
const markets = { stocks: 'Stocks', options: 'Options', futures: 'Futures', forex: 'Forex', crypto: 'Crypto' };

const journal = `
  <div class="streak-journal">
    <section class="n-out streak-panel" id="streak" aria-labelledby="streak-title" hidden>
      <div class="streak-stage"><img data-tally src="/tally-calm.svg" alt="Tally calm" width="138" height="138" /></div>
      <div class="streak-number" data-streak-count aria-live="off">0</div>
      <h2 id="streak-title">day streak</h2>
      <p data-streak-message aria-live="polite"></p>
      <div class="streak-week" data-streak-week aria-label="Week from Monday through Sunday"></div>
      <div class="n-in streak-goal">
        <div><strong data-streak-goal></strong><span data-streak-ratio></span></div>
        <progress max="1" value="0" aria-label="Progress toward your best streak"></progress>
      </div>
      <div class="streak-chips">
        <span class="n-in" data-streak-freeze></span><span class="n-in" data-streak-best></span>
        <span class="n-in" data-streak-level></span><span class="n-in" data-streak-xp></span>
      </div>
      <section class="n-in streak-social" aria-labelledby="streak-friends-title">
        <h3 id="streak-friends-title">Streak together</h3>
        <button type="button" class="n-btn n-out streak-btn" data-copy-invite>Copy my friend code</button>
        <form data-invite-form><label>Friend code<input class="n-out" name="code" required maxlength="36" /></label>
          <button class="n-btn n-out streak-btn">Invite</button></form>
        <div data-friends></div>
      </section>
      <section class="n-in streak-social" aria-labelledby="streak-battle-title">
        <h3 id="streak-battle-title">Streak battle</h3>
        <form data-battle-form>
          <label>Friend<select name="friendId" class="n-out" required></select></label>
          <label>Length<select name="lengthDays" class="n-out"><option value="3">3 days</option><option value="7">7 days</option><option value="14">14 days</option></select></label>
          <button class="n-btn n-out streak-btn">Send challenge</button>
        </form>
        <div data-battles></div>
      </section>
      <p class="streak-message" role="status" data-social-status></p>
      <button type="button" class="n-btn n-acc streak-btn streak-share-button" data-share-streak>Share</button>
      <p class="streak-footnote">${streakRule}</p>
    </section>
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
    </div>
  </div>`;

const profile = `
  <section class="n-out streak-tile streak-profile" aria-labelledby="streak-profile-title">
    <div class="streak-heading"><h2 id="streak-profile-title" data-profile-name></h2><a href="/journal#streak">Open journal</a></div>
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
      ${tradeDialogs}${mode === 'journal' ? shareMarkup : ''}${badgeMarkup}
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
  if (location.hash === '#streak') page.querySelector('#streak')?.scrollIntoView();
}

async function bindJournal(page, request, showBadge) {
  const panel = page.querySelector('[id="streak"]');
  const paint = bindStreakPanel(panel);
  const share = bindStreakShare(page, request);
  const journalStatus = page.querySelector('[data-journal-status]');
  const socialStatus = page.querySelector('[data-social-status]');
  const tradeList = page.querySelector('[data-journal-activity]');
  const restDays = page.querySelector('[data-rest-days]');
  const more = page.querySelector('[data-more-trades]');
  const invite = page.querySelector('[data-invite-form]');
  const battle = page.querySelector('[data-battle-form]');
  const rest = page.querySelector('[data-rest-form]');
  let state;
  let cursor;
  let dashboard;

  function applyStreak(next) {
    state = next;
    panel.hidden = false;
    paint(state);
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

  async function loadSocial() {
    const [{ friends }, { battles }] = await Promise.all([request('/api/streak/friends', 'GET'), request('/api/streak/battles', 'GET')]);
    battle.elements.friendId.replaceChildren(new Option('Choose a friend', ''), ...friends.filter(({ status }) => status === 'active')
      .map(({ id, name }) => new Option(name || 'Ledgerline member', id)));
    battle.querySelector('button').disabled = battle.elements.friendId.options.length < 2;
    const rows = friends.map((friend) => {
      const row = element('div', '', 'streak-social-row');
      const label = friend.status === 'active' ? friend.current + ' day streak' : friend.outgoing ? 'Invite sent' : 'Invited you';
      row.append(element('span', (friend.name || 'Ledgerline member') + ' · ' + label));
      if (friend.status === 'pending' && !friend.outgoing) row.append(action('Accept', async () => {
        await request('/api/streak/friends/accept', 'POST', { id: friend.id }); await loadSocial();
      }, socialStatus));
      row.append(action(friend.status === 'active' ? 'End' : friend.outgoing ? 'Cancel invite' : 'Decline', async () => {
        await request('/api/streak/friends/end', 'POST', { id: friend.id }); await loadSocial();
      }, socialStatus));
      return row;
    });
    page.querySelector('[data-friends]').replaceChildren(...rows);
    page.querySelector('[data-battles]').replaceChildren(...battles.map((record) => element('div',
      (record.name || 'Ledgerline member') + ' · ' + record.lengthDays + ' days · ' +
      ({ tie: 'Tie', won: 'Won', lost: 'Lost' }[record.result] ?? 'In progress'), 'streak-social-row')));
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
  page.querySelector('[data-share-streak]').addEventListener('click', () => share(state));
  page.querySelector('[data-copy-invite]').addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(state.inviteCode); socialStatus.textContent = 'Friend code copied.'; }
    catch { socialStatus.textContent = 'Your friend code: ' + state.inviteCode; }
  });
  bindSubmit(rest, journalStatus, async (data) => {
    const next = await request('/api/streak/rest-day', 'POST', { note: data.get('note') });
    applyStreak(next);
    rest.reset();
    await loadJournal();
  });
  bindSubmit(invite, socialStatus, async (data) => {
    await request('/api/streak/friends/invite', 'POST', { code: data.get('code') });
    invite.reset();
    await loadSocial();
  });
  bindSubmit(battle, socialStatus, async (data) => {
    await request('/api/streak/battles', 'POST', { friendId: data.get('friendId'), lengthDays: Number(data.get('lengthDays')) });
    await loadSocial();
  });
  await Promise.all([loadJournal(), loadSocial()]);
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
