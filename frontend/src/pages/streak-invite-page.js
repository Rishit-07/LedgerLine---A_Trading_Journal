import { bindPublicAccount } from './public-account.js';
import { gsap } from 'gsap';
import { animate } from 'motion/mini';
import { bindPageTheme, mountPage } from './shared.js';
import { fetchStreakInviter, streakInviteCode, streakInvitePath } from '../streak-invite.js';
import '@fontsource/instrument-serif/latin-400.css';
import './streak-invite-page.css';

const markup = `
  <main class="n-root invite-page">
    <header class="invite-header">
      <a class="invite-brand" href="/"><span class="n-out"><img src="/ledgerline-icon.svg" alt="" width="22" height="22" /></span><span><b>Ledger</b>line</span></a>
      <button class="btn btn-secondary invite-theme" type="button" data-page-theme>Dark mode</button>
    </header>
    <div class="n-out invite-card">
      <div class="invite-story">
        <img class="invite-tally" src="/tally-cheer.svg" alt="" width="122" height="122" />
        <section data-invite-greeting>
          <h1>You’ve been invited to streak together.</h1>
          <p>Connect with a friend and keep each other on track. Logging a trade, reviewing one, or taking a rest day can all count.</p>
        </section>
      </div>
      <div class="invite-actions">
        <p data-invite-state role="status">Checking your session…</p>
        <section class="invite-options" data-invite-options hidden aria-label="How to continue">
          <a class="btn btn-primary invite-primary" data-invite-existing><span>Sign in</span><span class="invite-arrow" aria-hidden="true">→</span></a>
          <a class="n-out invite-secondary" data-invite-new><span><strong>Create an account</strong><small>New to Ledgerline</small></span><span class="invite-arrow" aria-hidden="true">→</span></a>
        </section>
        <a class="invite-home" href="/" data-invite-home hidden>Back to Ledgerline</a>
      </div>
    </div>
  </main>`;

export function renderStreakInvite(landing) {
  document.title = 'Streak invitation — Ledgerline';
  const page = mountPage(landing, markup);
  bindPageTheme(page);
  bindPublicAccount(page);
  const note = page.querySelector('[data-invite-state]');
  const options = page.querySelector('[data-invite-options]');
  const existing = page.querySelector('[data-invite-existing]');
  const newcomer = page.querySelector('[data-invite-new]');
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');
  const code = streakInviteCode(location.search);
  if (!code) {
    page.querySelector('h1').textContent = 'This invite link is incomplete.';
    page.querySelector('[data-invite-greeting] p').textContent = 'Ask your friend to send you a fresh link from their Dashboard.';
    note.hidden = true;
    page.querySelector('[data-invite-home]').hidden = false;
    return;
  }
  if (!reduced.matches) {
    gsap.timeline({ defaults: { duration: .45, ease: 'power2.out' } })
      .from(page.querySelector('.invite-tally'), { y: 16, scale: .9, opacity: 0 })
      .from(page.querySelectorAll('[data-invite-greeting] > *'), { y: 12, opacity: 0, stagger: .09 }, '-=.24');
  }
  const destination = streakInvitePath('/dashboard', code);
  void fetchStreakInviter(code).then((name) => {
    if (name) page.querySelector('h1').textContent = name + ' invited you to streak together.';
  }).catch(() => {});
  const login = '/auth?' + new URLSearchParams({ next: destination });
  newcomer.href = '/auth?' + new URLSearchParams({ next: destination, mode: 'signup' });
  let transition;
  let previousState;
  function update(user) {
    const state = user?.emailVerified === true ? 'verified' : user ? 'unverified' : 'guest';
    if (previousState === state) return;
    previousState = state;
    existing.href = state === 'verified' ? destination : login;
    existing.firstElementChild.textContent = {
      verified: 'Open invitation', unverified: 'Verify your email', guest: 'Sign in',
    }[state];
    newcomer.hidden = state !== 'guest';
    note.hidden = false;
    note.textContent = {
      verified: 'You’re signed in. Open the invitation to send your friend a connection request.',
      unverified: 'Verify your email to continue. Your invitation will be waiting.',
      guest: 'Your invitation will be waiting after you sign in or finish setup.',
    }[state];
    options.hidden = false;
    if (!reduced.matches) {
      transition?.stop();
      transition = animate(options, { opacity: [0, 1], transform: ['translateY(9px)', 'translateY(0)'] },
        { duration: .24, ease: 'easeOut' });
    }
  }
  void import('../firebase-session.js').then(({ auth }) => {
    auth.onIdTokenChanged(update);
  }).catch(() => update(null));
}
