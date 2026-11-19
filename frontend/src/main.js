import '@fontsource-variable/schibsted-grotesk';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import '@fontsource/ibm-plex-mono/600.css';
import './styles/tokens.css';
import './styles/landing.css';
import './styles/responsive.css';
import { initMotion } from './motion.js';
import { initSectionRail } from './section-rail.js';
import { initToolWheel } from './tool-wheel.js';
import { transitionTheme } from './theme-transition.js';
import { isSignedIn, signIn, signOut } from './auth.js';

const landing = document.querySelector('#landing');
const root = document.documentElement;
const themeToggle = document.querySelector('[data-action="toggleTheme"]');

function setTheme(dark) {
  root.classList.toggle('dark', dark);
  themeToggle.textContent = dark ? 'Light mode' : 'Dark mode';
  themeToggle.setAttribute('aria-pressed', String(dark));
}

setTheme(localStorage.getItem('ledgerline-theme') === 'dark');

const pages = {
  '/dashboard': 'Dashboard',
  '/about': 'About',
  '/legal': 'Privacy and terms',
  '/support': 'Help center',
  '/journal': 'Trade journal',
  '/forecast': 'Forecast ledger',
  '/calendar': 'Trading calendar',
  '/sizing': 'Sizing lab',
  '/clubs': 'Clubs',
  '/coach': 'AI coach',
  '/plan': 'Plan',
  '/mistake': 'Mistake lab',
  '/replay': 'Replay',
  '/reports': 'Weekly reports',
  '/badges': 'Badges',
  '/portfolio': 'Portfolio',
};
const path = location.pathname.replace(/\/$/, '') || '/';
const requiresSignIn = path === '/replay';

if (requiresSignIn && !isSignedIn()) {
  location.replace('/auth?next=%2Freplay');
} else if (path === '/auth') {
  const next = new URLSearchParams(location.search).get('next') === '/replay' ? '/replay' : '/dashboard';
  if (isSignedIn()) {
    location.replace(next);
  } else {
    const fragment = document.querySelector('#sign-in-page').content.cloneNode(true);
    if (next === '/replay') {
      fragment.querySelector('#sign-in-message').textContent = 'Start a demo session to continue to Replay.';
    }
    fragment.querySelector('form').addEventListener('submit', (event) => {
      event.preventDefault();
      signIn();
      location.replace(next);
    });
    document.title = 'Sign in — Ledgerline';
    landing.replaceWith(fragment);
  }
} else if (path === '/') {
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
  initToolWheel();
} else {
  const fragment = document.querySelector('#pending-page').content.cloneNode(true);
  const title = pages[path] ?? 'Page unavailable';
  fragment.querySelector('h1').textContent = title;
  if (!pages[path]) fragment.querySelector('p').hidden = true;
  if ((requiresSignIn || path === '/dashboard') && isSignedIn()) {
    const button = fragment.querySelector('[data-sign-out]');
    button.hidden = false;
    button.addEventListener('click', () => {
      signOut();
      location.replace('/');
    });
  }
  document.title = title + ' — Ledgerline';
  landing.replaceWith(fragment);
}
