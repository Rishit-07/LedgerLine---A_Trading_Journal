export function transitionTheme(e, apply) {
  // Ink-bleed theme change, adapted from codemure-official/ink-bleed-theme-changer (MIT):
  // click-origin spread, noisy tendril edge, power3.out easing, slow end-of-spread cleanup.
  const doc = document,
    root = doc.documentElement;
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!doc.startViewTransition || reduce) {
    apply();
    return;
  }
  const W = root.clientWidth,
    H = root.clientHeight;
  let x = W / 2,
    y = H / 2;
  if (e && typeof e.clientX === 'number' && e.detail !== 0) {
    x = e.clientX;
    y = e.clientY;
  } else if (e && e.currentTarget && e.currentTarget.getBoundingClientRect) {
    const r = e.currentTarget.getBoundingClientRect();
    x = r.left + r.width / 2;
    y = r.top + r.height / 2;
  }
  const far = Math.max(Math.hypot(x, y), Math.hypot(W - x, y), Math.hypot(x, H - y), Math.hypot(W - x, H - y)) + 4;
  const ph = [Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28, Math.random() * 6.28];
  const N = 140,
    F = 44,
    DUR = 1400,
    frames = [];
  for (let k = 0; k <= F; k++) {
    const p = k / F,
      ease = 1 - Math.pow(1 - p, 3),
      t = p * 3;
    const ramp = Math.max(0, (p - 0.45) / 0.55);
    const R = far * (0.7 * ease + 0.45 * ramp * ramp + 0.5 * Math.max(0, (p - 0.9) / 0.1));
    const amp = 0.3 * (1 - 0.7 * Math.max(0, (p - 0.55) / 0.45));
    const pts = [];
    for (let i = 0; i < N; i++) {
      const a = (i / N) * 6.2832;
      const n =
        0.5 * Math.sin(3 * a + ph[0] + 2 * t) +
        0.3 * Math.sin(5 * a + ph[1] - 1.6 * t) +
        0.22 * Math.sin(9 * a + ph[2] + 1.1 * t) +
        0.12 * Math.sin(15 * a + ph[3] - 2 * t);
      const r = Math.max(0, R * (1 + amp * n));
      pts.push((x + r * Math.cos(a)).toFixed(1) + 'px ' + (y + r * Math.sin(a)).toFixed(1) + 'px');
    }
    frames.push('polygon(' + pts.join(',') + ')');
  }
  const vt = doc.startViewTransition(() => {
    apply();
    return new Promise((res) => setTimeout(res, 60));
  });
  vt.ready
    .then(() => {
      root.animate(
        { clipPath: frames },
        { duration: DUR, easing: 'linear', fill: 'forwards', pseudoElement: '::view-transition-new(root)' },
      );
    })
    .catch(() => {});
}
