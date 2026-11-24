/* Shows push notifications sent through Firebase Cloud Messaging and opens the right page when one is tapped.
   Plain service worker: it does not load the Firebase SDK, so nothing here is fetched from a third party. */
self.addEventListener('push', (event) => {
  let payload = {};
  try { payload = event.data ? event.data.json() : {}; } catch { /* not JSON */ }
  const note = payload.notification ?? {};
  const link = payload.fcmOptions?.link ?? payload.data?.link ?? '/notifications';
  event.waitUntil(self.registration.showNotification(note.title || 'Ledgerline', {
    body: note.body || '', icon: '/ledgerline-icon.svg', badge: '/ledgerline-icon.svg', data: { link },
  }));
});
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL(event.notification.data?.link ?? '/notifications', self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(self.clients.matchAll({ type: 'window' }).then((clients) => {
    for (const client of clients) if ('focus' in client) { client.navigate(target.href); return client.focus(); }
    return self.clients.openWindow(target.href);
  }));
});
