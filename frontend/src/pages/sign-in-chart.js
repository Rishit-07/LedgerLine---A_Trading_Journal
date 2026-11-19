export function animateSignInChart(svg) {
  const NS = 'http://www.w3.org/2000/svg',
    W = 520,
    H = 170,
    PT = 14,
    PB = 16,
    SLOTS = 18,
    SW = W / SLOTS;
  const el = (t, a, p) => {
    const e = document.createElementNS(NS, t);
    for (const k in a) e.setAttribute(k, a[k]);
    (p || svg).appendChild(e);
    return e;
  };
  const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let seed = 11;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const cs = [];
  const mk = () => {
    const o = cs.length ? cs[cs.length - 1].c : 0.3;
    const c = o + (rnd() - 0.44 - 0.03 * (o - 2.2)) * 0.8;
    return { o: o, c: c, h: Math.max(o, c) + rnd() * 0.3, l: Math.min(o, c) - rnd() * 0.3, born: 0 };
  };
  for (let i = 0; i < SLOTS; i++) cs.push(mk());
  const defs = el('defs', {});
  const cp = el('clipPath', { id: 'hClip' }, defs);
  el('rect', { x: -6, y: -20, width: W - 26, height: H + 40 }, cp);
  const lay = el('g', { 'clip-path': 'url(#hClip)' });
  const g = el('linearGradient', { id: 'hLg', x1: '0', x2: '1' }, defs);
  el('stop', { offset: '0', 'stop-color': 'var(--acc2, #7f8cf2)' }, g);
  el('stop', { offset: '1', 'stop-color': 'var(--acc, #4f5bd5)' }, g);
  const f = el('linearGradient', { id: 'hFl', x1: '0', y1: '0', x2: '0', y2: '1' }, defs);
  el('stop', { offset: '0', 'stop-color': 'var(--acc, #4f5bd5)', 'stop-opacity': '.22' }, f);
  el('stop', { offset: '1', 'stop-color': 'var(--acc, #4f5bd5)', 'stop-opacity': '0' }, f);
  const grid = [0, 1, 2, 3].map(() => ({
    l: el('line', {
      x1: 0,
      x2: W - 34,
      stroke: 'var(--track, #dcdbd2)',
      'stroke-width': 1,
      'stroke-dasharray': '3 7',
    }),
    t: el('text', {
      x: W,
      'text-anchor': 'end',
      fill: 'var(--mut, #8b8fa3)',
      'font-size': 11,
      'font-family': 'JetBrains Mono, ui-monospace, monospace',
    }),
  }));
  const area = el('path', { fill: 'url(#hFl)', opacity: 0 }, lay);
  const pool = [];
  for (let i = 0; i < SLOTS + 2; i++) {
    const gr = el('g', { style: 'filter:drop-shadow(2px 3px 3px var(--sd, rgba(0,0,0,.18)))' }, lay);
    pool.push({
      w: el('line', { 'stroke-width': 2, 'stroke-linecap': 'round' }, gr),
      b: el('rect', { width: 14, rx: 4 }, gr),
      g: gr,
    });
  }
  const line = el(
    'path',
    {
      fill: 'none',
      stroke: 'url(#hLg)',
      'stroke-width': 3.6,
      'stroke-linecap': 'round',
      'stroke-linejoin': 'round',
      pathLength: 1,
      style: 'filter:drop-shadow(0 4px 6px rgba(79,91,213,.35))',
    },
    lay,
  );
  const cross = el('line', {
    y1: PT - 8,
    y2: H - PB + 6,
    stroke: 'var(--acc, #4f5bd5)',
    'stroke-width': 1.5,
    'stroke-dasharray': '4 4',
    opacity: 0,
  });
  const dot = el('g', {});
  const ring = el('circle', { r: 7, fill: 'var(--acc, #4f5bd5)', opacity: 0.35 }, dot);
  el('circle', { r: 6, fill: 'var(--bg, #f1efe8)', stroke: 'var(--acc, #4f5bd5)', 'stroke-width': 3 }, dot);
  const hdot = el('circle', {
    r: 5,
    fill: 'var(--acc, #4f5bd5)',
    opacity: 0,
    stroke: 'var(--bg, #f1efe8)',
    'stroke-width': 2,
  });
  const read = document.getElementById('hero-read'),
    DEF = 'Sample chart · animated';
  const ease = (x) => 1 - Math.pow(1 - Math.min(1, Math.max(0, x)), 3);
  let head = SLOTS - 1,
    scroll = head,
    ymin = -0.5,
    ymax = 3,
    hov = -1,
    last = 0,
    nextAt = 5200,
    t0 = 0,
    sy = [];
  svg.onpointermove = (e) => {
    const r = svg.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * W;
    hov = Math.round((x - SW / 2) / SW + (scroll - SLOTS + 1));
    hov = Math.max(Math.round(scroll - SLOTS + 1), Math.min(head, hov));
  };
  svg.onpointerleave = () => {
    hov = -1;
  };
  const addCandle = () => {
    if (!t0) return;
    const c = mk();
    c.born = performance.now() - t0;
    cs.push(c);
    head++;
  };
  const frame = (now) => {
    if (!svg.isConnected) return;
    if (!t0) {
      t0 = now;
      last = now;
    }
    const t = now - t0,
      dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    if (!reduce && t > nextAt && hov < 0) {
      const c = mk();
      c.born = t;
      cs.push(c);
      head++;
      nextAt = t + 1100;
    }
    scroll += (head - scroll) * (1 - Math.exp(-dt * 7));
    const first = Math.floor(scroll - SLOTS + 1) - 1;
    let mn = 1e9,
      mx = -1e9;
    const disp = [];
    for (let i = first; i <= head; i++) {
      const c = cs[i];
      if (!c) {
        disp.push(null);
        continue;
      }
      const rv = reduce ? 1 : ease(c.born ? (t - c.born) / 800 : (t - 350 - (i - 0) * 55) / 520);
      const d = {
        o: c.o,
        c: c.o + (c.c - c.o) * rv,
        h: c.o + (c.h - c.o) * rv,
        l: c.o + (c.l - c.o) * rv,
        rv: rv,
      };
      d.h = Math.max(d.h, d.o, d.c);
      d.l = Math.min(d.l, d.o, d.c);
      disp.push(d);
      if (rv > 0) {
        mn = Math.min(mn, d.l);
        mx = Math.max(mx, d.h);
      }
    }
    if (mn > mx) {
      mn = -0.5;
      mx = 3;
    }
    ymin += (mn - 0.35 - ymin) * (1 - Math.exp(-dt * 4));
    ymax += (mx + 0.35 - ymax) * (1 - Math.exp(-dt * 4));
    const Y = (v) => PT + ((ymax - v) / (ymax - ymin)) * (H - PT - PB),
      X = (i) => (i - (scroll - SLOTS + 1)) * SW + SW / 2 - 14;
    grid.forEach((q, k) => {
      const v = ymin + (ymax - ymin) * ((k / 3) * 0.8 + 0.1),
        y = Y(v);
      q.l.setAttribute('y1', y);
      q.l.setAttribute('y2', y);
      q.t.setAttribute('y', y - 6);
      q.t.textContent = (v >= 0 ? '+' : '') + v.toFixed(1) + 'R';
      q.l.setAttribute('opacity', Math.min(1, t / 900));
      q.t.setAttribute('opacity', Math.min(1, t / 900));
    });
    const pts = [];
    sy = [];
    pool.forEach((p, k) => {
      const i = first + k,
        d = disp[k],
        c = cs[i];
      if (!d || d.rv <= 0 || !c) {
        p.g.setAttribute('opacity', 0);
        return;
      }
      const x = X(i),
        up = d.c >= d.o,
        col = up ? 'var(--up, #35c28a)' : 'var(--down, #f0555a)',
        edge = Math.min(1, Math.max(0, x / 60), (W - 34 - x + 10) / 20 > 1 ? 1 : 1);
      p.g.setAttribute('opacity', Math.max(0, Math.min(1, x / 50)) * (hov >= 0 && hov !== i ? 0.55 : 1));
      p.w.setAttribute('x1', x);
      p.w.setAttribute('x2', x);
      p.w.setAttribute('y1', Y(d.h));
      p.w.setAttribute('y2', Y(d.l));
      p.w.setAttribute('stroke', col);
      p.b.setAttribute('x', x - 7);
      p.b.setAttribute('y', Math.min(Y(d.o), Y(d.c)));
      p.b.setAttribute('height', Math.max(4, Math.abs(Y(d.o) - Y(d.c))));
      p.b.setAttribute('fill', col);
    });
    let ema = null;
    for (let k = 0; k < disp.length; k++) {
      const d = disp[k];
      if (!d || d.rv <= 0) continue;
      ema = ema === null ? d.c : ema + (d.c - ema) * 0.4;
      const x = X(first + k),
        y = Y(ema);
      pts.push([x, y]);
      sy[first + k] = [x, y];
    }
    let path = '';
    if (pts.length > 1) {
      path = 'M' + pts[0][0].toFixed(1) + ' ' + pts[0][1].toFixed(1);
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[i - 1] || pts[i],
          p1 = pts[i],
          p2 = pts[i + 1],
          p3 = pts[i + 2] || p2;
        path +=
          'C' +
          (p1[0] + (p2[0] - p0[0]) / 6).toFixed(1) +
          ' ' +
          (p1[1] + (p2[1] - p0[1]) / 6).toFixed(1) +
          ' ' +
          (p2[0] - (p3[0] - p1[0]) / 6).toFixed(1) +
          ' ' +
          (p2[1] - (p3[1] - p1[1]) / 6).toFixed(1) +
          ' ' +
          p2[0].toFixed(1) +
          ' ' +
          p2[1].toFixed(1);
      }
    }
    line.setAttribute('d', path);
    const lp = reduce ? 1 : ease((t - 2300) / 2000);
    if (lp < 1) {
      line.setAttribute('stroke-dasharray', 1);
      line.setAttribute('stroke-dashoffset', 1 - lp);
    } else {
      line.removeAttribute('stroke-dasharray');
      line.removeAttribute('stroke-dashoffset');
    }
    area.setAttribute(
      'd',
      path
        ? path +
            'L' +
            pts[pts.length - 1][0].toFixed(1) +
            ' ' +
            (H - PB) +
            'L' +
            pts[0][0].toFixed(1) +
            ' ' +
            (H - PB) +
            'Z'
        : '',
    );
    area.setAttribute('opacity', lp * 0.9);
    if (pts.length && path) {
      let px, py;
      if (lp < 1) {
        const len = line.getTotalLength(),
          q = line.getPointAtLength(len * Math.max(0.001, lp));
        px = q.x;
        py = q.y;
      } else {
        px = pts[pts.length - 1][0];
        py = pts[pts.length - 1][1];
      }
      dot.setAttribute('transform', 'translate(' + px + ' ' + py + ')');
      dot.setAttribute('opacity', t > 2300 ? 1 : 0);
      ring.setAttribute('r', 7 + ((now / 90) % 14));
      ring.setAttribute('opacity', 0.4 * (1 - ((now / 90) % 14) / 14));
    }
    if (hov >= 0 && sy[hov] && cs[hov]) {
      const p = sy[hov],
        c = cs[hov];
      cross.setAttribute('x1', p[0]);
      cross.setAttribute('x2', p[0]);
      cross.setAttribute('opacity', 1);
      hdot.setAttribute('cx', p[0]);
      hdot.setAttribute('cy', p[1]);
      hdot.setAttribute('opacity', 1);
      if (read)
        read.textContent =
          'Day ' +
          (hov + 1) +
          '   close ' +
          (c.c >= 0 ? '+' : '') +
          c.c.toFixed(2) +
          'R   range ' +
          (c.h - c.l).toFixed(2) +
          'R';
    } else {
      cross.setAttribute('opacity', 0);
      hdot.setAttribute('opacity', 0);
      if (read && read.textContent !== DEF) read.textContent = DEF;
    }
    requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
  return addCandle;
}
