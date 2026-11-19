export function initSectionRail() {
  const nav = document.querySelector('.si');
  const rail = nav.querySelector('.si-rail'),
    head = nav.querySelector('.si-head'),
    label = nav.querySelector('.si-lab');
  const ticks = Array.from(nav.querySelectorAll('.si-t'));
  const RAIL = 280,
    OFFSET = 16,
    SWELL = 1.6,
    REACH = 26,
    SNAP = 18,
    FLASH = 900;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const ease = (t) => (t < 0.5 ? 8 * t ** 4 : 1 - (-2 * t + 2) ** 4 / 2);
  let list = [],
    end = 1,
    active = -1,
    raf = 0,
    tween = 0,
    flashT = 0,
    painted = false,
    hover = null,
    drag = null;
  const swell = [];
  const find = (t) => {
    if (t.charAt(0) === '#') return document.querySelector(t);
    const all = document.querySelectorAll('div,span,h1,h2,h3,p,a,button');
    for (let i = 0; i < all.length; i++) {
      const e = all[i];
      if (
        e.children.length === 0 &&
        e.textContent.trim() === t &&
        e.getBoundingClientRect().top + window.scrollY > 200
      )
        return e;
    }
    return null;
  };
  const measure = () => {
    const sc = window.scrollY;
    end = Math.max(document.documentElement.scrollHeight - window.innerHeight, 1);
    list = ticks.map((b) => {
      const el = find(b.getAttribute('data-t'));
      if (!el) {
        b.style.display = 'none';
        return null;
      }
      b.style.display = '';
      const at = Math.min(Math.max(el.getBoundingClientRect().top + sc - OFFSET, 0), end);
      return { b, text: b.getAttribute('aria-label'), at, pos: at / end };
    });
    list.forEach((s) => {
      if (s) s.b.style.top = (s.pos * 100).toFixed(3) + '%';
    });
  };
  const fraction = () => Math.min(Math.max(window.scrollY / end, 0), 1);
  const nearest = (y) => {
    let best = -1,
      d = 1e9;
    list.forEach((s, i) => {
      if (!s) return;
      const k = Math.abs(s.pos * RAIL - y);
      if (k < d) {
        d = k;
        best = i;
      }
    });
    return { index: best, distance: d };
  };
  const placeLabel = (i, vis) => {
    const s = list[i];
    if (!s) {
      label.style.opacity = '0';
      return;
    }
    if (label.textContent !== s.text) label.textContent = s.text;
    label.style.transform = 'translate3d(0,' + (s.pos * RAIL).toFixed(1) + 'px,0) translateY(-50%)';
    label.style.opacity = vis ? '1' : '0';
  };
  const current = () => {
    const sc = window.scrollY + 1;
    let k = -1;
    list.forEach((s, i) => {
      if (s && s.at <= sc) k = i;
    });
    return k;
  };
  const mark = () =>
    ticks.forEach((b, i) => {
      const s = list[i];
      if (!s) return;
      b.dataset.state = i === active ? 'current' : i < active ? 'passed' : 'ahead';
      if (i === active) b.setAttribute('aria-current', 'location');
      else b.removeAttribute('aria-current');
    });
  const paint = () => {
    raf = 0;
    head.style.transform = 'translate3d(0,' + (fraction() * RAIL).toFixed(1) + 'px,0)';
    const now = current();
    if (now !== active) {
      active = now;
      mark();
      if (painted && hover === null && !drag && active >= 0) {
        placeLabel(active, true);
        clearTimeout(flashT);
        flashT = setTimeout(() => {
          if (hover === null && !drag) label.style.opacity = '0';
        }, FLASH);
      }
    }
    let moving = false;
    ticks.forEach((b, i) => {
      const s = list[i];
      if (!s) return;
      const y = s.pos * RAIL;
      const target =
        hover === null || reduce ? 1 : 1 + SWELL * Math.exp(-((hover - y) ** 2) / (2 * REACH * REACH));
      const v = swell[i] === undefined ? 1 : swell[i];
      const nv = v + (target - v) * 0.35;
      swell[i] = Math.abs(nv - target) < 0.005 ? target : nv;
      if (swell[i] !== target) moving = true;
      b.style.setProperty('--swell', swell[i].toFixed(3));
    });
    painted = true;
    if (moving) schedule();
  };
  function schedule() {
    if (!raf) raf = requestAnimationFrame(paint);
  }
  const stop = () => {
    cancelAnimationFrame(tween);
    tween = 0;
  };
  const scrollToY = (target) => {
    stop();
    const from = window.scrollY,
      to = Math.min(Math.max(target, 0), end);
    if (reduce || Math.abs(to - from) < 2) {
      window.scrollTo(0, to);
      return;
    }
    const dur = Math.min(Math.max(260 + Math.abs(to - from) * 0.12, 300), 650),
      t0 = performance.now();
    const step = (now) => {
      const t = Math.min((now - t0) / dur, 1);
      window.scrollTo(0, from + (to - from) * ease(t));
      tween = t < 1 ? requestAnimationFrame(step) : 0;
    };
    tween = requestAnimationFrame(step);
  };
  const jump = (i) => {
    const s = list[i];
    if (s) scrollToY(s.at);
  };
  const railY = (e) => Math.min(Math.max(e.clientY - rail.getBoundingClientRect().top, 0), RAIL);
  rail.addEventListener('pointerdown', (e) => {
    if (drag || e.button !== 0) return;
    e.preventDefault();
    rail.setPointerCapture(e.pointerId);
    stop();
    const y = railY(e);
    drag = { id: e.pointerId, moved: false, y, t: e.timeStamp, v: 0 };
    hover = y;
    rail.setAttribute('data-dragging', '');
    placeLabel(nearest(y).index, true);
    schedule();
  });
  rail.addEventListener('pointermove', (e) => {
    const y = railY(e);
    if (drag && e.pointerId === drag.id) {
      const dt = Math.max(e.timeStamp - drag.t, 1);
      drag.v = drag.v * 0.4 + ((y - drag.y) / dt) * 0.6;
      drag.moved = drag.moved || Math.abs(y - drag.y) > 3;
      drag.y = y;
      drag.t = e.timeStamp;
      if (drag.moved) window.scrollTo(0, (y / RAIL) * end);
    } else if (e.pointerType !== 'mouse') return;
    hover = y;
    placeLabel(nearest(y).index, true);
    schedule();
  });
  const up = (e) => {
    if (!drag || e.pointerId !== drag.id) return;
    const { moved, y, v } = drag;
    drag = null;
    rail.removeAttribute('data-dragging');
    if (e.pointerType !== 'mouse') {
      hover = null;
      placeLabel(-1, false);
    }
    const hit = nearest(moved ? y + v * 120 : y);
    if (hit.index >= 0 && (!moved || hit.distance < SNAP)) jump(hit.index);
    schedule();
  };
  rail.addEventListener('pointerup', up);
  rail.addEventListener('pointercancel', up);
  rail.addEventListener('pointerleave', () => {
    if (drag) return;
    hover = null;
    placeLabel(-1, false);
    schedule();
  });
  ticks.forEach((b, i) => {
    b.addEventListener('focus', () => {
      hover = (list[i] ? list[i].pos : 0) * RAIL;
      placeLabel(i, true);
      schedule();
    });
    b.addEventListener('blur', () => {
      label.style.opacity = '0';
    });
    b.addEventListener('click', (e) => {
      if (e.detail === 0) jump(i);
    });
    b.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      e.preventDefault();
      let k = i;
      do {
        k += e.key === 'ArrowDown' ? 1 : -1;
      } while (k >= 0 && k < ticks.length && !list[k]);
      if (k >= 0 && k < ticks.length && ticks[k]) ticks[k].focus();
    });
  });
  window.addEventListener('scroll', schedule, { passive: true });
  window.addEventListener('wheel', stop, { passive: true });
  window.addEventListener('touchstart', stop, { passive: true });
  window.addEventListener('resize', () => {
    measure();
    schedule();
  });
  measure();
  paint();
  [600, 1500, 3000].forEach((ms) =>
    setTimeout(() => {
      measure();
      schedule();
    }, ms),
  );
  if (window.ResizeObserver)
    new ResizeObserver(() => {
      measure();
      schedule();
    }).observe(document.body);
}
