// core/persist.js
// Faster repeat visits with fewer reads: shared lists (seasons, teams, ratings, news) are kept on the
// device. One small document, content/versions, says when each last changed; anything unchanged is
// served from the device instead of being read again. Admin writes bump the matching version, so
// changes still show up straight away. If the versions document is missing, nothing is cached.
import { backend } from '../services/backend.js';
import { store } from './storage.js';

const MAX_AGE = 6 * 3600 * 1000;
let versionsP = null, versionsAt = 0;
export function versions() {
  if (!versionsP || window.__mcsmVersionsStale || Date.now() - versionsAt > 60000) {
    window.__mcsmVersionsStale = false;
    versionsAt = Date.now();
    versionsP = backend.content.get('versions').catch(() => null);
  }
  return versionsP;
}

// key: what is stored on the device; vkey: which version it follows ('seasons', 'teams', 'ratings', 'news')
export async function persisted(key, vkey, fetcher) {
  const vers = await versions();
  const v = vers && vers[vkey];
  const c = store.get('pc:' + key, null);
  // also re-read after 6 hours whatever the version says (covers edits made directly in the Firebase console)
  if (v && c && c.v === v && Date.now() - (c.at || 0) < MAX_AGE) return c.data;
  const data = await fetcher();
  if (v) { try { store.set('pc:' + key, { v, vk: vkey, at: Date.now(), data }); } catch { /* storage full: just don't keep it */ } }
  return data;
}

// After an admin write: record the change for everyone, and drop this device's copies.
export async function bump(vkeys) {
  try { await backend.content.bump(Object.fromEntries(vkeys.map((k) => [k, Date.now()]))); } catch { /* not an admin / offline */ }
  versionsP = null;
  try {
    Object.keys(localStorage).filter((k) => k.startsWith('mcsm:pc:')).forEach((k) => {
      try { const c = JSON.parse(localStorage.getItem(k)); if (!c || vkeys.includes(c.vk)) localStorage.removeItem(k); } catch { localStorage.removeItem(k); }
    });
  } catch { /* */ }
}
