import './pagination.css';

const pagers = new WeakMap();

// The rows stay mounted so an edited review and a printable report retain their contents.
export function paginate(list, label, size = 5, filter = '', revealIndex) {
  let pager = pagers.get(list);
  if (!pager) {
    const nav = document.createElement('nav');
    nav.className = 'list-pages';
    nav.setAttribute('aria-label', label + ' pages');
    const previous = document.createElement('button');
    const next = document.createElement('button');
    const counter = document.createElement('span');
    counter.setAttribute('role', 'status');
    previous.textContent = 'Previous';
    next.textContent = 'Next';
    previous.type = next.type = 'button';
    previous.className = next.className = 'n-btn n-out dash-button';
    nav.append(previous, counter, next);
    list.after(nav);
    pager = { nav, previous, next, counter, index: 0, filter };
    function advance(offset) {
      const focused = document.activeElement;
      pager.index += offset;
      paint();
      if (focused?.disabled) (offset > 0 ? previous : next).focus();
    }
    previous.addEventListener('click', () => advance(-1));
    next.addEventListener('click', () => advance(1));
    pagers.set(list, pager);
  }
  if (pager.filter !== filter) pager.index = 0;
  if (revealIndex >= 0) pager.index = Math.floor(revealIndex / size);
  pager.filter = filter;
  pager.size = size;
  paint();

  function paint() {
    const items = Array.from(list.children);
    const count = Math.max(1, Math.ceil(items.length / pager.size));
    pager.index = Math.max(0, Math.min(pager.index, count - 1));
    items.forEach((item, index) => item.classList.toggle('off-list-page', Math.floor(index / pager.size) !== pager.index));
    pager.nav.hidden = count === 1;
    pager.previous.disabled = pager.index === 0;
    pager.next.disabled = pager.index === count - 1;
    pager.counter.textContent = 'Page ' + (pager.index + 1) + ' of ' + count;
  }
}
