const pages = new Set(['/', '/auth', '/about', '/privacy', '/terms', '/legal', '/support', '/onboarding', '/streak/invite', '/dashboard',
  '/journal','/history','/profile','/settings','/badges','/calendar','/plan','/billing','/mentor-verification','/mentor-review','/tickets','/ticket-admin','/notifications','/mistake','/sizing','/forecast','/reports','/portfolio','/clubs','/people','/spaces','/coach']);
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');

export function animatePageEntry(page) {
  document.documentElement.removeAttribute('data-page-loading');
  if (reduceMotion.matches || typeof page.animate !== 'function') return;
  page.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 230, easing: 'ease-out' });
}

export function animatePageExit(page) {
  if (reduceMotion.matches || typeof page.animate !== 'function') return;
  return page.animate([{ opacity: getComputedStyle(page).opacity }, { opacity: 0 }], {
    duration: 150, easing: 'ease-in', fill: 'forwards',
  });
}

export function bindPageNavigation() {
  let exit;
  addEventListener('pageshow', (event) => {
    if (!event.persisted) return;
    exit?.cancel();
    exit = undefined;
  });
  document.addEventListener('click', (event) => {
    if (
      event.defaultPrevented ||
      event.button ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey ||
      reduceMotion.matches
    )
      return;
    if (!(event.target instanceof Element)) return;
    const anchor = event.target.closest('a[href]');
    if (!anchor || anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return;

    const destination = new URL(anchor.href);
    const path = location.pathname;
    if (
      destination.origin !== location.origin ||
      destination.pathname === path ||
      !pages.has(path) ||
      !pages.has(destination.pathname)
    )
      return;
    const page = document.querySelector('.n-root:not([hidden])');
    if (!page || typeof page.animate !== 'function') return;
    event.preventDefault();
    if (exit) return;
    exit = animatePageExit(page);
    exit.finished.then(
      () => location.assign(destination.href),
      () => {},
    );
  });
}
