/* Two-step sign-in with an authenticator app, checked by our own server.
   - installTwoStep(): wraps fetch so every /api call carries the "second step done" session, and when the server
     says a code is needed, a dialog asks for it and the request is retried.
   - enrolTotp / removeTotp / twoStepStatus: used by Settings > Two-step sign-in. */
import { auth } from './firebase-session.js';

const KEY = 'ledgerline-mfa-session';
let pending = null;

const readSession = () => { try { return sessionStorage.getItem(KEY); } catch { return null; } };
const saveSession = (token) => { try { token ? sessionStorage.setItem(KEY, token) : sessionStorage.removeItem(KEY); } catch { /* storage unavailable */ } };
export const clearTwoStepSession = () => saveSession(null);
const sameOriginApi = (input) => { const url = new URL(typeof input === 'string' ? input : input.url, location.href); return url.origin === location.origin && url.pathname.startsWith('/api/'); };

async function post(path, body) {
  const token = await auth.currentUser?.getIdToken();
  const response = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token, 'X-MFA-Session': readSession() ?? '' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error ?? 'Something went wrong. Try again.'), { status: response.status });
  return data;
}

/** A small modal. `build(box)` adds content above the code field. `onSubmit(code)` resolves with the result or throws. */
function ask({ title, intro, build, submitLabel, label = '6-digit code', recovery = false, onSubmit }) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'n-out dash-dialog mfa-dialog';
    dialog.setAttribute('aria-label', title);
    dialog.innerHTML = '<h2></h2><p class="mfa-intro"></p><form class="ws-form" novalidate><div data-extra></div>'
      + '<label class="field mfa-field"><span data-label></span><input name="code" autocomplete="one-time-code" ' + (recovery ? 'placeholder="000000"' : 'inputmode="numeric" placeholder="000000"') + ' maxlength="11" required data-required-message="Enter your code"></label>'
      + (recovery ? '<p class="mfa-hint">Lost your phone? Enter one of your recovery codes instead, like <code>ab12c-d34ef</code>.</p>' : '')
      + '<p role="status" class="mfa-status"></p><div class="form-actions"><button type="button" class="btn btn-secondary" data-cancel>Cancel</button><button type="submit" class="btn btn-primary"></button></div></form>';
    dialog.querySelector('h2').textContent = title;
    dialog.querySelector('.mfa-intro').textContent = intro;
    dialog.querySelector('[data-label]').textContent = label;
    const form = dialog.querySelector('form');
    const status = dialog.querySelector('.mfa-status');
    const submit = form.querySelector('[type=submit]');
    submit.textContent = submitLabel;
    build?.(dialog.querySelector('[data-extra]'));
    let result = null;
    dialog.querySelector('[data-cancel]').onclick = () => dialog.close();
    dialog.addEventListener('cancel', () => dialog.close());
    dialog.addEventListener('close', () => { dialog.remove(); resolve(result); });
    form.onsubmit = async (event) => {
      event.preventDefault();
      if (!form.checkValidity()) { form.reportValidity(); return; }
      submit.setAttribute('aria-disabled', 'true'); submit.classList.add('is-loading'); status.textContent = '';
      try {
        result = await onSubmit(form.elements.code.value.trim());
        dialog.close();
      } catch (error) {
        status.textContent = error.message;
        submit.removeAttribute('aria-disabled'); submit.classList.remove('is-loading');
        form.elements.code.select();
      }
    };
    document.body.append(dialog);
    dialog.showModal();
    form.elements.code.focus();
  });
}

/** Ask for the sign-in code once, even if several requests need it at the same moment. */
function askForCode() {
  pending ??= ask({
    title: 'Enter your code',
    intro: 'Open your authenticator app and enter the 6-digit code for Ledgerline.',
    submitLabel: 'Verify and continue',
    recovery: true,
    onSubmit: async (code) => { const { session } = await post('/api/mfa/verify', { code }); saveSession(session); return true; },
  }).finally(() => { pending = null; });
  return pending;
}

