import { linkWithPhoneNumber, RecaptchaVerifier } from 'firebase/auth';
import { mountVerificationCode } from '../components/verification-code.js';
import pageMarkup from './onboarding.html?raw';
import { bindPageTheme, mountPage } from './shared.js';
import { animatePageExit } from './navigation.js';
import '@fontsource/instrument-serif/latin-400.css';
import './onboarding.css';

const limits = [
  ['risk', 'Risk per trade', [0.25, 0.5, 1, 1.5, 2], '%'],
  ['loss', 'Daily loss limit', [1, 2, 3, 4], 'R'],
  ['trades', 'Max trades per day', [2, 3, 5, 8, 10], ''],
];

export function renderOnboarding(landing, { initial, user, auth, email, save, signOut, destination = '/dashboard' }) {
  document.title = 'Set up Ledgerline';
  const page = mountPage(landing, pageMarkup);
  bindPageTheme(page);
  const form = page.querySelector('form');
  const panels = [...form.querySelectorAll('[data-onboarding-panel]')];
  const progress = page.querySelector('.onboarding-progress');
  const back = form.querySelector('[data-onboarding-back]');
  const next = form.querySelector('[data-onboarding-next]');
  const status = form.querySelector('[data-onboarding-status]');
  const signOutButton = page.querySelector('[data-onboarding-sign-out]');
  const markets = [...form.querySelectorAll('[data-market]')];
  const selected = new Set(initial.markets ?? []);
  const values = { risk: initial.risk ?? 1, loss: initial.loss ?? 2, trades: initial.trades ?? 3 };
  const hardRules = new Set(initial.hardRules ?? []);
  let step = initial.requirePhoneOtp && !user.phoneNumber ? 1 : initial.step;
  let saving = false;
  form.elements.displayName.value = initial.displayName ?? '';
  form.elements.email.value = email ?? '';

  const phone = form.elements.phone;
  const send = form.querySelector('[data-send-code]');
  const codeHost = form.querySelector('[data-code]');
  const phoneStatus = form.querySelector('[data-phone-status]');
  let busy = false;
  let resendAfter = 0;

  function refreshPhone() {
    if (!user.phoneNumber) return;
    phone.value = user.phoneNumber;
    phone.readOnly = true;
    send.hidden = true;
    form.querySelector('[data-phone-notice]').hidden = true;
    phoneStatus.textContent = 'Phone number verified.';
  }
  phone.value = initial.contactPhone || '';
  send.hidden = !initial.requirePhoneOtp;
  if (initial.requirePhoneOtp) {
    form.querySelector('[data-phone-notice]').textContent = 'Google processes the number for abuse prevention. SMS rates may apply.';
  }
  refreshPhone();
  phone.addEventListener('input', () => {
    codeHost.replaceChildren();
    phoneStatus.textContent = '';
    send.textContent = 'Send verification code';
  });
  send.addEventListener('click', async () => {
    if (!initial.requirePhoneOtp || busy || user.phoneNumber) return;
    const number = phone.value.replace(/[\s()-]/g, '');
    if (!/^\+[1-9]\d{6,14}$/.test(number)) {
      phoneStatus.textContent = 'Enter the full phone number, starting with + and your country code.';
      phone.focus();
      return;
    }
    if (Date.now() < resendAfter) {
      phoneStatus.textContent = 'Wait a minute before requesting another code.';
      return;
    }
    let captcha;
    busy = phone.readOnly = send.disabled = true;
    phoneStatus.textContent = 'Sending code…';
    try {
      captcha = new RecaptchaVerifier(auth, form.querySelector('[data-captcha]'), { size: 'invisible' });
      const confirmation = await linkWithPhoneNumber(user, number, captcha);
      resendAfter = Date.now() + 60000;
      phoneStatus.textContent = '';
      send.textContent = 'Resend code';
      mountVerificationCode(codeHost, {
        destination: number,
        confirm: async code => {
          phone.readOnly = send.disabled = true;
          try {
            await confirmation.confirm(code);
            await user.getIdToken(true);
          } catch (error) {
            if (user.phoneNumber) refreshPhone();
            else phone.readOnly = send.disabled = false;
            throw new Error(error.code === 'auth/credential-already-in-use'
              ? 'This number belongs to another account.'
              : error.code === 'auth/code-expired' || error.code === 'auth/session-expired'
                ? 'This code expired. Request another code.'
                : error.code === 'auth/invalid-verification-code' ? 'Incorrect code. Try again.' : 'Verification could not finish. Check your connection and try again.');
          }
        },
        onVerified: refreshPhone,
      });
    } catch (error) {
      phoneStatus.textContent = error.code === 'auth/too-many-requests'
        ? 'Too many requests. Try again later.'
        : 'The SMS could not be sent. Check the number and try again.';
    } finally {
      captcha?.clear();
      busy = phone.readOnly = send.disabled = false;
    }
  });

  signOutButton.addEventListener('click', async () => {
    signOutButton.disabled = true;
    try {
      await signOut();
      location.replace('/auth');
    } catch {
      status.textContent = 'Could not sign out. Try again.';
      signOutButton.disabled = false;
    }
  });

  markets.forEach((button) => {
    const key = button.dataset.market;
    button.setAttribute('aria-pressed', String(selected.has(key)));
    button.addEventListener('click', () => {
      if (selected.has(key)) selected.delete(key);
      else selected.add(key);
      button.setAttribute('aria-pressed', String(selected.has(key)));
      status.textContent = '';
    });
  });

  for (const [key, label, choices, unit] of limits) {
    const rule = document.createElement('div');
    rule.className = 'onboarding-rule';
    rule.innerHTML = `<div><strong>${label}</strong><output aria-live="polite"></output></div><div class="onboarding-adjust">
      <button class="n-btn n-out" type="button" aria-label="Decrease ${label.toLowerCase()}">−</button>
      <span class="n-in" aria-hidden="true"><i></i></span>
      <button class="n-btn n-out" type="button" aria-label="Increase ${label.toLowerCase()}">+</button>
      </div><label><input type="checkbox" aria-label="Hard rule for ${label.toLowerCase()}" /> Hard rule</label>`;
    const [decrease, increase] = rule.querySelectorAll('button');
    const hard = rule.querySelector('input');
    if (key === 'trades') {
      const tip = document.createElement('p');
      tip.className = 'onboarding-rule-tip';
      tip.id = 'onboarding-trade-limit-tip';
      tip.textContent = 'We suggest starting with a cap of 2–3 trades per day to help avoid overtrading. Only take trades that fit your plan.';
      rule.querySelector('.onboarding-adjust').after(tip);
      for (const button of [decrease, increase]) button.setAttribute('aria-describedby', tip.id);
    }
    hard.checked = hardRules.has(key);
    hard.addEventListener('change', () => hard.checked ? hardRules.add(key) : hardRules.delete(key));
    function update() {
      const index = choices.indexOf(values[key]);
      rule.querySelector('output').value = values[key] + unit;
      rule.querySelector('i').style.width = `${(index + 1) / choices.length * 100}%`;
      decrease.disabled = index === 0;
      increase.disabled = index === choices.length - 1;
    }
    for (const [button, offset] of [[decrease, -1], [increase, 1]]) {
      button.addEventListener('click', () => {
        values[key] = choices[choices.indexOf(values[key]) + offset];
        update();
      });
    }
    update();
    form.querySelector('[data-rules]').append(rule);
  }

  function showStep(focus = false) {
    panels.forEach((panel, index) => {
      panel.hidden = index + 1 !== step;
    });
    form.elements.displayName.disabled = step !== 1;
    [...progress.children].forEach((item, index) => {
      item.classList.toggle('is-complete', index + 1 < step);
      item.firstElementChild.textContent = index + 1 < step ? '✓' : String(index + 1);
      if (index + 1 === step) item.setAttribute('aria-current', 'step');
      else item.removeAttribute('aria-current');
    });
    progress.style.setProperty('--onboarding-progress', `${(step - 1) / 3 * 100}%`);
    back.hidden = step === 1;
    next.textContent = step === 4 ? 'Open dashboard' : 'Continue';
    status.textContent = '';
    if (step === 2) {
      const preview=form.querySelector('[data-rule-preview]');
      preview.replaceChildren(...limits.flatMap(([key,label,,unit])=>{
        const term=document.createElement('dt'),value=document.createElement('dd');
        term.textContent=label; value.textContent=values[key]+unit;
        return [term,value];
      }));
    }
    if (step === 4) {
      const summary = form.querySelector('[data-onboarding-summary]');
      const labels = markets.filter((button) => selected.has(button.dataset.market)).map((button) => button.querySelector('strong').textContent);
      summary.replaceChildren();
      for (const [label, content] of [
        ['Display name', form.elements.displayName.value], ['Markets', labels.join(', ')],
        ...limits.map(([key, title, , unit]) => [title, `${values[key]}${unit}${hardRules.has(key) ? ' · Hard rule' : ''}`]),
      ]) {
        const term = document.createElement('dt');
        const description = document.createElement('dd');
        term.textContent = label;
        description.textContent = content;
        summary.append(term, description);
      }
    }
    if (focus) panels[step - 1].querySelector('h1').focus();
  }

  back.addEventListener('click', () => {
    if (saving || step === 1) return;
    step--;
    showStep(true);
  });
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (saving) return;
    const displayName = form.elements.displayName.value.trim();
    if (step === 1 && !displayName) {
      status.textContent = 'Enter a display name to continue.';
      form.elements.displayName.focus();
      return;
    }
    const contactPhone = phone.value.replace(/[\s()-]/g, '') || null;
    if (step === 1 && contactPhone && !/^\+[1-9]\d{6,14}$/.test(contactPhone)) {
      status.textContent = 'Enter your phone number with its country code.';
      phone.focus();
      return;
    }
    if (initial.requirePhoneOtp && !user.phoneNumber) {
      status.textContent = 'Verify your phone number to continue.';
      (codeHost.querySelector('input') || phone).focus();
      return;
    }
    if (step === 2 && !selected.size) {
      status.textContent = 'Choose at least one market.';
      return;
    }
    const data = step === 1 ? { displayName, contactPhone } : step === 2 ? { markets: [...selected] }
      : step === 3 ? { ...values, hardRules: [...hardRules] } : {};
    const panel = panels[step - 1];
    panel.inert = signOutButton.disabled = true;
    saving = next.disabled = back.disabled = true;
    try {
      status.textContent = 'Saving your answers…';
      const profile = await save({ ...data, step });
      if (profile.completedAt) {
        status.textContent = 'Setup complete. Opening Dashboard…';
        page.inert = true;
        const exit = animatePageExit(page);
        await exit?.finished.catch(() => {});
        location.replace(destination);
        return;
      }
      step++;
      showStep(true);
    } catch (error) {
      status.textContent = error.message || 'Could not save your answers. Try again.';
    } finally {
      saving = next.disabled = back.disabled = false;
      panel.inert = signOutButton.disabled = false;
    }
  });
  showStep();
}
