import { initializeApp } from 'firebase/app';
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import firebaseConfig from './firebase-config.js';

const auth = getAuth(initializeApp(firebaseConfig));
if (import.meta.env.DEV && import.meta.env.VITE_FIREBASE_USE_EMULATOR === 'true') {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099');
}

const errors = {
  'auth/email-already-in-use': 'This email already has an account. Sign in instead.',
  'auth/invalid-credential': 'Check your email and password and try again.',
  'auth/weak-password': 'Choose a stronger password.',
  'auth/password-does-not-meet-requirements': 'Choose a password that meets the account requirements.',
  'auth/popup-blocked': 'Allow pop-ups for Ledgerline and try again.',
  'auth/popup-closed-by-user': 'Google sign-in was canceled.',
  'auth/account-exists-with-different-credential': 'Sign in using the method you used to create this account.',
  'auth/unauthorized-domain': 'Google sign-in is unavailable at this address.',
  'auth/network-request-failed': 'Check your connection and try again.',
  'auth/too-many-requests': 'Too many attempts. Wait a moment and try again.',
};

function renderSignIn(landing, next) {
  const fragment = document.querySelector('#sign-in-page').content.cloneNode(true);
  const heading = fragment.querySelector('h1');
  const description = fragment.querySelector('#sign-in-message');
  const form = fragment.querySelector('form');
  const password = form.elements.password;
  const submit = form.querySelector('button');
  const google = fragment.querySelector('[data-google]');
  const mode = fragment.querySelector('[data-auth-mode]');
  const message = fragment.querySelector('.auth-message');
  const controls = [...form.elements, google, mode];
  let creating = false;

  function updateMode() {
    heading.textContent = creating ? 'Create an account' : 'Sign in';
    document.title = heading.textContent + ' — Ledgerline';
    description.textContent = next === '/replay'
      ? (creating ? 'Create an account to continue to Replay.' : 'Sign in to continue to Replay.')
      : (creating ? 'Create your Ledgerline account.' : 'Sign in to your Ledgerline account.');
    submit.textContent = creating ? 'Create account' : 'Sign in';
    mode.textContent = creating ? 'Back to sign in' : 'Create an account';
    password.autocomplete = creating ? 'new-password' : 'current-password';
    if (creating) password.minLength = 6;
    else password.removeAttribute('minlength');
    message.hidden = true;
  }

  async function authenticate(action) {
    message.hidden = true;
    controls.forEach((control) => { control.disabled = true; });
    try {
      await action();
      location.replace(next);
    } catch (error) {
      message.textContent = errors[error.code] ?? 'Unable to sign in right now. Please try again.';
      message.hidden = false;
      controls.forEach((control) => { control.disabled = false; });
    }
  }

  mode.addEventListener('click', () => {
    creating = !creating;
    password.value = '';
    updateMode();
  });
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    const email = form.elements.email.value.trim();
    const secret = password.value;
    const method = creating ? createUserWithEmailAndPassword : signInWithEmailAndPassword;
    void authenticate(() => method(auth, email, secret));
  });
  google.addEventListener('click', () => {
    void authenticate(() => signInWithPopup(auth, new GoogleAuthProvider()));
  });
  updateMode();
  landing.replaceWith(fragment);
}

async function loadAccount(user, status) {
  try {
    const token = await user.getIdToken();
    const response = await fetch('/api/account', {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + token },
      signal: AbortSignal.timeout(10000),
    });
    if (!response.ok) throw new Error('Account unavailable');
    const { createdAt } = await response.json();
    const since = new Intl.DateTimeFormat(undefined, { dateStyle: 'long' }).format(new Date(createdAt));
    status.textContent = 'Ledgerline member since ' + since + '.';
  } catch {
    status.textContent = 'Your Ledgerline profile is temporarily unavailable.';
  }
  status.hidden = false;
}

export async function renderAccountPage(path, landing) {
  await auth.authStateReady();
  if (path === '/auth') {
    const next = new URLSearchParams(location.search).get('next') === '/replay' ? '/replay' : '/dashboard';
    if (auth.currentUser) location.replace(next);
    else renderSignIn(landing, next);
    return;
  }

  const user = auth.currentUser;
  if (!user) {
    location.replace('/auth?' + new URLSearchParams({ next: path }));
    return;
  }

  const title = path === '/replay' ? 'Replay' : 'Dashboard';
  const fragment = document.querySelector('#pending-page').content.cloneNode(true);
  fragment.querySelector('h1').textContent = title;
  document.title = title + ' — Ledgerline';
  const button = fragment.querySelector('[data-sign-out]');
  const message = fragment.querySelector('.auth-message');
  const status = fragment.querySelector('[data-account-status]');
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
  landing.replaceWith(fragment);
  void loadAccount(user, status);
}
