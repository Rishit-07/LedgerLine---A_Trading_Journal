import {
  createUserWithEmailAndPassword,
  getAdditionalUserInfo,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { auth } from './firebase-session.js';
import { streakInviteCode, streakInvitePath } from './streak-invite.js';
import { mountPage, bindPageTheme } from './pages/shared.js';
import { animatePageEntry } from './pages/navigation.js';
import { bindTicketMotion } from './pages/ticket-motion.js';
import { animateSignInChart } from './pages/sign-in-chart.js';
import { renderEmailVerification } from './pages/email-verification.js';
import signInMarkup from './pages/sign-in.html?raw';
import welcomeMarkup from './pages/welcome.html?raw';
import '@fontsource/instrument-serif/latin-400.css';
import '@fontsource/instrument-serif/latin-400-italic.css';
import './pages/sign-in-design.css';
import './pages/sign-in-layout.css';

const errors = {
  'auth/invalid-email': 'Enter a valid email address.',
  'auth/email-already-in-use': 'This email already has an account. Sign in instead.',
  'auth/invalid-credential': 'Check your email and password and try again.',
  'auth/wrong-password': 'Check your password and try again.',
  'auth/user-not-found': 'Check your email and password and try again.',
  'auth/weak-password': 'Choose a stronger password.',
  'auth/password-does-not-meet-requirements': 'Choose a password that meets the account requirements.',
  'auth/popup-blocked': 'Allow pop-ups for Ledgerline and try again.',
  'auth/popup-closed-by-user': 'Google sign-in was canceled.',
  'auth/account-exists-with-different-credential': 'Sign in using the method you used to create this account.',
  'auth/unauthorized-domain': 'Google sign-in is unavailable at this address.',
  'auth/network-request-failed': 'Check your connection and try again.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
};

const errorFields = {
  'auth/invalid-email': ['email'],
  'auth/email-already-in-use': ['email'],
  'auth/wrong-password': ['password'],
  'auth/weak-password': ['password'],
  'auth/password-does-not-meet-requirements': ['password'],
  'auth/invalid-credential': ['email', 'password'],
  'auth/user-not-found': ['email', 'password'],
};

const signInPath = (next) => '/auth?' + new URLSearchParams({ next });

function verifyEmail(page, user, next, sendAutomatically) {
  renderEmailVerification(page, auth, user, {
    authPath: signInPath(next),
    sendAutomatically,
    onVerified: (verificationPage) => void enterVerified(verificationPage, user, next),
  });
}

function renderSignIn(landing, next, startWithSignup = false) {
  const page = mountPage(landing, signInMarkup);
  bindPageTheme(page);
  const form = page.querySelector('form');
  const password = form.elements.password;
  const passwordToggle = form.querySelector('.au-password-toggle');
  const consent = form.elements.consent;
  const displayName = form.elements.displayName;
  const google = page.querySelector('[data-google]');
  const modes = [...page.querySelectorAll('[data-auth-mode]')];
  const message = page.querySelector('.auth-message');
  const ticket = page.querySelector('.au-ticket');
  const ticketBody = ticket.querySelector('.au-ticket-body');
  const fields = [form.elements.email, password, displayName];
  const actions = [form.querySelector('button[type="submit"]'), google, ...modes];
  const flipTicket = bindTicketMotion(ticket);
  const addCandle = animateSignInChart(page.querySelector('#hero-svg'));
  const meter = form.querySelector('[data-meter]');
  const segments = [...form.querySelectorAll('.au-seg2')];
  let creating = startWithSignup;
  let submitting = false;
  let accepted = false;
  let editVersion = 0;

  message.id = 'auth-error';

  function setPasswordVisibility(visible) {
    const start = password.selectionStart;
    const end = password.selectionEnd;
    password.type = visible ? 'text' : 'password';
    if (document.activeElement === password && start !== null && end !== null) {
      password.setSelectionRange(start, end);
    }
    const label = visible ? 'Hide password' : 'Show password';
    passwordToggle.setAttribute('aria-label', label);
    passwordToggle.title = label;
  }

  passwordToggle.addEventListener('pointerdown', (event) => {
    if (document.activeElement === password) event.preventDefault();
  });
  passwordToggle.addEventListener('click', () => setPasswordVisibility(password.type === 'password'));

  function clearField(field) {
    field.removeAttribute('aria-invalid');
    field.removeAttribute('aria-describedby');
    field.closest('.n-field')?.classList.remove('au-field-error');
  }

  function showError(text, fields = []) {
    const inputs = fields.map((name) => form.elements.namedItem(name));
    message.textContent = text;
    message.hidden = false;
    inputs.forEach((field) => {
      const wrapper = field.closest('.n-field');
      clearField(field);
      void wrapper.offsetWidth;
      wrapper.classList.add('au-field-error');
      field.setAttribute('aria-invalid', 'true');
      field.setAttribute('aria-describedby', message.id);
    });
    inputs[0]?.focus();
  }

  function updateMeter() {
    const value = password.value;
    const strength = value.length
      ? Math.max(
          1,
          Number(value.length >= 8) +
            Number(/[a-z]/.test(value) && /[A-Z]/.test(value)) +
            Number(/\d/.test(value)) +
            Number(/[^a-z\d]/i.test(value)),
        )
      : 0;
    segments.forEach((segment, index) => segment.classList.toggle('on' + index, index < strength));
    meter.textContent = ['STRENGTH', 'WEAK', 'FAIR', 'GOOD', 'STRONG'][strength];
  }

  function updateMode() {
    document.title = (creating ? 'Create an account' : 'Sign in') + ' — Ledgerline';
    page.querySelectorAll('[data-signup-only], [data-signup-copy]').forEach((el) => {
      el.hidden = !creating;
    });
    page.querySelectorAll('[data-signin-copy]').forEach((el) => {
      el.hidden = creating;
    });
    modes.forEach((button, index) => {
      const selected = index === Number(creating);
      button.classList.toggle('on', selected);
      button.classList.toggle('n-out', selected);
      button.setAttribute('aria-pressed', String(selected));
    });
    password.autocomplete = creating ? 'new-password' : 'current-password';
    ticket.classList.toggle('is-signup', creating);
    consent.required = creating;
    displayName.required = creating;
    if (creating) password.minLength = 6;
    else password.removeAttribute('minlength');
    message.hidden = true;
    fields.forEach(clearField);
    updateMeter();
  }

  async function authenticate(action) {
    if (submitting || accepted) return;
    submitting = true;
    const submittedVersion = editVersion;
    message.hidden = true;
    fields.forEach(clearField);
    actions.forEach((control) => {
      control.disabled = true;
    });
    form.setAttribute('aria-busy', 'true');
    try {
      const credential = await action();
      const { user } = credential;
      const isNewUser = getAdditionalUserInfo(credential)?.isNewUser === true;
      accepted = true;
      if (user.emailVerified !== true) {
        verifyEmail(page, user, next, isNewUser);
        return;
      }
      await enterVerified(page, user, next);
    } catch (error) {
      if (submittedVersion === editVersion) {
        showError(errors[error.code] ?? 'Unable to sign in right now. Please try again.', errorFields[error.code]);
      }
    } finally {
      submitting = false;
      form.removeAttribute('aria-busy');
      if (!accepted)
        actions.forEach((control) => {
          control.disabled = false;
        });
    }
  }

  modes.forEach((button, index) => {
    button.addEventListener('click', () => {
      if (creating === Boolean(index)) return;
      creating = Boolean(index);
      password.value = '';
      setPasswordVisibility(false);
      updateMode();
      ticketBody.scrollTop = 0;
      flipTicket(creating);
    });
  });
  form.addEventListener('input', (event) => {
    if (!fields.includes(event.target)) return;
    editVersion += 1;
    addCandle();
    if (event.target === password) updateMeter();
    if (event.target.matches('[aria-invalid]')) {
      fields.forEach(clearField);
      message.hidden = true;
    }
  });
  form.addEventListener(
    'invalid',
    (event) => {
      const field = event.target;
      if (!field.matches('.n-input')) return;
      event.preventDefault();
      const first = [...form.elements].find((element) => element.willValidate && !element.validity.valid);
      if (first !== field) return;
      const text =
        field.name === 'email'
          ? 'Enter a valid email address.'
          : field.name === 'password'
            ? field.validity.tooShort
              ? 'Choose a password with at least 6 characters.'
              : 'Enter your password.'
            : 'Enter your name to create an account.';
      showError(text, [field.name]);
    },
    true,
  );
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = form.elements.email.value.trim();
    const secret = password.value;
    if (!creating) {
      void authenticate(() => signInWithEmailAndPassword(auth, email, secret));
      return;
    }
    const name = displayName.value.trim();
    if (!name) {
      showError('Enter your name to create an account.', ['displayName']);
      return;
    }
    void authenticate(async () => {
      const result = await createUserWithEmailAndPassword(auth, email, secret);
      await updateProfile(result.user, { displayName: name }).catch(() => {
        // Profile naming is optional after account creation.
      });
      return result;
    });
  });
  google.addEventListener('click', () => {
    if (creating && !consent.checked) {
      consent.reportValidity();
      return;
    }
    void authenticate(() => signInWithPopup(auth, new GoogleAuthProvider()));
  });
  updateMode();
}

