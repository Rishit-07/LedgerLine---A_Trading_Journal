import { transitionTheme } from '../theme-transition.js';
import { animatePageEntry } from './navigation.js';
import { remember } from '../consent.js';

export function mountPage(previous, markup) {
  const template = document.createElement('template');
  template.innerHTML = markup.trim();
  const page = template.content.firstElementChild;
  previous.replaceWith(page);
  animatePageEntry(page);
  return page;
}

export function bindPageTheme(page) {
  const button = page.querySelector('[data-page-theme]');
  const root = document.documentElement;

  function update() {
    const dark = root.classList.contains('dark');
    const label = dark ? 'Light mode' : 'Dark mode';
    (button.querySelector('[data-theme-label]') ?? button).textContent = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(dark));
  }

  update();
  button.addEventListener('click', (event) => {
    transitionTheme(event, () => {
      root.classList.toggle('dark');
      remember('ledgerline-theme', root.classList.contains('dark') ? 'dark' : 'light');
      update();
    });
  });
}
