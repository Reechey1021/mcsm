// services/backend.js
// Picks the backend: real Firebase when a config exists, otherwise (or with ?fakecloud)
// the test backend. Both expose the same interface, so screens never know which is running.
import { firebaseConfig } from '../config/firebase-config.js';

export let backend = null;

export function wantsFake() {
  try {
    const q = new URLSearchParams(location.search);
    if (q.has('fakecloud')) sessionStorage.setItem('mcsm:fakecloud', '1');
    if (q.has('realcloud')) sessionStorage.removeItem('mcsm:fakecloud');
    return !firebaseConfig || sessionStorage.getItem('mcsm:fakecloud') === '1';
  } catch { return !firebaseConfig; }
}

export async function createBackend() {
  if (wantsFake()) {
    const { createFakeBackend } = await import('./cloud/fake.js');
    backend = createFakeBackend();
  } else {
    const { createFirebaseBackend } = await import('./cloud/firebase.js');
    backend = await createFirebaseBackend(firebaseConfig);
  }
  return backend;
}

// Errors from both backends arrive as { code }. Map them to translation keys.
export function errorKey(e) {
  const code = (e && e.code) || '';
  const map = {
    'auth/email-already-in-use': 'errEmailUsed', 'auth/invalid-email': 'errEmail', 'auth/weak-password': 'errWeakPassword',
    'auth/invalid-credential': 'errCredentials', 'auth/wrong-password': 'errCredentials', 'auth/user-not-found': 'errCredentials',
    'auth/too-many-requests': 'errTooMany', 'auth/network-request-failed': 'errNetwork', 'auth/requires-recent-login': 'errRecentLogin',
    'psn-taken': 'errPsnTaken', 'permission-denied': 'errPermission', 'unavailable': 'errNetwork',
  };
  return map[code] || 'errGeneric';
}
