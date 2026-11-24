/* Two-step sign-in with an authenticator app (Firebase TOTP).
   - completeMfaSignIn(error): ask for the 6-digit code when sign-in needs a second step.
   - enrolTotp / removeTotp / hasTotp: used by Settings, Security.
   The Firebase project must have multi-factor authentication with TOTP switched on (see SECURITY.md). */
import { TotpMultiFactorGenerator, getMultiFactorResolver, multiFactor } from 'firebase/auth';
import { auth } from './firebase-session.js';

export const MFA_REQUIRED = 'auth/multi-factor-auth-required';
const messages = {
  'auth/invalid-verification-code': 'That code is not right. Check the app and try the new code.',
  'auth/code-expired': 'That code has expired. Use the next one from your app.',
  'auth/requires-recent-login': 'Sign out and sign in again, then set this up.',
  'auth/unverified-email': 'Verify your email address first.',
  'auth/operation-not-allowed': 'Two-step sign-in is not switched on for this project yet.',
  'auth/second-factor-already-in-use': 'This is already set up.',
  'auth/too-many-requests': 'Too many tries. Wait a minute and try again.',
};
const explain = (error) => messages[error?.code] ?? 'Something went wrong. Try again.';

/** A small modal. `build(form)` fills the form; `onSubmit(code, setStatus)` resolves when done. Resolves to the result or null if cancelled. */
function ask({ title, intro, build, submitLabel, onSubmit }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'n-out dash-dialog mfa-dialog';
    dialog.setAttribute('aria-label', title);
    dialog.innerHTML = '<h2></h2><p class="mfa-intro"></p><form class="ws-form" novalidate><div data-extra></div>'
      + '<label>6-digit code<input name="code" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required data-required-message="Enter the 6-digit code from your app"></label>'
      + '<p role="status" class="mfa-status"></p><div class="form-actions"><button type="button" class="btn btn-secondary" data-cancel>Cancel</button><button type="submit" class="btn btn-primary"></button></div></form>';
    dialog.querySelector('h2').textContent = title;
    dialog.querySelector('.mfa-intro').textContent = intro;
    const form = dialog.querySelector('form');
    const status = dialog.querySelector('.mfa-status');
    const submit = form.querySelector('[type=submit]');
    submit.textContent = submitLabel;
    build?.(dialog.querySelector('[data-extra]'));
    let result = null;
    dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); });
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      submit.setAttribute('aria-disabled', 'true'); submit.classList.add('is-loading'); status.textContent = '';
      try {
        result = await onSubmit(form.elements.code.value.trim());
        dialog.close();
      } catch (error) {
        status.textContent = explain(error);
        submit.removeAttribute('aria-disabled'); submit.classList.remove('is-loading');
        form.elements.code.select();
      }
    };
    document.body.append(dialog);
    dialog.showModal();
    form.elements.code.focus();
  });
}

/** Called when sign-in throws "multi-factor-auth-required". Returns the finished credential, or throws if cancelled. */
export async function completeMfaSignIn(error) {
  const resolver = getMultiFactorResolver(auth, error);
  const hint = resolver.hints.find((h) => h.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  if (!hint) throw Object.assign(new Error('unsupported second factor'), { code: 'auth/operation-not-allowed' });
  const credential = await ask({
    title: 'Enter your code',
    intro: 'Open your authenticator app and enter the 6-digit code for Ledgerline.',
    submitLabel: 'Verify and sign in',
    onSubmit: (code) => resolver.resolveSignIn(TotpMultiFactorGenerator.assertionForSignIn(hint.uid, code)),
  });
  if (!credential) throw Object.assign(new Error('cancelled'), { code: 'auth/popup-closed-by-user' });
  return credential;
}

export function hasTotp(user = auth.currentUser) {
  return Boolean(user && multiFactor(user).enrolledFactors.some((f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID));
}

/** Set up an authenticator app: show the secret and QR code, then confirm with one code. Returns true when enrolled. */
export async function enrolTotp(user = auth.currentUser) {
  const session = await multiFactor(user).getSession();
  const secret = await TotpMultiFactorGenerator.generateSecret(session);
  const url = secret.generateQrCodeUrl(user.email ?? 'account', 'Ledgerline');
  const done = await ask({
    title: 'Set up two-step sign-in',
    intro: 'Scan the picture with an authenticator app such as Google Authenticator, Authy or 1Password. Then enter the 6-digit code it shows.',
    submitLabel: 'Turn on',
    build(box) {
      const img = document.createElement('img');
      img.alt = 'QR code for your authenticator app'; img.width = 180; img.height = 180; img.className = 'mfa-qr';
      import('qrcode').then(({ default: QR }) => QR.toDataURL(url, { margin: 1, width: 360 })).then((src) => { img.src = src; }).catch(() => { img.remove(); });
      const manual = document.createElement('p');
      manual.className = 'mfa-key';
      manual.append('Cannot scan? Enter this key in the app: ', Object.assign(document.createElement('code'), { textContent: secret.secretKey }));
      box.append(img, manual);
    },
    onSubmit: async (code) => {
      await multiFactor(user).enroll(TotpMultiFactorGenerator.assertionForEnrollment(secret, code), 'Authenticator app');
      return true;
    },
  });
  return done === true;
}

export async function removeTotp(user = auth.currentUser) {
  const factor = multiFactor(user).enrolledFactors.find((f) => f.factorId === TotpMultiFactorGenerator.FACTOR_ID);
  if (factor) await multiFactor(user).unenroll(factor);
}
