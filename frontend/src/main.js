import {legacyBillingRoute} from './features/billing/route.js';
import {openingReveal} from './components/file-actions.js';
import {communityRedirect,roomPath} from './features/community/routes.js';
import '@fontsource-variable/schibsted-grotesk';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles/tokens.css';
import './styles/selects.css';
import './styles/landing.css';
import './styles/responsive.css';
import './styles/controls.css';
import './styles/skeleton.css';
import { initControls } from './controls.js';
import { startErrorCapture } from './diagnostics.js';
startErrorCapture();
import { installTwoStep } from './mfa.js';
import { initMotion } from './motion.js';
import { initSectionRail } from './section-rail.js';
import { initLandingPricing } from './landing-pricing.js';
import { initToolWheel } from './tool-wheel.js';
import { transitionTheme } from './theme-transition.js';
import './styles/auth.css';
import { animatePageEntry, bindPageNavigation } from './pages/navigation.js';
import { bindPublicAccount } from './pages/public-account.js';

initControls();
installTwoStep();
if (import.meta.env.VITE_APPCHECK_SITE_KEY) void import('./app-check.js').then((module) => module.startAppCheck());
const landing = document.querySelector('#landing');
const root = document.documentElement;
const themeToggle = document.querySelector('[data-action="toggleTheme"]');

function setTheme(dark) {
  root.classList.toggle('dark', dark);
  themeToggle.textContent = dark ? 'Light mode' : 'Dark mode';
  themeToggle.setAttribute('aria-pressed', String(dark));
}

setTheme(root.classList.contains('dark'));

const appPages = {
  '/dashboard': 'Dashboard',
  '/billing':'Plans and billing',
  '/mentor-verification':'Verify you teach',
  '/mentor-review':'Mentor reviews',
  '/tickets':'My tickets',
  '/notifications':'Notifications',
  '/ticket-admin':'Ticket queue',
  '/newsletter-admin':'Newsletter',
  '/mentorship':'Mentorship',
  '/mentor/join':'Join a mentor',
  '/journal': 'Trade journal',
  '/history': 'Trade history',
  '/forecast': 'Forecast ledger',
  '/calendar': 'Trading calendar',
  '/sizing': 'Sizing lab',
  '/clubs': 'Clubs',
  '/coach': 'AI coach',
  '/plan': 'Plan',
  '/mistake': 'Mistake lab',
  '/reports': 'AI Reports',
  '/badges': 'Badges',
  '/portfolio': 'Portfolio',
  '/people': 'People',
  '/spaces': 'Mentor spaces',
  '/settings': 'Settings',
  '/profile': 'Profile',
};
const path = location.pathname.replace(/\/$/, '') || '/';
bindPageNavigation();

function renderPending(title, message, retry = false) {
  const fragment = document.querySelector('#pending-page').content.cloneNode(true);
  const page = fragment.firstElementChild;
  page.querySelector('h1').textContent = title;
  const description = page.querySelector('p');
  if (message) description.textContent = message;
  else if (title === 'Page unavailable') description.hidden = true;
  if (retry) {
    const button = document.createElement('button');
    button.className = 'btn btn-secondary';
    button.type = 'button';
    button.textContent = 'Try again';
    button.addEventListener('click', () => location.reload());
    const row = document.createElement('p');
    row.append(button);
    description.after(row);
  }
  document.title = title + ' — Ledgerline';
  (landing.isConnected ? landing : document.querySelector('body > .n-root')).replaceWith(fragment);
  animatePageEntry(page);
}

const renderLoadError = () => renderPending('Page unavailable', 'Reload the page to try again.');

const communityDestination=communityRedirect(new URL(location.href));
if(legacyBillingRoute(path,location.search)){location.replace('/billing');}else if(path==='/motion-preview'){import('./pages/motion-preview.js').then(m=>m.preview(landing)).catch(renderLoadError);}else if(path==='/replay'){location.replace('/history');} else if(path==='/ai-reports'){location.replace('/reports'+location.search+location.hash);} else if(communityDestination) {
  location.replace(communityDestination);
} else if (path === '/') {
  openingReveal();
  animatePageEntry(landing);
  bindPublicAccount(landing);
  themeToggle.addEventListener('click', (event) =>
    transitionTheme(event, () => {
      const dark = !root.classList.contains('dark');
      setTheme(dark);
      localStorage.setItem('ledgerline-theme', dark ? 'dark' : 'light');
    }),
  );

  const questions = [...document.querySelectorAll('.lp-faq button')];
  questions.forEach((button) =>
    button.addEventListener('click', () => {
      const open = button.getAttribute('aria-expanded') === 'false';
      questions.forEach((question) => {
        const expanded = question === button && open;
        question.setAttribute('aria-expanded', String(expanded));
        document.getElementById(question.getAttribute('aria-controls')).hidden = !expanded;
      });
    }),
  );

  initMotion();
  initSectionRail();
  initLandingPricing();
  initToolWheel();
} else if (path === '/about') {
  landing.hidden = true;
  import('./pages/about.js').then(({ renderAbout }) => bindPublicAccount(renderAbout(landing))).catch(renderLoadError);
} else if (path.startsWith('/newsletter/')) {
  landing.hidden = true;
  import('./features/newsletter/public.js').then(({ renderNewsletterPublic }) => bindPublicAccount(renderNewsletterPublic(landing, path))).catch(renderLoadError);
} else if (path === '/support') {
  landing.hidden = true;
  import('./pages/support.js').then(({ renderSupport }) => bindPublicAccount(renderSupport(landing))).catch(renderLoadError);
} else if (path === '/terms' || path === '/privacy' || path === '/legal') {
  landing.hidden = true;
  if (path === '/legal') history.replaceState(null, '', '/privacy' + location.hash);
  import('./pages/legal.js').then(({ renderLegal }) => bindPublicAccount(renderLegal(landing))).catch(renderLoadError);
} else if (path.startsWith('/p/')) {
  landing.hidden = true;
  import('./pages/portfolio-public.js').then(({ renderPublicPortfolio }) =>
    renderPublicPortfolio(landing, path.slice(3))).catch(renderLoadError);
} else if (path === '/streak/share') {
  landing.hidden = true;
  import('./pages/streak-share.js').then(({ renderSharedStreak }) => renderSharedStreak(landing)).catch(renderLoadError);
} else if (path === '/streak/invite') {
  landing.hidden = true;
  import('./pages/streak-invite-page.js').then(({ renderStreakInvite }) => renderStreakInvite(landing)).catch(renderLoadError);
} else if (path === '/auth' || path === '/onboarding' || Object.hasOwn(appPages, path) || roomPath(path)) {
  landing.hidden = true;
  import('./auth.js')
    .then(({ renderAccountPage }) => renderAccountPage(path, landing, appPages))
    .catch(() => renderPending(path === '/auth' ? 'Sign-in unavailable' : 'Account could not load',
      'Try again in a moment.', true));
} else {
  renderPending('Page unavailable');
}
