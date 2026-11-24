/* Skeleton placeholders shown inside a page while its data loads. The whole-page one lives in index.html. */
const shape = (className) => Object.assign(document.createElement('span'), { className });

/** kind: 'cards' (a row of tiles), 'list' (avatar and two lines per row), 'chart' (one tall block), 'text' (a paragraph). */
export function skeleton(kind = 'cards', count = 3) {
  const root = document.createElement('div');
  root.className = 'skel-section';
  root.setAttribute('aria-hidden', 'true');
  root.dataset.skeleton = kind;
  if (kind === 'cards') {
    const grid = document.createElement('div');
    grid.className = 'skel-grid';
    for (let i = 0; i < count; i += 1) grid.append(shape('skel-block'));
    root.append(shape('skel-line skel-line--title'), grid, shape('skel-block'));
  } else if (kind === 'list') {
    for (let i = 0; i < count; i += 1) {
      const row = document.createElement('div');
      row.className = 'skel-row';
      const stack = document.createElement('div');
      stack.className = 'skel-stack';
      stack.append(shape('skel-line'), shape('skel-line skel-line--short'));
      row.append(shape('skel-circle'), stack);
      root.append(row);
    }
  } else if (kind === 'chart') {
    root.append(shape('skel-line skel-line--title'), Object.assign(shape('skel-block'), { style: 'min-height:260px' }));
  } else {
    for (let i = 0; i < count; i += 1) root.append(shape(i === count - 1 ? 'skel-line skel-line--mid' : 'skel-line'));
  }
  return root;
}

/** Show a skeleton after `anchor` and return a function that removes it. Safe to call twice. */
export function showSkeleton(anchor, kind, count) {
  const node = skeleton(kind, count);
  anchor.after(node);
  return () => node.remove();
}
