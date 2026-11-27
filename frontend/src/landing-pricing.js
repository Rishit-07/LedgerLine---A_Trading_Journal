/* Landing page pricing: monthly/yearly switch and a count-up when the section scrolls into view.
   The prices below must match backend/src/billing-config.js (a backend test checks this). */
const PRICES = {
  free: { monthly: 0, yearly: 0 },
  pro: { monthly: 5.99, yearly: 59, intro: 2.99 },
  mentor: { monthly: 17.99, yearly: 179, intro: 8.99 },
};
const money = (v) => (Number.isInteger(v) ? String(v) : v.toFixed(2));

export function initLandingPricing() {
  const root = document.getElementById('pricing');
  if (!root) return;
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const buttons = [...root.querySelectorAll('[data-term]')];
  let term = 'monthly';
  let shown = false;

  const target = (key) => PRICES[key][term];
  const text = (card, key) => {
    const p = PRICES[key];
    card.querySelector('.lp-per').textContent = key === 'free' ? 'forever' : term === 'monthly' ? 'a month' : 'a year';
    card.querySelector('[data-note]').textContent =
      key === 'free' ? 'No card, no trial clock.'
        : term === 'monthly' ? `Intro price: $${money(p.intro)} a month for your first 2 months, then $${money(p.monthly)}.`
          : `About $${money(Math.round((p.yearly / 12) * 100) / 100)} a month. Two months free.`;
  };
  const tween = (el, to, from = 0) => {
    if (reduce) { el.textContent = money(to); return; }
    const start = performance.now(), dur = 900;
    const step = (now) => {
      const t = Math.min(1, (now - start) / dur), e = 1 - (1 - t) ** 3;
      el.textContent = money(Math.round((from + (to - from) * e) * 100) / 100);
      if (t < 1) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  };
  const paint = (animate) => {
    for (const card of root.querySelectorAll('[data-plan]')) {
      const key = card.dataset.plan, amt = card.querySelector('[data-count]');
      text(card, key);
      if (!animate) { amt.textContent = money(target(key)); continue; }
      if (term === 'monthly' && !shown) tween(amt, target(key));
      else { amt.classList.remove('roll'); void amt.offsetWidth; amt.classList.add('roll'); amt.textContent = money(target(key)); }
    }
  };
  for (const b of buttons) b.addEventListener('click', () => {
    if (b.dataset.term === term) return;
    term = b.dataset.term;
    for (const x of buttons) x.setAttribute('aria-pressed', String(x === b));
    shown = true;
    paint(true);
  });
  paint(false);
  if (reduce || !('IntersectionObserver' in window)) return;
  for (const amt of root.querySelectorAll('[data-count]')) amt.textContent = '0';
  new IntersectionObserver((entries, io) => {
    if (!entries.some((e) => e.isIntersecting)) return;
    io.disconnect();
    paint(true);
    shown = true;
  }, { threshold: 0.35 }).observe(root.querySelector('.lp-plans'));
}
