import { node } from '../../pages/workspace-ui.js';
import { onNotifications, setUnread } from './store.js';
import { toast } from './toast.js';
import { buildSettings } from './settings.js';
import { dotState, swapPanels, enterRows, flashText, pressFeel, removeRow, ringBell, slideInRow } from './motion.js';
import './notifications.css';

const path = '/api/notifications';
const FILTERS = [['all', 'All'], ['unread', 'Unread'], ['0', 'Journal and streaks'], ['1', 'Spaces'], ['2', 'Community'], ['3', 'Rewards'], ['4', 'Account']];
const ICON = { journal_reminder: 'JR', streak_risk: 'ST', loss_limit: 'R', spaces: 'SP', community: 'CM', rewards: 'RW', account: 'AC', security: 'SI', billing: 'PL' };
const ACTION = { journal_reminder: 'Log now', streak_risk: 'Log now', loss_limit: 'Open plan', spaces: 'Open space', community: 'Open', rewards: 'Pick reward', account: 'Open', security: 'Review', billing: 'Billing' };
const KINDS = [['ST', 'Streaks and reminders', 'Only when a streak could end.'], ['SP', 'Spaces and mentors', 'From people you chose to join.'], ['CM', 'Community', 'Follows, battles, replies.'], ['RW', 'Rewards', 'Unlocks and rewards to pick.'], ['AC', 'Account', 'Billing and sign-in safety.']];

function ago(value) {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(value)) / 60000));
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return minutes + ' min';
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + ' hr';
  const days = Math.round(hours / 24);
  return days === 1 ? 'Yesterday' : days + ' days';
}
const html = (tag, className, text) => node(tag, text ?? '', className);