export function installTwoStep() {
  if (installTwoStep.done) return;
  installTwoStep.done = true;
  const base = window.fetch;
  window.fetch = async (input, init = {}) => {
    if (!sameOriginApi(input)) return base(input, init);
    const withSession = () => {
      const session = readSession();
      if (!session) return init;
      const headers = new Headers(init.headers ?? (typeof input === 'string' ? undefined : input.headers));
      headers.set('X-MFA-Session', session);
      return { ...init, headers };
    };
    const response = await base(input, withSession());
    if (response.status !== 401) return response;
    const body = await response.clone().json().catch(() => ({}));
    if (!body.mfaRequired || String(typeof input === 'string' ? input : input.url).includes('/api/mfa/')) return response;
    // Wait for the code. Signing in again must ask again, so a cancelled dialog gives the original 401 back.
    if (!(await askForCode())) return response;
    return base(input, withSession());
  };
}

export async function twoStepStatus() {
  const token = await auth.currentUser.getIdToken();
  const response = await fetch('/api/mfa/status', { headers: { Authorization: 'Bearer ' + token, 'X-MFA-Session': readSession() ?? '' }, signal: AbortSignal.timeout(10000) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(data.error ?? 'Unavailable'), { status: response.status });
  return data;
}

function showRecoveryCodes(codes) {
  return new Promise((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'n-out dash-dialog mfa-dialog';
    dialog.setAttribute('aria-label', 'Recovery codes');
    dialog.innerHTML = '<h2>Save your recovery codes</h2><p>If you lose your phone, each of these codes signs you in once. They are shown only now. Keep them somewhere safe, like a password manager.</p><ul class="mfa-codes"></ul><div class="form-actions"><button type="button" class="btn btn-secondary" data-copy>Copy codes</button><button type="button" class="btn btn-primary" data-done>I saved them</button></div>';
    const list = dialog.querySelector('ul');
    for (const code of codes) list.append(Object.assign(document.createElement('li'), { textContent: code }));
    dialog.querySelector('[data-copy]').onclick = (event) => { navigator.clipboard?.writeText(codes.join('\n')).then(() => { event.currentTarget.textContent = 'Copied'; }); };
    dialog.querySelector('[data-done]').onclick = () => dialog.close();
    dialog.addEventListener('cancel', (event) => event.preventDefault()); // Escape must not hide codes nobody saved
    dialog.addEventListener('close', () => { dialog.remove(); resolve(); });
    document.body.append(dialog);
    dialog.showModal();
  });
}

/** Set up an authenticator app: show the QR code and key, confirm with one code, then show recovery codes. Returns true when turned on. */
export async function enrolTotp() {
  const { secret, url } = await post('/api/mfa/setup', {});
  const on = await ask({
    title: 'Set up two-step sign-in',
    intro: 'Scan the picture with an authenticator app such as Google Authenticator, Authy or 1Password. Then enter the 6-digit code it shows.',
    submitLabel: 'Turn on',
    build(box) {
      const img = document.createElement('img');
      img.alt = 'QR code for your authenticator app'; img.width = 180; img.height = 180; img.className = 'mfa-qr';
      import('qrcode').then(({ default: QR }) => QR.toDataURL(url, { margin: 1, width: 360 })).then((src) => { img.src = src; }).catch(() => img.remove());
      const manual = document.createElement('p');
      manual.className = 'mfa-key';
      manual.append('Cannot scan? Enter this key in the app: ', Object.assign(document.createElement('code'), { textContent: secret }));
      box.append(img, manual);
    },
    onSubmit: async (code) => {
      const result = await post('/api/mfa/enable', { code });
      saveSession(result.session);
      return result;
    },
  });
  if (!on) return false;
  await showRecoveryCodes(on.recoveryCodes);
  return true;
}

export async function removeTotp() {
  return (await ask({
    title: 'Turn off two-step sign-in',
    intro: 'Enter a code from your app, or a recovery code, to confirm.',
    submitLabel: 'Turn off',
    recovery: true,
    onSubmit: async (code) => { await post('/api/mfa/disable', { code }); saveSession(null); return true; },
  })) === true;
}
