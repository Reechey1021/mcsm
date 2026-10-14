// Regression checks for reduced-read behaviours, using the in-memory fake backend.
import assert from 'node:assert/strict';
const memory = () => { const m = new Map(); return { getItem: (k) => m.has(k) ? m.get(k) : null, setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
globalThis.localStorage = memory();
globalThis.sessionStorage = memory();
globalThis.location = { search: '?fakecloud' };
globalThis.window = { addEventListener() {} };
globalThis.document = { visibilityState: 'visible', addEventListener() {} };
const wait = (n = 20) => new Promise((r) => setTimeout(r, n));

const { cached, invalidate, invalidateRace } = await import('../js/core/cache.js');
const { selectNotifications } = await import('../js/services/notification-query.js');
const { createBackend } = await import('../js/services/backend.js');
const { initSession, session } = await import('../js/services/session.js');
const { isComplete } = await import('../js/model/profile.js');
const { initNotes, notes, markAllRead } = await import('../js/services/notify.js');
const { loadRace } = await import('../js/core/race-data.js');

let calls = 0;
const shared = async () => { calls++; await wait(); return 42; };
assert.deepEqual(await Promise.all([cached('test', shared, 5000), cached('test', shared, 5000)]), [42, 42]);
assert.equal(calls, 1, 'concurrent same-key requests must deduplicate');
invalidate('test');
assert.equal(await cached('test', shared, 5000), 42);
assert.equal(calls, 2, 'invalidation must force a fresh request');

const now = Date.now();
const all = [
  { id: 'old', kind: 'all', at: now - 61 * 86400000 },
  ...Array.from({ length: 60 }, (_, i) => ({ id: `global${i}`, kind: 'all', at: now - i * 1000 })),
  { id: 'mine', kind: 'users', uids: ['driver'], at: now },
  { id: 'other', kind: 'users', uids: ['other'], at: now },
];
const bounded = selectNotifications(all, 'driver', now);
assert.equal(bounded.length, 51);
assert(!bounded.some((n) => n.id === 'old' || n.id === 'other'));

const backend = await createBackend();
initSession(backend);
initNotes();
await backend.auth.signIn('owner@mcsm.test', 'demo1234');
await wait(60);
assert.equal(session.user.uid, 'owner');
assert(notes.items.length > 0, 'initial notification snapshot must arrive');

const stats = await backend.users.homeOverview();
const allUsers = await backend.users.list();
assert.equal(stats.driverCount, allUsers.filter(isComplete).length);
assert.equal(stats.wheelCount, allUsers.filter((u) => isComplete(u) && u.input === 'wheel').length);
const first = stats.recent[0];
assert.equal((await backend.users.byPsn(first.psnLower)).uid, first.uid);

// New notification updates the badge without any polling or inbox click.
const newId = await backend.notify.add({ kind: 'all', type: 'seasonAnnounced', params: { s: 'MCSM99' }, link: '#/' });
await wait(30);
assert(notes.items.some((n) => n.id === newId), 'fake Firestore listener did not update after publish');
await markAllRead();
await wait(30);
assert.equal(notes.unread, 0);

let raceReads = 0;
const original = backend.race.sheetsList.bind(backend.race);
backend.race.sheetsList = async (...args) => { raceReads++; return original(...args); };
const firstRace = await Promise.all([loadRace('mcsm31'), loadRace('mcsm31')]);
assert(firstRace.every((r) => r && r.season && r.built), 'must load a complete race snapshot');
assert.equal(raceReads, 1, 'concurrent reads should share the whole race snapshot');
await loadRace('mcsm31');
assert.equal(raceReads, 1, 'repeated navigation should reuse the same snapshot');
await backend.race.roundSave('mcsm31', 3, { resultsState: 'provisional' });
await loadRace('mcsm31');
assert.equal(raceReads, 2, 'successful race writes must invalidate cached snapshots');
invalidateRace('mcsm31');
await loadRace('mcsm31', { includeUsers: false });
assert.equal(raceReads, 3, 'light homepage snapshot must use the same race data, without user directory');

// Season patches (e.g. publishing a result) must also invalidate the shared race snapshot.
await backend.seasons.patch('mcsm31', { description: 'Read optimisation test' });
await loadRace('mcsm31', { includeUsers: false });
assert.equal(raceReads, 4, 'season patch must invalidate race snapshots');

// In-app notification read receipts must not evict the full driver directory cache.
const { users: cachedUsers } = await import('../js/core/data.js');
const userList = await cachedUsers();
await backend.users.save('owner', { notifReadAt: Date.now() });
assert.strictEqual(await cachedUsers(), userList, 'read receipts should not evict driver cache');

await backend.auth.signOut();
await wait(40);
assert.equal(notes.items.length, 0, 'logout clears notifications');
console.log('Read optimisation regression tests passed.');
