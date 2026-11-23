import './streak-chip.css';
export const streakChip = '<a class="btn btn-secondary workspace-streak" href="/dashboard#streak" data-workspace-streak hidden><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M13 2c2 6 6 8 6 13a7 7 0 1 1-14 0c0-3 2-5 4-7 0 3 1 4 2 4 1-3 3-6 2-10Z"/></svg><span></span></a>';

export function paintStreakChip(page,current) {
  const badge=page.querySelector('[data-workspace-streak]');
  if(!badge || !Number.isInteger(current))return;
  badge.querySelector('span').textContent=String(current);
  badge.setAttribute('aria-label',current+' day journal streak');
  badge.hidden=false;
}
