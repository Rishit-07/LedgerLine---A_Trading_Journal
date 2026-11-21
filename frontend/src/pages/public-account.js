import { streakChip, paintStreakChip } from './streak-chip.js';
export function bindPublicAccount(page) {
  const links = [...page.querySelectorAll('[data-public-account]')].map((link) => {
    const label = link.querySelector('[data-account-label]') ?? link;
    return { link, label, guestText: label.textContent.trim(), guestHref: link.getAttribute('href') };
  });
  const anchor=links[0]?.link ?? page.querySelector('header [data-page-theme]');
  if(anchor) anchor.insertAdjacentHTML('beforebegin',streakChip);
  else page.querySelector('header')?.insertAdjacentHTML('beforeend',streakChip);
  const badge=page.querySelector('[data-workspace-streak]');
  if(!badge)return;
  let session=0;
  page.setAttribute('data-account-loading', '');
  void import('../firebase-session.js').then(({ auth }) => {
    auth.onIdTokenChanged((user) => {
      const signedIn = user?.emailVerified === true;
      const version=++session;
      badge.hidden=true;
      if(signedIn) void user.getIdToken().then(token=>fetch('/api/streak',{headers:{Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)})).then(async response=>{
        if(response.ok){const state=await response.json();if(version===session)paintStreakChip(page,state.current);}
      }).catch(()=>{});
      for (const { link, label, guestText, guestHref } of links) {
        link.href = signedIn ? link.dataset.accountPath ?? '/dashboard' : guestHref;
        label.textContent = signedIn ? link.dataset.publicAccount : guestText;
      }
      for (const item of page.querySelectorAll('[data-guest-only]')) item.hidden = signedIn;
      page.removeAttribute('data-account-loading');
    });
  }).catch(() => { page.removeAttribute('data-account-loading'); });
}
