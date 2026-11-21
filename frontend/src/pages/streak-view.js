import { gsap } from 'gsap';
import './streak.css';

export const streakRule = 'A day counts when you log or review at least one trade, or note that you sat out.';
export const badgeMarkup = `
  <dialog class="n-out streak-badge-dialog" data-streak-badge aria-labelledby="streak-badge-title">
    <img src="/tally-cheer.svg" alt="" width="130" height="130" />
    <p>Badge unlocked</p>
    <h2 id="streak-badge-title" data-badge-title></h2>
    <button type="button" class="n-btn n-acc streak-btn">Continue</button>
    <p role="status" class="streak-message" data-badge-message></p>
  </dialog>`;

export function element(tag, text = '', className = '') {
  const node = document.createElement(tag);
  node.textContent = text;
  node.className = className;
  return node;
}

export function stateMessage(state) {
  if (!state.best) return 'Log your first trade to start your streak';
  if (state.marketClosedToday) return 'Market closed. Your streak is protected. Today counts as a rest day after midnight.';
  if (state.kindToday === 'rest') return 'Not trading counts too';
  if (state.skippedToday) return 'A rule was skipped. Your streak still counts.';
  if (state.todayCounted) return 'Today counts';
  if (!state.current) return 'Log or review a trade to start a new streak.';
  return 'Your streak is safe until midnight.';
}

export function progressText(state) {
  if (!state.best) return 'Your first day is ahead';
  if (!state.daysToBest) return 'Personal best';
  return state.daysToBest + (state.daysToBest === 1 ? ' day' : ' days') + ' to your best';
}

function reducedMotion() {
  return matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function paintTally(mascot, state, previous) {
  const grew = previous ? state.current > previous.current || state.best > previous.best : state.todayCounted;
  const mood = state.kindToday === 'rest' ? 'sleep' : state.skippedToday ? 'tuck' : grew ? 'cheer' : 'calm';
  mascot.src = '/tally-' + mood + '.svg';
  mascot.alt = 'Tally ' + { sleep: 'resting', tuck: 'tucking in', cheer: 'cheering', calm: 'calm' }[mood];
}

export function bindStreakPanel(panel) {
  const number = panel.querySelector('[data-streak-count]');
  const mascot = panel.querySelector('[data-tally]');
  const week = panel.querySelector('[data-streak-week]');
  const dayNames = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const dateLabel = new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  const columns = dayNames.map((name) => {
    const dot = element('span', '', 'streak-dot');
    const column = element('div', '', 'streak-day');
    const label = element('time', name.slice(0, 3));
    column.append(dot, label);
    week.append(column);
    return { dot, label };
  });
  let previous;
  let tween;
  return (state) => {
    paintTally(mascot, state, previous);
    panel.querySelector('[data-streak-message]').textContent = stateMessage(state);
    panel.querySelector('[data-streak-best]').textContent = 'Best: ' + state.best + (state.best === 1 ? ' day' : ' days');
    panel.querySelector('[data-streak-freeze]').textContent = 'Freeze held: ' + state.freezes;
    panel.querySelector('[data-streak-level]').textContent = 'Level ' + state.level;
    panel.querySelector('[data-streak-xp]').textContent = state.xp + ' XP';
    panel.querySelector('[data-streak-goal]').textContent = progressText(state);
    panel.querySelector('[data-streak-ratio]').textContent = state.current + ' / ' + (state.best || 1);
    const progress = panel.querySelector('progress');
    progress.max = state.best || 1;
    progress.value = state.current;
    const today = new Date(state.today + 'T00:00:00Z');
    const todayIndex = (today.getUTCDay() + 6) % 7;
    columns.forEach(({ dot, label }, index) => {
      const counted = state.week[index];
      const day = new Date(today);
      day.setUTCDate(day.getUTCDate() - todayIndex + index);
      const isToday = index === todayIndex;
      label.dateTime = day.toISOString().slice(0, 10);
      label.textContent = dayNames[index].slice(0, 3) + ' ' + day.getUTCDate();
      dot.title = dayNames[index] + ', ' + dateLabel.format(day) + (isToday ? ' · Today' : '');
      dot.classList.toggle('is-counted', counted);
      dot.classList.toggle('is-today', isToday);
      const reason = state.weekReasons?.[index];
      const labels = {trade:'Trade logged', review:'Trade reviewed', rest:'Rest day logged', marketClosed:'Market closed · automatic rest', freeze:'Freeze used'};
      if (reason) dot.title += ' · ' + labels[reason];
      dot.textContent = reason === 'marketClosed' ? '☾' : reason === 'freeze' ? '❄' : counted ? '✓' : '';
      dot.setAttribute('role', 'img');
      dot.setAttribute('aria-label', dot.title + (counted ? ', counted' : ', uncounted'));
      if (isToday) label.setAttribute('aria-current', 'date');
      else label.removeAttribute('aria-current');
      if (counted && !previous?.week[index] && !reducedMotion()) {
        gsap.fromTo(dot, { scale: .5 }, { scale: 1, duration: .5, ease: 'back.out(2)', overwrite: true });
      }
    });
    tween?.kill();
    if (!reducedMotion() && Number(number.textContent) !== state.current) {
      const value = { current: Number(number.textContent) || 0 };
      tween = gsap.to(value, { current: state.current, duration: .65, ease: 'power2.out',
        onUpdate: () => { number.textContent = Math.round(value.current); } });
    } else number.textContent = state.current;
    previous = state;
  };
}

export function bindBadgeUnlock(page, request) {
  const dialog = page.querySelector('[data-streak-badge]');
  const button = dialog.querySelector('button');
  const message = dialog.querySelector('[data-badge-message]');
  const dismissed = new Set();
  let pending = [];
  let current;
  function show() {
    if (!page.isConnected || page.querySelector('dialog[open]')) return;
    current = pending.find((badge) => !badge.seen && !dismissed.has(badge.key));
    if (!current) return;
    dialog.querySelector('[data-badge-title]').textContent = current.title;
    dialog.classList.toggle('is-gold', current.key === 'process-cup');
    message.textContent = '';
    dialog.showModal();
  }
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await request('/api/streak/badges/seen', 'POST', { key: current.key });
      dismissed.add(current.key);
      dialog.close();
    } catch (error) { message.textContent = error.message; }
    finally { button.disabled = false; }
  });
  dialog.addEventListener('cancel', () => { if (current) dismissed.add(current.key); });
  for (const modal of page.querySelectorAll('dialog')) modal.addEventListener('close', () => queueMicrotask(show));
  return (state) => { pending = state.badges; show(); };
}

export function renderBadges(container, badges) {
  if (!badges.length) {
    container.replaceChildren(element('p', 'Streak badges will appear here as you earn them.'));
    return;
  }
  container.replaceChildren(...badges.map((badge) => {
    const tile = element('article', '', 'n-in streak-badge-tile' + (badge.key === 'process-cup' ? ' is-gold' : ''));
    tile.append(element('span', badge.key === 'process-cup' ? '◆' : '✦'), element('strong', badge.title));
    return tile;
  }));
}
