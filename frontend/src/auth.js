const demoSessionKey = 'ledgerline-demo-session';

export function isSignedIn() {
  return localStorage.getItem(demoSessionKey) === 'active';
}

export function signIn() {
  localStorage.setItem(demoSessionKey, 'active');
}

export function signOut() {
  localStorage.removeItem(demoSessionKey);
}
