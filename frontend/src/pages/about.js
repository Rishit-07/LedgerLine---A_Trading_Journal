import pageMarkup from './about.html?raw';
import { bindPageTheme, mountPage } from './shared.js';
import { initSectionRail } from '../section-rail.js';
import './about-design.css';
import './about-layout.css';

const clamp = (value) => Math.max(0, Math.min(1, value));
const ease = (value) => 1 - (1 - clamp(value)) ** 3;

function bindNewsletter(form) {
  const button = form.querySelector('button');
  const status = form.querySelector('[role="status"]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (button.disabled) return;
    button.disabled = true;
    status.textContent = 'Saving your subscription…';
    const email = form.elements.email.value;
    try {
      const response = await fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
        signal: AbortSignal.timeout(10000),
      });
      if (response.status === 400) {
        status.textContent = 'Enter a valid email address.';
        return;
      }
      if (!response.ok) throw new Error('Subscription unavailable');
      if (form.elements.email.value === email) form.reset();
      status.textContent = 'You’re on the list for the weekly process note.';
    } catch {
      status.textContent = 'We couldn’t save your subscription. Please try again.';
    } finally {
      button.disabled = false;
    }
  });
}

export function renderAbout(landing) {
  document.title = 'About Ledgerline';
  const page = mountPage(landing, pageMarkup);
  bindPageTheme(page);
  bindNewsletter(page.querySelector('.about-newsletter'));
  initSectionRail();
  const all = (selector) => [...page.querySelectorAll(selector)];
  const one = (selector) => page.querySelector(selector);
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const desktop = matchMedia('(min-width: 901px)');
  const questions = all('.lp-faq button');
  questions.forEach((button) =>
    button.addEventListener('click', () => {
      const opening = button.getAttribute('aria-expanded') === 'false';
      questions.forEach((question) => {
        const expanded = question === button && opening;
        question.setAttribute('aria-expanded', String(expanded));
        document.getElementById(question.getAttribute('aria-controls')).hidden = !expanded;
      });
    }),
  );

  const iris = one('#ab-iris');
  const backdrop = one('#ab-irbg');
  const label = one('#ab-irlab');
  const words = all('.ab-iw');
  const story = one('#ab-ch');
  const chapters = all('.ab-chp').map((element) => ({
    element,
    text: element.querySelector('.ab-tx'),
    card: element.querySelector('.ab-card'),
    number: element.querySelector('.ab-big'),
    lines: [...element.querySelectorAll('.ab-ln > span')],
  }));
  const ticks = all('.ab-tick');
  const rail = one('#ab-railfill');
  const timeline = one('#ab-tl');
  const timelineFill = one('#ab-tlfill');
  const milestones = all('.ab-tli');
  const bars = all('.ab-bar');
  const counts = all('[data-count]');
  const reveals = all('[data-rv]');
  const progress = one('#lp-prog');
  const hero = one('#lp-hero');
  const layers = all('#lp-hero [data-par]');

  function animate() {
    const vh = innerHeight;
    const staticView = reduce.matches;
    const pinned = desktop.matches && !staticView;
    const sectionProgress = (element) => {
      const rect = element.getBoundingClientRect();
      return clamp(-rect.top / Math.max(1, rect.height - vh));
    };
    progress.style.width = (scrollY / Math.max(1, document.documentElement.scrollHeight - vh)) * 100 + '%';
    const irisProgress = pinned ? sectionProgress(iris) : 1;
    backdrop.style.clipPath = 'circle(' + ease(irisProgress / 0.4) * 150 + '% at 50% 52%)';
    label.style.opacity = clamp((irisProgress - 0.22) / 0.12);
    const revealedWords = clamp((irisProgress - 0.3) / 0.52) * words.length;
    words.forEach((word, index) => {
      const lit = clamp(revealedWords - index + 0.6);
      word.style.opacity = 0.12 + 0.88 * lit;
      word.style.transform = 'translateY(' + (1 - lit) * 16 + 'px)';
    });

    const chapterProgress = pinned ? sectionProgress(story) : 0;
    const position = chapterProgress * chapters.length;
    const activeChapter = Math.min(Math.floor(position), chapters.length - 1);
    chapters.forEach(({ element, text, card, number, lines }, index) => {
      const phase = position - index;
      const enter = index === 0 ? 1 : clamp(phase / 0.22);
      const exit = index === chapters.length - 1 ? 1 : clamp((1 - phase) / 0.22);
      const visibility = !pinned ? 1 : index === activeChapter ? 0.3 + 0.7 * enter * exit : 0;
      const direction = phase < 0.5 ? 1 : -1;
      const offset = (1 - visibility) * 70 * direction;
      element.style.opacity = visibility;
      element.style.visibility = visibility < 0.01 ? 'hidden' : 'visible';
      text.style.transform = 'translateY(' + offset + 'px)';
      card.style.clipPath = 'inset(0 0 ' + (1 - ease(visibility * 1.15)) * 100 + '% 0 round 30px)';
      card.style.transform =
        'translateY(' + -offset * 0.5 + 'px) rotate(' + (1 - visibility) * 3 * direction + 'deg)';
      number.style.setProperty('--f', (pinned ? clamp(phase * 1.5 + 0.35) : 1) * 100 + '%');
      number.style.transform = 'translateY(' + offset * 0.4 + 'px)';
      lines.forEach((line, lineIndex) => {
        line.style.transform =
          'translateY(' + (1 - ease(visibility * 1.6 - lineIndex * 0.25)) * 105 * direction + '%)';
      });
    });
    ticks.forEach((tick, index) => tick.classList.toggle('on', index === activeChapter));
    rail.style.transform = 'scaleY(' + chapterProgress + ')';

    const timelineRect = timeline.getBoundingClientRect();
    timelineFill.style.transform =
      'scaleY(' + (staticView ? 1 : clamp((vh * 0.72 - timelineRect.top) / timelineRect.height)) + ')';
    milestones.forEach((item) =>
      item.classList.toggle('in', staticView || item.getBoundingClientRect().top < vh * 0.72),
    );
    bars.forEach((bar) => {
      const progress = staticView ? 1 : ease((vh * 0.92 - bar.getBoundingClientRect().top) / (vh * 0.4));
      bar.firstElementChild.style.width = progress * Number(bar.dataset.w) + '%';
      const amount = bar.parentElement.querySelector('.ab-bn');
      amount.textContent = Math.round(progress * Number(amount.dataset.v)) + '%';
    });
    reveals.forEach((el) => {
      if (staticView || el.getBoundingClientRect().top < vh * 0.91) el.classList.add('in');
    });
    counts.forEach((element) => {
      const progress = staticView ? 1 : ease((vh * 0.85 - element.getBoundingClientRect().top) / (vh * 0.5));
      element.textContent = (Number(element.dataset.count) * progress).toFixed(Number(element.dataset.dec || 0));
    });
    const distance = pinned ? Math.min(scrollY, hero.offsetHeight) : 0;
    layers.forEach((layer) => {
      layer.style.transform = 'translateY(' + distance * Number(layer.dataset.par) + 'px)';
    });
  }

  let frame;
  function schedule() {
    if (frame) return;
    frame = requestAnimationFrame(() => {
      frame = 0;
      animate();
    });
  }
  addEventListener('scroll', schedule, { passive: true });
  addEventListener('resize', schedule, { passive: true });
  reduce.addEventListener('change', schedule);
  document.fonts.ready.then(schedule);
  animate();
  if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
  return page;
}
