import { sendEmailVerification, signOut } from 'firebase/auth';
import { mountPage } from './shared.js';

export function renderEmailVerification(previous, auth, user, { authPath, sendAutomatically, onVerified }) {
  document.title = 'Verify your email — Ledgerline';
  const page = mountPage(previous, `
    <main class="n-root auth-page pending-page verification-page">
      <div class="n-out">
        <a href="/">Ledgerline</a>
        <h1 tabindex="-1">Verify your email</h1>
        <p>We’ll send a verification link to <strong data-verification-email></strong>. Open it, then return here to continue.</p>
        <div class="verification-actions">
          <button type="button" class="btn btn-primary" data-check-verification>I’ve verified my email</button>
          <button type="button" class="btn btn-secondary" data-send-verification>Send verification email</button>
          <button type="button" class="btn btn-ghost" data-switch-account>Use another account</button>
        </div>
        <p class="verification-status" role="status"></p>
      </div>
    </main>
  `);
  page.querySelector('h1').focus({ preventScroll: true });
  page.querySelector('[data-verification-email]').textContent = user.email ?? 'your account email';
  const send = page.querySelector('[data-send-verification]');
  const check = page.querySelector('[data-check-verification]');
  const switchAccount = page.querySelector('[data-switch-account]');
  const status = page.querySelector('[role="status"]');
  let sending = false;
  let cooldown = false;
  let checking = false;
  let complete = false;

  async function sendLink() {
    if (sending || cooldown || complete || auth.currentUser?.uid !== user.uid) return;
    sending = send.disabled = true;
    status.textContent = 'Sending your verification email…';
    try {
      try {
        await sendEmailVerification(user, { url: new URL(authPath, location.origin).href });
      } catch (error) {
        if (error.code !== 'auth/unauthorized-continue-uri') throw error;
        // The Firebase-hosted verification page can still verify the address.
        await sendEmailVerification(user);
      }
      if (!checking) status.textContent = 'Verification email sent. Check your inbox and spam folder.';
      send.textContent = 'Resend verification email';
      cooldown = true;
      setTimeout(() => {
        cooldown = false;
        send.disabled = sending || complete;
      }, 60_000);
    } catch (error) {
      if (!checking) status.textContent = error.code === 'auth/too-many-requests'
        ? 'Too many emails requested. Wait a few minutes and try again.'
        : 'We couldn’t send the email. Try again in a moment.';
    } finally {
      sending = false;
      send.disabled = cooldown || complete;
    }
  }

  async function checkVerification(showStatus) {
    if (checking || complete || auth.currentUser?.uid !== user.uid) return;
    checking = check.disabled = true;
    if (showStatus) status.textContent = 'Checking your verification…';
    try {
      await user.reload();
      if (auth.currentUser?.uid !== user.uid) return;
      if (user.emailVerified !== true) {
        if (showStatus) status.textContent = 'Your email is still unverified. Open the link in your inbox and try again.';
        return;
      }
      await user.getIdToken(true);
      if (auth.currentUser?.uid !== user.uid) return;
      complete = send.disabled = switchAccount.disabled = true;
      status.textContent = 'Email verified. Opening Ledgerline…';
      onVerified(page);
    } catch {
      if (showStatus) status.textContent = 'We couldn’t check your email status. Try again in a moment.';
    } finally {
      checking = false;
      check.disabled = complete;
    }
  }

  send.addEventListener('click', sendLink);
  check.addEventListener('click', () => void checkVerification(true));
  switchAccount.addEventListener('click', async () => {
    switchAccount.disabled = true;
    try {
      await signOut(auth);
      location.replace(authPath);
    } catch {
      status.textContent = 'We couldn’t sign you out. Try again in a moment.';
      switchAccount.disabled = false;
    }
  });
  if (sendAutomatically) void sendLink();
  else void checkVerification(false);
}
