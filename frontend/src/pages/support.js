import pageMarkup from './support.html?raw';
import { bindPageTheme, mountPage } from './shared.js';
import '@fontsource/instrument-serif/latin-400.css';
import './support.css';

const inbox = 'ledgerline.team@gmail.com';
const faqs = [
  ['journal', 'How is the Trader Score calculated?', 'The score weighs rule-following (30%), risk-adjusted results (30%), consistency (20%), journal completeness (10%) and forecast calibration (10%). Results are measured in R and percent.', 'score scoring formula process risk journal rules'],
  ['ai', 'Does Ledgerline give trade ideas or signals?', 'Ledgerline records and scores your own trading. It does not recommend trades or provide investment advice.', 'tips trade ideas alerts buy sell recommendation AI coach'],
  ['getting-started', 'How do I create and verify an account?', 'On the sign-in page, choose Create account. With email and password, open the verification link in your inbox, then return to Ledgerline and choose “I’ve verified my email.” You can also continue with Google.', 'register signup sign up create account Google login'],
  ['account', 'What if my verification email hasn’t arrived?', 'Check spam and confirm that you used the right address. Choose Resend verification email on the verification screen, or Use another account to enter a different address.', 'missing verification mail not received code resend delivery inbox spam getting receive'],
  ['getting-started', 'When will I get a welcome email?', 'Firebase sends a verification email for password signups. If welcome email delivery is enabled, Ledgerline sends a separate welcome message after you verify your address.', 'welcome mail signup confirmation greeting first account'],
  ['sizing', 'What is the difference between Kelly and sequence staking?', 'The Kelly criterion uses estimated edge and payout to calculate a position size. Sequence staking sets a stake across a fixed series of outcomes. These methods help with planning a trade.', 'sizing trade calculator position size risk stake quantity'],
  ['clubs', 'Who can see my results in a club?', 'The club design shows results you choose to share, such as closed trades in percent or R and your Trader Score. Club sharing is still in development.', 'privacy social public share visibility'],
  ['account', 'How do I export my data or delete my account?', 'Use the contact form with the Data request topic. Include the email address attached to your Ledgerline account so the team can follow up.', 'download export CSV remove delete close account erase privacy data'],
];
const filler = new Set('a an are can could did do does for get had has have how i in is it me my not of on please should so the this to was what when where which who why will with you your'.split(' '));
const words = (text) => text.toLowerCase().normalize('NFKD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]+/gu) ?? [];

function makeAnswer(question, answer, group) {
  const item = document.createElement('details');
  item.className = 'support-faq';
  item.name = group;
  item.innerHTML = '<summary class="n-out"><span></span><svg aria-hidden="true"><use href="#support-chevron"/></svg></summary><p class="n-in"></p>';
  item.querySelector('span').textContent = question;
  item.querySelector('p').textContent = answer;
  return item;
}

function relevance(tokens, fields) {
  let count = 0;
  let score = 0;
  for (const token of tokens) {
    const index = fields.findIndex((field) => field.some((word) =>
      word === token || (token.length >= 3 && word.startsWith(token)) || token === word + 's',
    ));
    if (index < 0) continue;
    count++;
    score += [4, 3, 1][index];
  }
  return count >= Math.ceil(tokens.length * 0.6) ? count * 5 + score : 0;
}

function bindHelpSearch(page) {
  const search = page.querySelector('#support-search');
  const list = page.querySelector('#support-faq-list');
  const feedback = page.querySelector('[data-faq-status]');
  const clear = page.querySelector('[data-clear-support-search]');
  const results = page.querySelector('[data-search-matches]');
  const searchStatus = page.querySelector('[data-search-status]');
  const empty = page.querySelector('[data-search-empty]');
  const topics = [...page.querySelectorAll('[data-support-topic]')];
  let activeTopic = '';

  const items = faqs.map(([topic, question, answer, keywords]) => {
    const item = makeAnswer(question, answer, 'support-faq');
    list.append(item);
    return { item, topic, question, answer, fields: [words(question), words(`${topic} ${keywords}`), words(answer)] };
  });

  function filter() {
    let count = 0;
    items.forEach(({ item, topic }) => {
      item.hidden = Boolean(activeTopic && topic !== activeTopic);
      if (item.hidden) item.open = false;
      else count++;
    });
    topics.forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.supportTopic === activeTopic)));
    clear.hidden = !activeTopic;
    feedback.textContent = clear.hidden
      ? 'Choose a question to open its answer.'
      : count === 0 ? 'No articles match these filters.' : `${count} ${count === 1 ? 'article' : 'articles'} found.`;
  }

  function findAnswers() {
    const query = search.value.trim();
    const tokens = [...new Set(words(query).filter((word) => !filler.has(word)))];
    const matches = tokens.length ? items.map((article) => ({ article, score: relevance(tokens, article.fields) }))
      .filter(({ score }) => score > 0).sort((a, b) => b.score - a.score) : [];
    results.replaceChildren(...matches.map(({ article }) => makeAnswer(article.question, article.answer, 'support-search')));
    const count = matches.length;
    empty.hidden = !query || count > 0;
    searchStatus.textContent = count ? `${count} ${count === 1 ? 'answer' : 'answers'} found.` : query ? 'No matching answers.' : '';
  }

  topics.forEach((topic) => topic.addEventListener('click', () => {
    const key = topic.dataset.supportTopic;
    activeTopic = activeTopic === key ? '' : key;
    filter();
  }));
  clear.addEventListener('click', () => {
    activeTopic = '';
    filter();
    list.querySelector('summary')?.focus();
  });
  search.addEventListener('input', findAnswers);
  search.form.addEventListener('submit', (event) => {
    event.preventDefault();
    const best = results.firstElementChild;
    if (!best) return;
    best.open = true;
    best.querySelector('summary').focus();
  });
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
  const send = form.querySelector('button[type="submit"]');
  let edits = 0;

  function readForm() {
    const { email, subject, message, topic, priority } = form.elements;
    for (const field of [email, subject, message]) {
      if (field.value.trim()) continue;
      field.setCustomValidity('Enter a value for this field.');
      field.reportValidity();
      return null;
    }
    return { email: email.value.trim(), subject: subject.value.trim(), message: message.value.trim(), topic: topic.value, priority: priority.value };
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (send.disabled) return;
    const fields = readForm();
    if (!fields) return;
    const submittedVersion = edits;
    send.disabled = true;
    status.textContent = 'Sending your message…';
    try {
      const response = await fetch('/api/support', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(fields), signal: AbortSignal.timeout(40000),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok || data?.sent !== true) {
        status.textContent = data?.error ?? 'We couldn’t send your message. Try opening an email draft.';
        return;
      }
      if (edits === submittedVersion) form.reset();
      status.textContent = 'Message sent to Ledgerline Support. Look for a reply in your inbox.';
    } catch {
      status.textContent = 'Delivery could not be confirmed. Check your connection or open an email draft.';
    } finally {
      send.disabled = false;
    }
  });
  form.querySelector('[data-support-draft]').addEventListener('click', () => {
    if (!form.reportValidity()) return;
    const fields = readForm();
    if (!fields) return;
    const title = `[Ledgerline • ${fields.topic}] ${fields.subject}`;
    const body = `Reply email: ${fields.email}\r\nTopic: ${fields.topic}\r\nPriority: ${fields.priority}\r\n\r\n${fields.message}`;
    const draft = `mailto:${inbox}?subject=${encodeURIComponent(title)}&body=${encodeURIComponent(body)}`;
    status.textContent = 'Send the draft from your email app. If it doesn’t open, use the address below.';
    location.href = draft;
  });
  form.addEventListener('input', (event) => {
    edits++;
    event.target.setCustomValidity('');
    if (!send.disabled) status.textContent = '';
  });
}

export function renderSupport(landing) {
  document.title = 'Help center — Ledgerline';
  const page = mountPage(landing, pageMarkup);
  bindPageTheme(page);
  bindHelpSearch(page);
  bindContactForm(page);
  if (location.hash === '#contact') page.querySelector('#contact').scrollIntoView();
  return page;
}
