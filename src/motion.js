import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const one = (selector) => document.querySelector(selector);
const all = (selector) => [...document.querySelectorAll(selector)];
const clamp = gsap.utils.clamp(0, 1);
const ease = gsap.parseEase('power2.out');

function followSection(selector, update) {
  ScrollTrigger.create({
    trigger: selector,
    start: 'top top',
    end: 'bottom bottom',
    onUpdate: ({ progress }) => update(progress),
    onRefresh: ({ progress }) => update(progress),
  });
}

export function initMotion() {
  const motion = gsap.matchMedia();
  motion.add('(prefers-reduced-motion: no-preference)', () => {
    const progressBar = one('#lp-prog');
    ScrollTrigger.create({
      start: 0,
      end: 'max',
      onUpdate: ({ progress }) => {
        progressBar.style.width = progress * 100 + '%';
      },
    });

    const reveal = (element, start) =>
      ScrollTrigger.create({
        trigger: element,
        start,
        once: true,
        onEnter: () => element.classList.add('in'),
      });
    all('[data-rv]').forEach((element) => reveal(element, 'top 90%'));

    const scorePanel = one('#lp-panel');
    const scoreBacking = one('#lp-panel-in');
    const scoreTitle = one('#lp-exptitle');
    const caption = one('#lp-expcap');
    const score = one('#lp-score');
    const curve = one('#lp-curve');
    followSection('#lp-exp', (progress) => {
      const expanded = ease(clamp(progress / 0.62));
      const width = document.documentElement.clientWidth;
      const startWidth = Math.min(560, width * (width < 720 ? 0.84 : 0.4));
      scorePanel.style.width = gsap.utils.interpolate(startWidth, width, expanded) + 'px';
      scorePanel.style.height = gsap.utils.interpolate(0.5, 1, expanded) * innerHeight + 'px';
      scorePanel.style.borderRadius = 34 * (1 - expanded) + 'px';
      scoreBacking.style.transform = 'scale(' + gsap.utils.interpolate(1.45, 1, expanded) + ')';
      scoreTitle.style.opacity = clamp(1 - expanded * 2.2);
      scoreTitle.style.transform = 'translateY(' + -expanded * 50 + 'px)';
      const captionProgress = ease(clamp((progress - 0.66) / 0.22));
      caption.style.opacity = captionProgress;
      caption.style.transform = 'translateY(' + (1 - captionProgress) * 40 + 'px)';
      score.textContent = Math.round(74 * ease(clamp((progress - 0.1) / 0.6)));
      curve.style.strokeDashoffset = 1400 * (1 - ease(clamp((progress - 0.05) / 0.6)));
    });

    const words = all('.lp-sw');
    followSection('#lp-mf', (progress) => {
      words.forEach((word, index) => {
        word.style.opacity = (index + 1) / words.length <= progress * 1.12 + 0.02 ? 1 : 0.14;
      });
    });

    const counters = all('[data-count]');
    counters.forEach((element) => {
      const target = Number(element.dataset.count);
      const decimals = Number(element.dataset.dec);
      gsap.fromTo(
        element,
        { textContent: 0 },
        {
          textContent: target,
          ease: 'power2.out',
          scrollTrigger: { trigger: element, start: 'top 85%', end: 'top 35%', scrub: true },
          onUpdate: () => {
            element.textContent = Number(element.textContent).toFixed(decimals);
          },
        },
      );
    });

    return () => {
      progressBar.style.removeProperty('width');
      scoreBacking.style.removeProperty('transform');
      [scoreTitle, caption, ...words].forEach((element) => {
        element.style.removeProperty('opacity');
        element.style.removeProperty('transform');
      });
      curve.style.removeProperty('stroke-dashoffset');
      ['width', 'height', 'border-radius'].forEach((property) => scorePanel.style.removeProperty(property));
      score.textContent = '74';
    };
  });

  motion.add('(min-width: 901px) and (prefers-reduced-motion: no-preference)', () => {
    const track = one('#lp-hztrack');
    const bar = one('#lp-hzbar');
    const rail = one('.lp-hzrail');
    const numbers = all('.lp-hzn');
    const cards = all('.lp-hzc');
    followSection('#lp-hz', (progress) => {
      const width = document.documentElement.clientWidth;
      track.style.transform = 'translateX(' + -progress * Math.max(0, track.scrollWidth - width) + 'px)';
      bar.style.width = progress * rail.clientWidth + 'px';
      numbers.forEach((number, index) => {
        number.style.transform = 'translateX(' + (progress * 4 - index - 0.5) * -90 + 'px)';
      });
      cards.forEach((card) => {
        if (card.getBoundingClientRect().left < width * 0.8) card.classList.add('in');
      });
    });
    return () => [track, bar, ...numbers].forEach((element) => element.removeAttribute('style'));
  });

  motion.add('(min-width: 901px) and (pointer: fine) and (prefers-reduced-motion: no-preference)', () => {
    const hero = one('#lp-hero');
    const heroText = one('#lp-herotxt');
    const veil = one('#lp-veil');
    const layers = all('#lp-hero [data-par]');
    const tilt = one('#lp-hero [data-tilt]');
    const tiltX = gsap.quickTo(tilt, 'rotationX', { duration: 0.55, ease: 'power2.out' });
    const tiltY = gsap.quickTo(tilt, 'rotationY', { duration: 0.55, ease: 'power2.out' });
    const magnets = all('[data-mag]').map((element) => ({
      element,
      moveX: gsap.quickTo(element, 'x', { duration: 0.35 }),
      moveY: gsap.quickTo(element, 'y', { duration: 0.35 }),
    }));
    const cursor = one('#lp-cur');
    const cursorRing = one('#lp-cur2');
    const moveX = gsap.quickTo(cursor, 'x', { duration: 0.2, ease: 'power3.out' });
    const moveY = gsap.quickTo(cursor, 'y', { duration: 0.2, ease: 'power3.out' });
    const ringX = gsap.quickTo(cursorRing, 'x', { duration: 0.45, ease: 'power3.out' });
    const ringY = gsap.quickTo(cursorRing, 'y', { duration: 0.45, ease: 'power3.out' });
    let mouseX = 0.5;
    let mouseY = 0.5;
    let scroll = 0;

    function paintHero() {
      const fraction = clamp(scroll / hero.clientHeight);
      layers.forEach((layer) => {
        const sway = Number(layer.dataset.mx || 0);
        const x = (mouseX - 0.5) * sway;
        const y = scroll * Number(layer.dataset.par) + (mouseY - 0.5) * sway * 0.4;
        layer.style.transform =
          'translate3d(' + x + 'px,' + y + 'px,0) scale(' + (1 + fraction * Number(layer.dataset.zoom || 0)) + ')';
      });
      heroText.style.opacity = clamp(1 - fraction * 1.5);
      heroText.style.transform = 'translateY(' + -fraction * 90 + 'px)';
      heroText.style.filter = 'blur(' + fraction * 10 + 'px)';
      veil.style.opacity = clamp(fraction * 1.1);
    }

    function trackPointer(event) {
      if (event.pointerType !== 'mouse') return;
      const { clientX, clientY } = event;
      const target = event.target.closest('[data-hover], a, button, summary');
      const inPage = Boolean(event.target.closest('.lp-pane'));
      document.documentElement.classList.toggle('custom-cursor', inPage);
      moveX(clientX);
      moveY(clientY);
      ringX(clientX);
      ringY(clientY);
      cursor.classList.toggle('on', Boolean(target));
      cursor.dataset.l = target?.dataset.hover || '';
      if (scroll < hero.clientHeight) {
        mouseX = clientX / innerWidth;
        mouseY = clientY / innerHeight;
        paintHero();
        const rect = tilt.getBoundingClientRect();
        tiltX(gsap.utils.clamp(-7, 7, ((rect.top + rect.height / 2 - clientY) / 380) * 7));
        tiltY(gsap.utils.clamp(-9, 9, ((clientX - rect.left - rect.width / 2) / 520) * 9));
      }
      magnets.forEach(({ element, moveX, moveY }) => {
        const rect = element.getBoundingClientRect();
        const dx = clientX - rect.left - rect.width / 2;
        const dy = clientY - rect.top - rect.height / 2;
        const close = Math.hypot(dx, dy) < 130;
        moveX(close ? dx * 0.28 : 0);
        moveY(close ? dy * 0.28 : 0);
      });
      const spot = event.target.closest('[data-spot]');
      if (spot) {
        const rect = spot.getBoundingClientRect();
        spot.style.setProperty('--mx', clientX - rect.left + 'px');
        spot.style.setProperty('--my', clientY - rect.top + 'px');
      }
    }

    function hideCursor() {
      document.documentElement.classList.remove('custom-cursor');
    }

    document.addEventListener('pointermove', trackPointer);
    document.documentElement.addEventListener('pointerleave', hideCursor);
    ScrollTrigger.create({
      trigger: hero,
      start: 'top top',
      end: 'bottom top',
      onUpdate: ({ progress }) => {
        scroll = progress * hero.clientHeight;
        paintHero();
      },
    });

    return () => {
      document.removeEventListener('pointermove', trackPointer);
      document.documentElement.removeEventListener('pointerleave', hideCursor);
      hideCursor();
      [heroText, veil, ...layers].forEach((element) => {
        ['opacity', 'transform', 'filter'].forEach((property) => element.style.removeProperty(property));
      });
    };
  });

  document.fonts.ready.then(() => ScrollTrigger.refresh());
}
