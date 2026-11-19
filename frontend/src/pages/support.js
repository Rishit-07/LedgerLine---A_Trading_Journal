import pageMarkup from './support.html?raw';
import { bindPageTheme, mountPage } from './shared.js';
import '@fontsource/instrument-serif/latin-400.css';
import './support.css';

const inbox = 'ledgerline.team@gmail.com';
const faqs = [
  ['journal', 'How is the Trader Score calculated?', 'The score weighs rule-following (30%), risk-adjusted results (30%), consistency (20%), journal completeness (10%) and forecast calibration (10%). Results are measured in R and percent.'],
  ['ai', 'Does Ledgerline give trade ideas or signals?', 'Ledgerline records and scores your own trading. It does not recommend trades or provide investment advice.'],
  ['getting-started', 'How do I create and verify an account?', 'On the sign-in page, choose Create account. With email and password, open the verification link in your inbox, then return to Ledgerline and choose “I’ve verified my email.” You can also continue with Google.'],
  ['account', 'What if my verification email hasn’t arrived?', 'Check spam and confirm that you used the right address. Choose Resend verification email on the verification screen, or Use another account to enter a different address.'],
  ['sizing', 'What is the difference between Kelly and sequence staking?', 'The Kelly criterion uses estimated edge and payout to calculate a position size. Sequence staking sets a stake across a fixed series of outcomes. These methods help with planning a trade.'],
  ['clubs', 'Who can see my results in a club?', 'The club design shows results you choose to share, such as closed trades in percent or R and your Trader Score. Club sharing is still in development.'],
  ['account', 'How do I export my data or delete my account?', 'Use the contact form with the Data request topic. Send the message from the email address attached to your Ledgerline account so the team can follow up.'],
];

function bindHelpSearch(page) {
  const search = page.querySelector('#support-search');
  const list = page.querySelector('#support-faq-list');
  const feedback = page.querySelector('[data-faq-status]');
  const clear = page.querySelector('[data-clear-support-search]');
  const topics = [...page.querySelectorAll('[data-support-topic]')];
  let activeTopic = '';

  const items = faqs.map(([topic, question, answer]) => {
    const item = document.createElement('details');
    item.className = 'support-faq';
    item.name = 'support-faq';
    item.innerHTML = '<summary class="n-out"><span></span><svg aria-hidden="true"><use href="#support-chevron"/></svg></summary><p class="n-in"></p>';
    item.querySelector('span').textContent = question;
    item.querySelector('p').textContent = answer;
    list.append(item);
    return { item, topic, text: `${topic} ${question} ${answer}`.toLowerCase() };
  });

  function filter() {
    const words = search.value.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
    let count = 0;
    items.forEach(({ item, topic, text }) => {
      item.hidden = Boolean(activeTopic && topic !== activeTopic) || !words.every((word) => text.includes(word));
      if (item.hidden) item.open = false;
      else count++;
    });
    topics.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.supportTopic === activeTopic)));
    clear.hidden = !activeTopic && !words.length;
    feedback.textContent = clear.hidden
      ? 'Choose a question to open its answer.'
      : count === 0 ? 'No articles match these filters.' : `${count} ${count === 1 ? 'article' : 'articles'} found.`;
  }

  topics.forEach((topic) => topic.addEventListener('click', () => {
    const key = topic.dataset.supportTopic;
    activeTopic = activeTopic === key ? '' : key;
    filter();
  }));
  clear.addEventListener('click', () => {
    activeTopic = '';
    search.value = '';
    search.focus();
    filter();
  });
  search.addEventListener('input', filter);
  page.querySelector('[data-focus-support-search]').addEventListener('click', () => search.focus());
  document.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
      event.preventDefault();
      search.focus();
    }
  });
}

function bindContactForm(page) {
  const link = page.querySelector('[data-support-email]');
  link.href = `mailto:${inbox}`;
  link.textContent = inbox;
  const form = page.querySelector('.support-form');
  const status = form.querySelector('[data-contact-status]');

  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const { subject, message, topic, priority } = form.elements;
    for (const field of [subject, message]) {
      if (field.value.trim()) continue;
      field.setCustomValidity('Enter a value before opening the draft.');
      field.reportValidity();
      return;
    }
    const title = `[Ledgerline • ${topic.value}] ${subject.value.trim()}`;
    const body = `Topic: ${topic.value}\r\nPriority: ${priority.value}\r\n\r\n${message.value.trim()}`;
    const draft = `mailto:${inbox}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    status.textContent = 'Send the draft from your email app. If it doesn’t open, use the address below.';
    location.href = draft;
  });
  form.addEventListener('input', (event) => {
    event.target.setCustomValidity('');
    status.textContent = '';
  });
}

export function renderSupport(landing) {
  document.title = 'Help center — Ledgerline';
  const page = mountPage(landing, pageMarkup);
  bindPageTheme(page);
  bindHelpSearch(page);
  bindContactForm(page);
  if (location.hash === '#contact') page.querySelector('#contact').scrollIntoView();
}
