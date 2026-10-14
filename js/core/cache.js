// Shared per-tab Promise cache: in-flight deduplication, bounded freshness, safe invalidation.
// Never persist staff-only data to localStorage / IndexedDB from this cache.
const cache = new Map();

export function cached(key, loader, ttlMs = Infinity) {
  const previous = cache.get(key);
  if (previous && previous.expiresAt > Date.now()) return previous.promise;
  const record = { expiresAt: Date.now() + ttlMs, promise: null };
  cache.set(key, record);
  record.promise = Promise.resolve().then(loader).then(
    (value) => { if (cache.get(key) === record) record.expiresAt = Date.now() + ttlMs; return value; },
    (error) => { if (cache.get(key) === record) cache.delete(key); throw error; },
  );
  return record.promise;
}

export function invalidate(key) {
  if (!key) { cache.clear(); return; }
  cache.delete(key);
  // A race has distinct public/staff, draft and profile-enrichment views.
  if (key.startsWith('race:') || key.startsWith('raceDocs:')) {
    for (const name of cache.keys()) if (name.startsWith(key + ':')) cache.delete(name);
  }
}

export function invalidateRace(sid) {
  if (sid) { invalidate('race:' + sid); invalidate('raceDocs:' + sid); }
}

export function invalidateAllRaces() {
  for (const name of cache.keys()) if (name.startsWith('race:') || name.startsWith('raceDocs:')) cache.delete(name);
}
