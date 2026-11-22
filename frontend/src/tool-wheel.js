export function initToolWheel() {
  const root = document.querySelector('.ac-wheel');
  const cards = Array.from(root.querySelectorAll('.ac-card'));
  const pivot = root.querySelector('.ac-pivot');
  const opens = Array.from(root.querySelectorAll('.ac-open'));
  const dots = Array.from(root.querySelectorAll('.ac-dot'));
  const numEl = root.querySelector('.ac-num'),
    nameEl = root.querySelector('.ac-name'),
    descEl = root.querySelector('.ac-desc');
  const NAMES = [
      'Plan',
      'Journal',
      'Mistake lab',
      'Sizing lab',
      'Billing',
      'Weekly reports',
      'Badges',
      'Portfolio',
      'Clubs',
      'AI coach',
    ],
    DESCS = [
      'Set your bias, setups and loss limit before the open, then lock it.',
      'Log each trade with its chart, notes and a rule check.',
      'See which mistake costs you most and track the fix over four weeks.',
      'Kelly and sequence staking on your own numbers. Planning tools only.',
      'Compare plans and manage your billing.',
      'A Sunday summary of rules kept, streaks and what to change.',
      'Earned for process, never for profit.',
      'A shareable page and QR that shows how you trade, not what you made.',
      'Join a club, compete on rules followed and see the rankings.',
      'Ask about your own data. It explains and never gives signals.',
    ];
  const N = cards.length,
    GAP = 16,
    STIFF = 0.2,
    DAMP = 0.4;
  const reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const st = {
    active: 4,
    intro: true,
    fan: false,
    lock: false,
    shown: 4,
    ang: cards.map(() => 0),
    vel: cards.map(() => 0),
  };
  const show = (i) => {
    if (i === st.shown) return;
    st.shown = i;
    numEl.textContent = String(i + 1).padStart(2, '0');
    nameEl.textContent = NAMES[i];
    descEl.textContent = DESCS[i];
    opens.forEach((a) => a.classList.toggle('on', Number(a.dataset.i) === i));
    dots.forEach((d, k) => d.classList.toggle('on', k === i));
  };
  const go = (i) => {
    st.active = Math.max(0, Math.min(N - 1, i));
  };
  const step = (d) => {
    if (st.intro || st.lock) return;
    const t = Math.max(0, Math.min(N - 1, st.active + d));
    if (t === st.active) return;
    st.active = t;
    st.lock = true;
    setTimeout(() => {
      st.lock = false;
    }, 380);
  };
  if (reduced) {
    cards.forEach((c, i) => {
      st.ang[i] = (i - st.active) * GAP;
    });
    st.intro = false;
  } else {
    pivot.classList.add('ac-pre');
    const start = () => {
      pivot.classList.remove('ac-pre');
      pivot.classList.add('ac-go');
      setTimeout(() => {
        st.fan = true;
      }, 900);
    };
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (es) => {
          if (es[0].isIntersecting) {
            io.disconnect();
            start();
          }
        },
        { threshold: 0.35 },
      );
      io.observe(root);
    } else start();
  }
  const loop = () => {
    if (st.intro) {
      if (st.fan) {
        let settled = true;
        for (let i = 0; i < N; i++) {
          const target = (i - st.active) * GAP;
          st.vel[i] += (target - st.ang[i]) * 0.01;
          st.vel[i] *= 0.88;
          st.ang[i] += st.vel[i];
          if (Math.abs(target - st.ang[i]) > 0.5 || Math.abs(st.vel[i]) > 0.5) settled = false;
        }
        if (settled) st.intro = false;
      }
    } else {
      const L = N - 1;
      const lt = (L - st.active) * GAP;
      st.vel[L] += (lt - st.ang[L]) * STIFF;
      st.vel[L] *= DAMP;
      st.ang[L] += st.vel[L];
      for (let i = L - 1; i >= 0; i--) {
        const tg = st.ang[i + 1] - GAP;
        st.vel[i] += (tg - st.ang[i]) * STIFF;
        st.vel[i] *= DAMP;
        st.ang[i] += st.vel[i];
      }
    }
    let min = 1e9,
      near = 0;
    for (let i = 0; i < N; i++) {
      cards[i].style.transform = 'rotate(' + st.ang[i].toFixed(3) + 'deg) translateY(-800px)';
      const a = Math.abs(st.ang[i]);
      if (a < min) {
        min = a;
        near = i;
      }
    }
    if (!st.intro) {
      for (let i = 0; i < N; i++) cards[i].style.zIndex = String(N - Math.abs(i - near));
      show(near);
    }
    requestAnimationFrame(loop);
  };
  if (!reduced) {
    cards.forEach((c, i) => {
      st.ang[i] = 0;
    });
  }
  requestAnimationFrame(loop);
  root
    .querySelectorAll('.ac-arrow')
    .forEach((b) => b.addEventListener('click', () => step(Number(b.getAttribute('data-d')) > 0 ? 1 : -1)));
  dots.forEach((d) =>
    d.addEventListener('click', () => {
      if (!st.intro) go(Number(d.getAttribute('data-i')));
    }),
  );
  cards.forEach((c, i) =>
    c.addEventListener('click', () => {
      if (!st.intro && !moved) go(i);
    }),
  );
  let down = null,
    moved = false;
  root.addEventListener('pointerdown', (e) => {
    down = e.clientX;
    moved = false;
  });
  root.addEventListener('pointermove', (e) => {
    if (down === null) return;
    const dx = e.clientX - down;
    if (Math.abs(dx) > 60) {
      moved = true;
      step(dx < 0 ? 1 : -1);
      down = e.clientX;
    }
  });
  const up = () => {
    down = null;
    setTimeout(() => {
      moved = false;
    }, 30);
  };
  root.addEventListener('pointerup', up);
  root.addEventListener('pointerleave', up);
  root.addEventListener('pointercancel', up);
  root.addEventListener(
    'wheel',
    (e) => {
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY) && Math.abs(e.deltaX) > 15) step(e.deltaX > 0 ? 1 : -1);
    },
    { passive: true },
  );
}
