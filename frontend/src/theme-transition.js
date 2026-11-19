// Motion reference https://github.com/codemure-official/ink-bleed-theme-changer
const svgNamespace = 'http://www.w3.org/2000/svg';
const duration = 1250;
const fullTurn = Math.PI * 2;
let currentTransition;

function svgNode(name, attributes) {
  const element = document.createElementNS(svgNamespace, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, value);
  return element;
}

function clickOrigin(event, width, height) {
  if (event?.detail && Number.isFinite(event.clientX)) return [event.clientX, event.clientY];
  const button = event?.currentTarget?.getBoundingClientRect();
  if (button) return [button.left + button.width / 2, button.top + button.height / 2];
  return [width / 2, height / 2];
}

function roundedShape(points) {
  const middle = (a, b) => `${((a[0] + b[0]) / 2).toFixed(1)} ${((a[1] + b[1]) / 2).toFixed(1)}`;
  const curves = points.map((point, index) =>
    `Q${point[0].toFixed(1)} ${point[1].toFixed(1)} ${middle(point, points[(index + 1) % points.length])}`,
  );
  return `M${middle(points.at(-1), points[0])}${curves.join('')}Z`;
}

function createInkMask(x, y, width, height) {
  const svg = svgNode('svg', { class: 'theme-ink-definitions', width: 0, height: 0, 'aria-hidden': 'true' });
  const mask = svgNode('mask', {
    id: 'ledgerline-ink-mask', maskUnits: 'userSpaceOnUse', maskContentUnits: 'userSpaceOnUse',
    'mask-type': 'alpha', x: 0, y: 0, width, height,
  });
  const blur = svgNode('filter', { id: 'ledgerline-ink-fringe', filterUnits: 'userSpaceOnUse', x: 0, y: 0, width, height });
  blur.append(svgNode('feGaussianBlur', { stdDeviation: 3.2 }));
  svg.append(blur, mask);
  const washes = [0.25, 0.17, 1].map((opacity) => svgNode('path', { fill: 'white', opacity }));
  washes[0].setAttribute('filter', 'url(#ledgerline-ink-fringe)');
  mask.append(...washes);

  const reach = Math.hypot(Math.max(x, width - x), Math.max(y, height - y));
  const phase = Math.random() * fullTurn;
  const directions = Array.from({ length: 112 }, (_, index) => {
    const angle = index / 112 * fullTurn;
    return { angle, dx: Math.cos(angle), dy: Math.sin(angle) };
  });
  const drops = Array.from({ length: 64 }, () => {
    const cx = Math.random() * width;
    const cy = Math.random() * height;
    const dot = svgNode('circle', {
      fill: 'white', cx, cy, r: 0, opacity: 0.45 + Math.random() * 0.55,
    });
    mask.append(dot);
    return { dot, distance: Math.hypot(cx - x, cy - y), size: 0.85 + Math.random() ** 2 * 4.6 };
  });

  function paint(progress) {
    const spread = 1 - (1 - progress) ** 3;
    const settle = Math.max(0, (progress - 0.55) / 0.45);
    const radius = reach * (0.83 * spread + 0.3 * settle ** 2);
    const variation = Math.min(50, radius * 0.25) * (1 - settle);
    const fringe = Math.min(12, radius * 0.21) * (1 - settle);
    const front = directions.map(({ angle }) => {
      const bend = Math.sin(3 * angle + phase) * 0.6;
      const vein = Math.max(0, Math.sin(angle * 15 + bend + phase + progress * 2)) ** 8;
      const swell = Math.sin(angle * 5 + phase - progress * 2.4) * 0.58;
      const ripples = Math.sin(angle * 11 + bend + progress * 3) * 0.22;
      return Math.max(0, radius + variation * (swell + ripples + vein * 1.25));
    });
    washes.forEach((path, layer) => {
      const edge = (2 - layer) * fringe;
      path.setAttribute('d', roundedShape(directions.map(({ dx, dy, angle }, index) => {
        const distance = front[index] + edge * (0.7 + 0.3 * Math.sin(13 * angle + phase));
        return [x + dx * distance, y + dy * distance];
      })));
    });
    for (const { dot, distance, size } of drops) {
      const arrival = Math.min(1, Math.max(0, (radius + variation * 1.9 - distance) / 28));
      dot.setAttribute('r', (size * arrival).toFixed(2));
    }
  }

  paint(0);
  return { svg, paint };
}

export function transitionTheme(event, apply) {
  const root = document.documentElement;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  if (currentTransition) return;
  if (!document.startViewTransition || typeof root.animate !== 'function' || reduceMotion.matches) {
    apply();
    return;
  }

  const width = root.clientWidth;
  const height = root.clientHeight;
  const [x, y] = clickOrigin(event, width, height);
  const { svg, paint } = createInkMask(x, y, width, height);
  document.body.append(svg);
  let frame;
  const transition = document.startViewTransition(() => {
    root.classList.add('theme-ink-active');
    apply();
  });
  currentTransition = transition;

  transition.ready.then(() => {
    const animation = root.animate([{ opacity: 1 }, { opacity: 1 }], {
      duration, pseudoElement: '::view-transition-new(root)',
    });
    function draw() {
      const progress = Math.min(1, Number(animation.currentTime ?? 0) / duration);
      paint(progress);
      if (progress < 1) frame = requestAnimationFrame(draw);
    }
    frame = requestAnimationFrame(draw);
  }).catch(() => transition.skipTransition());
  const cleanup = () => {
    cancelAnimationFrame(frame);
    svg.remove();
    root.classList.remove('theme-ink-active');
    currentTransition = undefined;
  };
  transition.finished.then(cleanup, cleanup);
}