export const notificationsPage = {
  title: 'Notifications',
  description: 'What needs you, and how you hear about it.',
  endpoint: path,
  content: '<div class="notif-tabs" role="tablist" aria-label="Notifications" data-tabs></div><div data-panel="inbox"><div class="notif-grid"><section class="n-out ws-card notif-inbox" data-inbox aria-labelledby="notif-title"></section><aside class="n-out ws-card notif-kinds" data-kinds></aside></div></div><section class="n-out ws-card notif-set" data-panel="settings" hidden></section>',
  bind(page, { data, request }) {
    const inbox = page.querySelector('[data-inbox]');
    const panels = { inbox: page.querySelector('[data-panel=inbox]'), settings: page.querySelector('[data-panel=settings]') };
    const tabs = page.querySelector('[data-tabs]');
    const tabButtons = {};
    let settingsLoaded = false;
    let current = 'inbox';
    panels.settings.hidden = true;
    const show = async (name) => {
      for (const [key, button] of Object.entries(tabButtons)) { button.setAttribute('aria-selected', String(key === name)); button.tabIndex = key === name ? 0 : -1; }
      const other = name === 'inbox' ? 'settings' : 'inbox';
      if (current === name) return;
      if (name === 'settings' && !settingsLoaded) {
        settingsLoaded = true;
        try { await buildSettings(panels.settings, { request }); } catch { settingsLoaded = false; toast('Could not do that. Try again.'); return; }
      }
      current = name;
      swapPanels(panels[other], panels[name]);
      history.replaceState(null, '', name === 'settings' ? '#settings' : location.pathname);
    };
    for (const [key, label] of [['inbox', 'Inbox'], ['settings', 'Settings']]) {
      const button = html('button', 'btn btn-secondary', label); button.type = 'button'; button.setAttribute('role', 'tab');
      button.addEventListener('click', () => show(key));
      tabButtons[key] = button; tabs.append(button);
    }
    tabs.addEventListener('keydown', (event) => { if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') { const next = document.activeElement === tabButtons.inbox ? 'settings' : 'inbox'; tabButtons[next].focus(); void show(next); } });
    const side = page.querySelector('[data-kinds]');
    let filter = 'all';
    let next = null;
    let loading = false;
    let rows = [];

    side.append(html('h2', '', 'What shows up here'), html('p', 'notif-sub', 'Only things you can act on.'));
    for (const [code, title, text] of KINDS) {
      const item = html('div', 'notif-kind');
      const box = html('div', 'n-in notif-icon', code);
      const copy = html('div');
      copy.append(html('strong', '', title), html('p', '', text));
      item.append(box, copy);
      side.append(item);
    }
    side.append(html('p', 'notif-note', 'Notifications never mention profit or loss amounts, and never carry trade tips. Messages are kept 90 days.'));

    const head = html('div', 'notif-head');
    const titles = html('div');
    const title = html('h2', '', 'Inbox'); title.id = 'notif-title';
    const sub = html('p', 'notif-sub');
    titles.append(title, sub);
    const allBtn = html('button', 'btn btn-primary notif-all', 'Mark all read'); allBtn.type = 'button';
    head.append(titles, allBtn);
    const offline = html('p', 'notif-offline', 'You are offline. Showing what was loaded.'); offline.setAttribute('role', 'status'); offline.hidden = navigator.onLine;
    const chips = html('div', 'notif-chips'); chips.setAttribute('role', 'group'); chips.setAttribute('aria-label', 'Filter notifications');
    const list = html('div', 'notif-list'); list.setAttribute('aria-live', 'polite');
    const empty = html('div', 'n-in notif-empty'); empty.hidden = true;
    empty.append('You are all caught up. Nothing new here.', html('small', '', 'Quiet days are normal. Log, review, rest.'));
    const sentinel = html('div', 'notif-sentinel'); sentinel.hidden = true;
    inbox.append(head, offline, chips, list, empty, sentinel);

    addEventListener('online', () => { offline.hidden = true; });
    addEventListener('offline', () => { offline.hidden = false; });

    const paintHead = (unread) => {
      sub.textContent = unread ? `${unread} unread. Everything here has something you can do.` : 'Nothing unread.';
      const label = unread ? 'Mark all read' : 'All read';
      if (allBtn.textContent !== label) { allBtn.textContent = label; flashText(allBtn); }
      allBtn.setAttribute('aria-pressed', String(!unread));
      allBtn.classList.toggle('is-done', !unread);
      title.textContent = unread ? `Inbox (${unread})` : 'Inbox';
    };
    const fail = () => toast('Could not do that. Try again.');
    const act = (body) => request(path, 'POST', body).then((result) => { setUnread(result.unread); paintHead(result.unread); return result; });

    function buildRow(item, fresh) {
      const row = html('div', 'notif-row');
      row.dataset.id = item.id;
      const dotCell = html('div', 'notif-dot-cell');
      const dot = html('span', 'notif-unread-dot'); dot.setAttribute('aria-hidden', 'true');
      dotCell.append(dot);
      const icon = html('div', 'n-in notif-icon' + (item.category === 0 ? ' is-accent' : ''), ICON[item.kind] ?? 'LL');
      icon.setAttribute('aria-hidden', 'true');
      const body = html('div', 'notif-body');
      const top = html('div', 'notif-top');
      const titleEl = html('strong');
      const srState = html('span', 'notif-sr', '');
      titleEl.append(srState, item.title);
      top.append(titleEl, html('time', 'notif-when', ago(item.created_at)));
      body.append(top);
      if (item.body) body.append(html('p', '', item.body));
      const buttons = html('div', 'btn-row notif-actions');
      const go = html('button', 'btn btn-secondary notif-go', ACTION[item.kind] ?? 'Open'); go.type = 'button';
      const read = html('button', 'btn btn-secondary'); read.type = 'button';
      const mute = html('button', 'btn btn-ghost notif-mute', 'Mute this kind'); mute.type = 'button';
      buttons.append(go, read, mute);
      body.append(buttons);
      row.append(dotCell, icon, body);

      const paintRow = () => {
        const isRead = Boolean(item.read_at);
        dotState(dot, !isRead);
        srState.textContent = isRead ? '' : 'Unread. ';
        read.textContent = isRead ? 'Mark unread' : 'Mark read';
        row.classList.toggle('is-unread', !isRead);
      };
      paintRow();
      const setRead = async (value) => {
        const before = item.read_at;
        item.read_at = value ? new Date().toISOString() : null;
        paintRow();
        try { await act({ action: value ? 'read' : 'unread', id: item.id }); if (filter === 'unread' && value) { removeRow(row, checkEmpty); rows = rows.filter((r) => r !== item); } }
        catch { item.read_at = before; paintRow(); fail(); }
      };
      read.addEventListener('click', () => setRead(!item.read_at));
      go.addEventListener('click', async () => {
        go.disabled = true;
        if (!item.read_at) { try { await act({ action: 'read', id: item.id }); } catch { /* still navigate */ } }
        location.assign(item.target_url);
      });
      mute.addEventListener('click', async () => {
        mute.disabled = true;
        try {
          await act({ action: 'mute', category: item.category });
          rows = rows.filter((r) => r.category !== item.category);
          const gone = [...list.children].filter((el) => el.dataset.cat === String(item.category));
          gone.forEach((el, index) => removeRow(el, index === gone.length - 1 ? checkEmpty : undefined));
          toast('Muted. You can turn it back on in Settings.');
        } catch { mute.disabled = false; fail(); }
      });
      row.dataset.cat = String(item.category);
      return row;
    }

    const checkEmpty = () => { empty.hidden = list.children.length > 0; };

    async function load(reset) {
      if (loading) return;
      loading = true;
      try {
        const query = new URLSearchParams({ filter });
        if (!reset && next) query.set('before', next);
        const result = await request(path + '?' + query, 'GET');
        if (reset) { list.replaceChildren(); rows = []; }
        const fresh = [];
        for (const item of result.items) { rows.push(item); const row = buildRow(item, false); fresh.push(row); list.append(row); }
        enterRows(fresh);
        next = result.next;
        sentinel.hidden = !next;
        setUnread(result.unread); paintHead(result.unread);
        checkEmpty();
      } catch { fail(); }
      finally { loading = false; }
    }

    for (const [value, label] of FILTERS) {
      const chip = html('button', 'btn btn-secondary notif-chip', label); chip.type = 'button';
      chip.setAttribute('aria-pressed', String(value === filter)); chip.dataset.filter = value;
      chip.addEventListener('click', () => {
        filter = value; next = null;
        for (const c of chips.children) c.setAttribute('aria-pressed', String(c.dataset.filter === value));
        void load(true);
      });
      chips.append(chip);
    }
    allBtn.addEventListener('click', async () => {
      if (allBtn.classList.contains('is-done')) return;
      allBtn.disabled = true;
      try {
        await act({ action: 'read_all' });
        for (const item of rows) item.read_at ??= new Date().toISOString();
        if (filter === 'unread') { list.replaceChildren(); rows = []; checkEmpty(); }
        else void load(true);
        toast('All marked read.');
      } catch { fail(); }
      finally { allBtn.disabled = false; }
    });

    // Infinite scroll: 30 at a time.
    new IntersectionObserver((entries) => { if (entries[0].isIntersecting && next) void load(false); }, { rootMargin: '200px' }).observe(sentinel);

    // New notifications arrive while the page is open.
    const stop = onNotifications((event) => {
      if (!page.isConnected) { stop(); return; }
      paintHead(event.unread);
      if (event.type !== 'new') return;
      const row = event.row;
      if (filter !== 'all' && filter !== 'unread' && filter !== String(row.category)) return;
      rows.unshift(row);
      const built = buildRow(row, true);
      list.prepend(built);
      slideInRow(built);
      ringBell(document.querySelector('[data-bell]'));
      checkEmpty();
    });

    pressFeel(inbox);
    const first = [];
    for (const item of data.items) { rows.push(item); const row = buildRow(item, false); first.push(row); list.append(row); }
    enterRows(first);
    next = data.next; sentinel.hidden = !next;
    setUnread(data.unread); paintHead(data.unread); checkEmpty();
    tabButtons.inbox.setAttribute('aria-selected', 'true'); tabButtons.settings.setAttribute('aria-selected', 'false'); tabButtons.settings.tabIndex = -1;
    if (location.hash === '#settings') void show('settings');
  },
};