function showWelcome(page, user, next) {
  const go = () => location.replace(next);
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) {
    go();
    return;
  }
  const stamp = page.querySelector('#auth-stamp');
  if (stamp) stamp.replaceWith(stamp.content.cloneNode(true));
  const content = page.querySelector('.au-root') ?? page.firstElementChild;
  setTimeout(() => {
    const template = document.createElement('template');
    template.innerHTML = welcomeMarkup;
    const overlay = template.content.firstElementChild;
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'welcome-title');
    overlay.querySelector('[data-welcome-name]').textContent =
      user.displayName?.trim().split(/\s+/)[0] || 'trader';
    const skip = overlay.querySelector('.in-skip');
    skip.href = next;
    skip.addEventListener('click', (event) => {
      event.preventDefault();
      go();
    });
    overlay.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') go();
      if (event.key === 'Tab') {
        event.preventDefault();
        skip.focus();
      }
    });
    content.inert = true;
    page.append(overlay);
    skip.focus({ preventScroll: true });
    setTimeout(go, 7100);
  }, 650);
}

async function authenticatedRequest(user, path, method, body) {
  const token = await user.getIdToken();
  const headers = { Authorization: 'Bearer ' + token };
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(path, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000),
  });
  const data = await response.json();
  if (!response.ok) throw Object.assign(new Error(data.error ?? 'Account unavailable'), { status: response.status });
  return data;
}

