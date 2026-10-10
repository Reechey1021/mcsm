// services/push.js
// Phone/computer notifications through Firebase Cloud Messaging. The admin function keeps the
// tokens and does the sending; this file asks permission, registers the device and passes on
// each new notification. Works in Chrome/Edge/Firefox on desktop and Android; on iPhone only
// once the site is added to the Home Screen (iOS 16.4+).
import { backend } from './backend.js';
import { session } from './session.js';
import { firebaseConfig } from '../config/firebase-config.js';
import { store } from '../core/storage.js';
import { emit } from '../core/bus.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';
const fail = (code) => { const e = new Error(code); e.code = code; throw e; };

export const pushSupported = () => 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
export const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent);
export const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export const pushState = () => (backend.kind === 'fake' ? (store.get('pushToken', null) ? 'on' : 'off') : !pushSupported() ? (isIos() && !isStandalone() ? 'ios-home' : 'unsupported') : Notification.permission === 'denied' ? 'blocked' : store.get('pushToken', null) && Notification.permission === 'granted' ? 'on' : 'off');

async function messaging() {
  const reg = await navigator.serviceWorker.register('firebase-messaging-sw.js?' + new URLSearchParams({ apiKey: firebaseConfig.apiKey, projectId: firebaseConfig.projectId, messagingSenderId: firebaseConfig.messagingSenderId, appId: firebaseConfig.appId }), { scope: './' });
  const M = await import(SDK + 'firebase-messaging.js');
  return { M, reg, m: M.getMessaging(backend.app) };
}

export async function enablePush() {
  if (backend.kind === 'fake') { store.set('pushToken', 'fake-token'); await backend.users.save(session.user.uid, { pushOn: true }); return 'on'; }
  if (!pushSupported()) fail(isIos() && !isStandalone() ? 'push-ios-home' : 'push-unsupported');
  const cfg = await backend.content.get('push').catch(() => null);
  if (!cfg || !cfg.vapidKey) fail('push-nokey');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') fail('push-denied');
  const { M, reg, m } = await messaging();
  const token = await M.getToken(m, { vapidKey: cfg.vapidKey, serviceWorkerRegistration: reg });
  if (!token) fail('push-denied');
  await backend.admin.call('registerPush', { token });
  store.set('pushToken', token);
  await backend.users.save(session.user.uid, { pushOn: true });
  listenForeground();
  return 'on';
}

export async function disablePush() {
  const token = store.get('pushToken', null);
  store.del('pushToken');
  if (backend.kind !== 'fake' && token) {
    try { await backend.admin.call('unregisterPush', { token }); } catch { /* best effort */ }
    try { const { M, m } = await messaging(); await M.deleteToken(m); } catch { /* already gone */ }
  }
  await backend.users.save(session.user.uid, { pushOn: false });
  return 'off';
}

let listening = false;
export async function listenForeground() {
  if (listening || backend.kind === 'fake' || pushState() !== 'on') return;
  listening = true;
  try { const { M, m } = await messaging(); M.onMessage(m, () => emit('pushed')); } catch { listening = false; }
}

// Called after a notification document is written: the function delivers it to devices.
export function deliver(id, n, text) {
  if (backend.kind === 'fake' || !id) return;
  const base = location.origin + location.pathname;
  backend.admin.call('push', { id, title: text.title, body: text.body, base }).catch(() => {});
}
