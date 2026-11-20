export function bindPublicAccount(page) {
  const links = [...page.querySelectorAll('[data-public-account]')].map((link) => {
    const label = link.querySelector('[data-account-label]') ?? link;
    return { link, label, guestText: label.textContent.trim(), guestHref: link.getAttribute('href') };
  });
  if (!links.length) return;
  page.setAttribute('data-account-loading', '');
  void import('../firebase-session.js').then(({ auth }) => {
    auth.onIdTokenChanged((user) => {
      const signedIn = user?.emailVerified === true;
      for (const { link, label, guestText, guestHref } of links) {
        link.href = signedIn ? link.dataset.accountPath ?? '/dashboard' : guestHref;
        label.textContent = signedIn ? link.dataset.publicAccount : guestText;
      }
      for (const item of page.querySelectorAll('[data-guest-only]')) item.hidden = signedIn;
      page.removeAttribute('data-account-loading');
    });
  }).catch(() => { page.removeAttribute('data-account-loading'); });
}
