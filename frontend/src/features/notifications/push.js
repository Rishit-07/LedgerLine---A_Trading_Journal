/* Browser push through Firebase Cloud Messaging. Turning a push switch on asks the browser for permission,
   gets a token for this device and saves it; if anything fails the switch goes back off and a toast says why. */
const KEY = 'ledgerline-device';
function deviceId() {
  try {
    let id = localStorage.getItem(KEY);
    if (!id) { id = crypto.randomUUID(); localStorage.setItem(KEY, id); }
    return id;
  } catch { return 'device-' + Math.random().toString(36).slice(2, 12); }
}

export class PushError extends Error { name = 'PushError'; }

export async function enablePush(request) {
  const vapidKey = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (!vapidKey) throw new PushError('Push is not set up on this site yet.');
  if (!('Notification' in window) || !('serviceWorker' in navigator)) throw new PushError('This browser cannot show push notifications.');
  const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  if (permission !== 'granted') throw new PushError('Push is blocked in your browser. Allow notifications for this site, then try again.');
  const [{ getMessaging, getToken, isSupported }, { app }] = await Promise.all([import('firebase/messaging'), import('../../firebase-session.js')]);
  if (!(await isSupported())) throw new PushError('This browser cannot show push notifications.');
  const registration = await navigator.serviceWorker.register('/firebase-messaging-sw.js');
  const token = await getToken(getMessaging(app), { vapidKey, serviceWorkerRegistration: registration });
  if (!token) throw new PushError('Could not turn on push. Try again.');
  await request('/api/notification-settings/push', 'POST', { deviceId: deviceId(), token });
}

export async function disablePushOnThisDevice(request) {
  try { await request('/api/notification-settings/push', 'DELETE', { deviceId: deviceId() }); } catch { /* the server drops dead tokens itself */ }
}
