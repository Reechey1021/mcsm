// firebase-messaging-sw.js
// Shows MCSM notifications on the phone/computer when the site isn't open.
// Registered by js/services/push.js with the Firebase config in the query string.
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.12.2/firebase-messaging-compat.js');

const p = new URL(self.location).searchParams;
firebase.initializeApp({ apiKey: p.get('apiKey'), projectId: p.get('projectId'), messagingSenderId: p.get('messagingSenderId'), appId: p.get('appId') });
const messaging = firebase.messaging();

// Messages carry a "notification" part, which the browser shows by itself; this only covers
// data-only messages, and keeps the tap target.
messaging.onBackgroundMessage((payload) => {
  // a dot on the installed app's icon until it's opened (the app then shows the exact count)
  try { if (self.navigator && self.navigator.setAppBadge) self.navigator.setAppBadge().catch(() => {}); } catch (e) { /* not supported */ }
  if (payload.notification) return;
  const d = payload.data || {};
  self.registration.showNotification(d.title || 'MCSM', { body: d.body || '', icon: 'assets/icon-192.png', badge: 'assets/icon-192.png', data: { link: d.link } });
});
self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const link = (e.notification.data && (e.notification.data.link || (e.notification.data.FCM_MSG && e.notification.data.FCM_MSG.fcmOptions && e.notification.data.FCM_MSG.fcmOptions.link))) || self.registration.scope;
  e.waitUntil(clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
    for (const c of list) if (c.url.startsWith(self.registration.scope)) { c.navigate(link); return c.focus(); }
    return clients.openWindow(link);
  }));
});
