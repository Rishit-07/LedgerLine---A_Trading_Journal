import { onNotifications, unreadCount } from './store.js';

const icon = '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 16V11a6 6 0 1 1 12 0v5l2 2H4z M10 21h4"/></svg>';

function paint(bell) {
  const count = unreadCount();
  bell.setAttribute('aria-label', count ? `Notifications, ${count} unread` : 'Notifications');
  bell.querySelector('[data-bell-dot]').hidden = count === 0;
  bell.querySelector('[data-bell-count]').textContent = count > 99 ? '99+' : String(count);
}

/* Puts the bell in every top bar that has an actions area, now and as pages change. */
let installed = false;
export function installBell() {
  if (installed) return;
  installed = true;
  const add = () => {
    for (const actions of document.querySelectorAll('.dash-toolbar .dash-actions')) {
      if (actions.querySelector('[data-bell]')) continue;
      const bell = document.createElement('a');
      bell.href = '/notifications';
      bell.className = 'btn btn-secondary notif-bell';
      bell.dataset.bell = '';
      bell.innerHTML = icon + '<span class="notif-dot" data-bell-dot hidden><span class="notif-ping"></span><span class="notif-dot-core"></span></span><span class="notif-sr" data-bell-count></span>';
      actions.prepend(bell);
      paint(bell);
    }
  };
  onNotifications(() => document.querySelectorAll('[data-bell]').forEach(paint));
  new MutationObserver(add).observe(document.body, { childList: true, subtree: true });
  add();
}
