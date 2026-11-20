import markup from './legal.html?raw';
import { legalDocuments } from './legal-copy.js';
import { bindPageTheme, mountPage } from './shared.js';
import './legal.css';

export function renderLegal(landing) {
  const page = mountPage(landing, markup);
  bindPageTheme(page);
  const tabs = page.querySelector('.legal-tabs');
  const toc = page.querySelector('.legal-toc ol');
  const article = page.querySelector('.legal-article');
  const links = [...tabs.querySelectorAll('a')];
  const titles = page.querySelectorAll('[data-legal-title]');
  const notice =
    'Questions about this document? Contact [legal contact email]. Operator: [company name and registered address].';
  let activeDocument;

  function setDocument() {
    const isTerms = location.pathname.replace(/\/$/, '') === '/terms';
    const key = isTerms ? 'terms' : 'privacy';
    if (key === activeDocument) return;
    activeDocument = key;
    const { title, sections } = legalDocuments[key];
    document.title = title + ' — Ledgerline';
    titles.forEach((element) => {
      element.textContent = title;
    });
    tabs.style.setProperty('--tab', Number(isTerms));
    links.forEach((link, index) => {
      if (index === Number(isTerms)) link.setAttribute('aria-current', 'page');
      else link.removeAttribute('aria-current');
    });
    const items = [];
    const cards = sections.map(([heading, copy], index) => {
      const number = String(index + 1).padStart(2, '0');
      const id = 'clause-' + (index + 1);
      const item = document.createElement('li');
      const link = document.createElement('a');
      const tocNumber = document.createElement('span');
      tocNumber.className = 'n-mono';
      tocNumber.textContent = number;
      link.href = '#' + id;
      link.append(tocNumber, ' ', heading);
      item.append(link);
      items.push(item);
      const card = document.createElement('section');
      card.className = 'legal-card n-out';
      card.id = id;
      card.style.setProperty('--delay', Math.min(index, 7) * 45 + 'ms');
      const subtitle = document.createElement('h2');
      const indexBadge = document.createElement('span');
      indexBadge.className = 'n-in n-mono';
      indexBadge.textContent = number;
      subtitle.append(indexBadge, heading);
      const text = document.createElement('p');
      text.textContent = copy;
      card.append(subtitle, text);
      return card;
    });
    const contact = document.createElement('p');
    contact.className = 'legal-contact n-in';
    contact.textContent = notice;
    toc.replaceChildren(...items);
    article.replaceChildren(...cards, contact);
  }

  setDocument();
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  links.forEach((link) =>
    link.addEventListener('click', (event) => {
      if (event.button || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      event.preventDefault();
      if (link.getAttribute('aria-current') === 'page') return;
      history.pushState(null, '', link.pathname);
      setDocument();
      scrollTo({ top: 0, behavior: 'instant' });
    }),
  );
  addEventListener('popstate', setDocument);
  page.querySelector('[data-print]').addEventListener('click', () => print());
  return page;
}
