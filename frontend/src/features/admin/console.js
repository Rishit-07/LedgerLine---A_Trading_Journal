// The admin console: its own entry, its own sidebar, none of the trading app around it.
// Only the reviewer account gets in; anyone else sees the same "not found" page as any unknown address.
import { mountPage, bindPageTheme } from '../../pages/shared.js';
import '@fontsource/instrument-serif/latin-400.css';
import '../../pages/workspace.css';
import './console.css';
import './page.css';

export const NAV = [
  ['/admin', 'Home'], ['/admin/users', 'Users'], ['/admin/mentors', 'Mentor verification'],
  ['/admin/tickets', 'Support tickets'], ['/admin/billing', 'Billing'], ['/admin/newsletter', 'Newsletter'], ['/admin/audit', 'Audit log'],
];

const screens = {
  '/admin': () => import('./page.js').then((m) => m.adminPage),
  '/admin/users': () => import('./users.js').then((m) => m.usersPage),
  '/admin/mentors': () => import('./mentors.js').then((m) => m.mentorsPage),
  '/admin/tickets': () => import('../tickets/admin.js').then((m) => m.ticketAdminPage),
  '/admin/billing': () => import('../billing-admin/page.js').then((m) => m.billingAdminPage),
  '/admin/newsletter': () => import('../newsletter/admin.js').then((m) => m.newsletterAdminPage),
  '/admin/audit': () => import('./audit.js').then((m) => m.auditPage),
};

const esc = (value) => String(value).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);

export async function renderAdminConsole(path, landing) {
  landing.hidden = true;
  const { auth } = await import('../../firebase-session.js');
  await auth.authStateReady();
  const user = auth.currentUser;
  if (!user || user.emailVerified !== true) {
    location.replace('/auth?next=' + encodeURIComponent(path));
    return;
  }
  const { authenticatedRequest } = await import('../../auth.js');
  const request = (route, method, body) => authenticatedRequest(user, route, method, body);
  const screen = await screens[path]();
  const endpoint = screen.endpoint;
  let data;
  try {
    data = await request(endpoint, 'GET');
  } catch (error) {
    if ([401, 403, 404].includes(error.status)) {
      const { renderNotFound } = await import('../screens/notfound.js');
      renderNotFound(landing);
      return;
    }
    data = null;
    var failure = error.message || 'The admin console could not load.'; // eslint-disable-line no-var
  }
  document.title = screen.title + ' — Ledgerline admin';
  const links = NAV.map(([href, label]) => `<a href="${href}" class="ad-nav-link"${href === path ? ' aria-current="page"' : ''}>${esc(label)}</a>`).join('');
  const page = mountPage(landing, `<div class="n-root ad-shell" data-admin-shell>
    <aside class="ad-side">
      <a class="ad-brand" href="/admin">Ledgerline<small>Admin console</small></a>
      <nav class="ad-nav" aria-label="Admin">${links}</nav>
      <div class="ad-who"><span data-ad-email></span><button type="button" class="btn btn-secondary" data-page-theme>Dark mode</button><button type="button" class="btn btn-secondary" data-ad-signout>Sign out</button></div>
    </aside>
    <main class="ad-main">
      <header class="ad-head"><h1>${esc(screen.title)}</h1><p>${esc(screen.description)}</p></header>
      <p class="ad-status" data-workspace-status role="status"></p>
      ${screen.content}
    </main></div>`);
  bindPageTheme(page);
  page.querySelector('[data-ad-email]').textContent = user.email;
  page.querySelector('[data-ad-signout]').addEventListener('click', async () => { await auth.signOut(); location.replace('/auth'); });
  const status = page.querySelector('[data-workspace-status]');
  if (!data) {
    status.textContent = failure;
    return;
  }
  try {
    await screen.bind(page, { data, request, save: (details) => request(endpoint, 'POST', details), reload: () => request(endpoint, 'GET'), uid: user.uid });
  } catch (error) {
    status.textContent = error.message || 'Something went wrong.';
  }
}
