// services/backend.js
// Picks the backend: real Firebase when a config exists, otherwise (or with ?fakecloud)
// the test backend. Both expose the same interface, so screens never know which is running.
import { firebaseConfig } from '../config/firebase-config.js';
import { invalidate, invalidateRace, invalidateAllRaces } from '../core/cache.js';

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
  installInvalidation(backend);
  return backend;
}

// All writes use one invalidation map, so admin/steward actions can't accidentally
// leave a cached result on screen. Reads remain in-flight-deduplicated.
function installInvalidation(b) {
  const after = (service, method, fn) => {
    if (!b[service] || typeof b[service][method] !== 'function') return;
    const original = b[service][method].bind(b[service]);
    b[service][method] = async (...args) => {
      const value = await original(...args);
      fn(...args);
      return value;
    };
  };
  for (const method of ['save', 'remove', 'removeFull']) after('users', method, (uid, patch) => {
    // Reading a notification or changing device preferences doesn't alter the directory.
    if (method === 'save' && Object.keys(patch || {}).every((k) => ['notifReadAt', 'pushOn', 'pushPrefs'].includes(k))) return;
    invalidate('users'); invalidate('publicDriverDirectory'); invalidate('homeOverview'); invalidateAllRaces();
  });
  for (const service of ['teams', 'gtTeams']) for (const method of ['save', 'remove'])
    after(service, method, () => { invalidate(service); invalidateAllRaces(); });
  for (const method of ['save', 'patch', 'remove', 'purge']) after('seasons', method, (sid) => {
    invalidate('seasons:all'); invalidate('seasons:public');
    invalidateRace(typeof sid === 'string' ? sid : sid?.id);
  });
  for (const method of ['save', 'remove']) after('entries', method, (sid) => {
    invalidate('entries:' + sid); invalidateRace(sid);
  });
  for (const method of ['pqSave', 'roundSave', 'sheetSave']) after('race', method, (sid) => invalidateRace(sid));
  for (const method of ['save', 'remove']) after('penalties', method, (sid) => invalidateRace(sid));
  after('picks', 'save', (sid) => invalidateRace(sid));
  after('content', 'save', (id) => {
    if (['cars', 'tracks', 'ratings', 'news'].includes(id)) invalidate(id === 'ratings' ? 'mcsmRatings' : id);
  });
  after('admin', 'writeMany', () => invalidate());
  // "What's changed" (core/persist.js): admin writes bump the version of what they changed
  // this device first, synchronously (so a list re-read right after the write is fresh), then everyone
  const dropLocal = (keys) => {
    try { Object.keys(localStorage).filter((k) => k.startsWith('mcsm:pc:')).forEach((k) => { let c = null; try { c = JSON.parse(localStorage.getItem(k)); } catch { /* */ } if (!c || keys.includes(c.vk)) localStorage.removeItem(k); }); } catch { /* */ }
    window.__mcsmVersionsStale = true;
  };
  const bumpV = (keys) => { dropLocal(keys); import('../core/persist.js').then((m) => m.bump(keys)).catch(() => {}); };
  for (const method of ['save', 'patch', 'remove', 'purge']) after('seasons', method, () => bumpV(['seasons']));
  for (const service of ['teams', 'gtTeams']) for (const method of ['save', 'remove']) after(service, method, () => bumpV(['teams']));
  after('content', 'save', (id) => { if (id === 'ratings' || id === 'news') bumpV([id]); });
  after('admin', 'writeMany', () => bumpV(['seasons', 'teams', 'ratings', 'news']));
  const touch = (sid) => { const id = typeof sid === 'string' ? sid : sid && sid.id; if (id) import('./season-summary.js').then((m) => m.touchSummary(id)).catch(() => {}); };
  for (const method of ['save', 'patch']) after('seasons', method, touch);
  for (const method of ['save', 'remove']) after('entries', method, touch);
  for (const method of ['pqSave', 'roundSave', 'sheetSave']) after('race', method, touch);
  for (const method of ['save', 'remove']) after('penalties', method, touch);
}

// Errors from both backends arrive as { code }. Map them to translation keys.
export function errorKey(e) {
  const code = (e && e.code) || '';
  const map = {
    'auth/email-already-in-use': 'errEmailUsed', 'auth/invalid-email': 'errEmail', 'auth/weak-password': 'errWeakPassword',
    'auth/invalid-credential': 'errCredentials', 'auth/wrong-password': 'errCredentials', 'auth/user-not-found': 'errCredentials',
    'auth/too-many-requests': 'errTooMany', 'auth/invalid-action-code': 'errActionCode', 'auth/expired-action-code': 'errActionCode', 'auth/network-request-failed': 'errNetwork', 'auth/requires-recent-login': 'errRecentLogin',
    'psn-taken': 'errPsnTaken', 'ai-missing': 'aiMissing', 'ai-quota': 'aiQuota', 'ai-error': 'aiError', 'push-denied': 'pushDenied', 'push-nokey': 'pushNoKey', 'messaging/permission-blocked': 'pushDenied', 'fn-missing': 'errFnMissing', 'fn-network': 'errFnNetwork', 'fn-forbidden': 'errFnForbidden', 'fn-error': 'errFnError', 'storage/unauthorized': 'errPermission', 'storage/quota-exceeded': 'errStorageQuota', 'storage/unknown': 'errStorageSetup', 'storage/bucket-not-found': 'errStorageSetup', 'storage/project-not-found': 'errStorageSetup', 'storage/no-default-bucket': 'errStorageSetup', 'permission-denied': 'errPermission', 'unavailable': 'errNetwork',
  };
  return map[code] || 'errGeneric';
}