function requestAccount(user) {
  const load = () => authenticatedRequest(user, '/api/account', 'PUT');
  return load().catch((error) => {
    if (error.status && error.status < 500) throw error;
    return load();
  });
}

async function enterVerified(page, user, next) {
  const account = await requestAccount(user).catch(() => null);
  const invite = next.startsWith('/dashboard?') ? streakInviteCode(next.slice('/dashboard'.length)) : '';
  const destination = account?.onboardingCompleted === false ? streakInvitePath('/onboarding', invite) : next;
  showWelcome(page, { displayName: account?.displayName || user.displayName }, destination);
}

export async function renderAccountPage(path, landing, appPages) {
  if (path === '/journal' && location.hash === '#streak') {
    location.replace('/dashboard#streak');
    return;
  }
  await auth.authStateReady();
  const user = auth.currentUser;
  if (path === '/auth') {
    const parameters = new URLSearchParams(location.search);
    const destination = parameters.get('next');
    const invite = destination?.startsWith('/dashboard?') ? streakInviteCode(destination.slice('/dashboard'.length)) : '';
    const next = Object.hasOwn(appPages, destination) || destination === '/dashboard#streak'
      ? destination : streakInvitePath('/dashboard', invite);
    if (user?.emailVerified === true) location.replace(next);
    else if (user) verifyEmail(landing, user, next, false);
    else renderSignIn(landing, next, Boolean(invite && parameters.get('mode') === 'signup'));
    return;
  }

  const invite = ['/dashboard', '/onboarding'].includes(path) ? streakInviteCode(location.search) : '';
  const dashboardDestination = streakInvitePath('/dashboard', invite);
  if (user?.emailVerified !== true) {
    const next = invite ? dashboardDestination : path === '/dashboard' && location.hash === '#streak' ? '/dashboard#streak' : path;
    location.replace(signInPath(next));
    return;
  }

  const account = await requestAccount(user);
  if (path === '/onboarding') {
    if (account.onboardingCompleted) {
      location.replace(dashboardDestination);
      return;
    }
    const { renderOnboarding } = await import('./pages/onboarding.js');
    const initial = await authenticatedRequest(user, '/api/onboarding', 'GET');
    if (initial.completedAt) location.replace(dashboardDestination);
    else renderOnboarding(landing, {
      initial, email: user.email, destination: dashboardDestination,
      save: (data) => authenticatedRequest(user, '/api/onboarding', 'PUT', data),
      signOut: () => signOut(auth),
    });
    return;
  }
  if (!account.onboardingCompleted) {
    location.replace(streakInvitePath('/onboarding', invite));
    return;
  }

  if (path === '/calendar') {
    location.replace('/dashboard#trading-calendar');
    return;
  }

  const request = (route, method, body) => authenticatedRequest(user, route, method, body);
  if (['/journal', '/profile', '/badges', '/settings'].includes(path)) {
    const { renderStreakPage } = await import('./pages/streak-pages.js');
    await renderStreakPage(landing, { path, request, name: account.displayName || user.displayName, signOut: () => signOut(auth) });
    addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
    return;
  }

  if (path === '/dashboard') {
    const { renderDashboard } = await import('./pages/dashboard.js');
    const load = () => authenticatedRequest(user, '/api/dashboard', 'GET');
    renderDashboard(landing, {
      initial: await load(), load, name: account.displayName || user.displayName, request,
      save: (trade) => authenticatedRequest(user, '/api/trades', 'POST', trade),
      loadCalendar: () => authenticatedRequest(user, '/api/calendar', 'GET'),
      loadCalendarMonth: (month) => authenticatedRequest(user, '/api/calendar/month?month=' + encodeURIComponent(month), 'GET'),
      loadCalendarDay: (day, market) => authenticatedRequest(user, '/api/calendar/day?date=' + encodeURIComponent(day) + (market ? '&view=market' : ''), 'GET'),
      signOut: () => signOut(auth),
    });
    addEventListener('pageshow', (event) => { if (event.persisted) location.reload(); });
    return;
  }

  const title = appPages[path];
  const fragment = document.querySelector('#pending-page').content.cloneNode(true);
  fragment.querySelector('h1').textContent = title;
  document.title = title + ' — Ledgerline';
  const button = fragment.querySelector('[data-sign-out]');
  const message = fragment.querySelector('.auth-message');
  const status = fragment.querySelector('[data-account-status]');
  const since = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(account.createdAt));
  status.textContent = 'Ledgerline member since ' + since + '.';
  status.hidden = false;
  button.hidden = false;
  button.addEventListener('click', async () => {
    button.disabled = true;
    try {
      await signOut(auth);
      location.replace('/');
    } catch {
      message.textContent = 'Unable to sign out. Please try again.';
      message.hidden = false;
      button.disabled = false;
    }
  });
  const accountPage = fragment.firstElementChild;
  landing.replaceWith(fragment);
  animatePageEntry(accountPage);
  addEventListener('pageshow', (event) => {
    if (event.persisted) location.reload();
  });
}
