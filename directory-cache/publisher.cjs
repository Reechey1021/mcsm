'use strict';
// Generation-precondition writes prevent simultaneous publisher/rebuild activity
// from silently dropping someone's update. All retries are bounded.
const { mergeDirectory, encodeDirectory } = require('./snapshot.cjs');
const OBJECT = 'public-cache/drivers.json';
const CACHE_CONTROL = 'public, max-age=60';
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const isMissing = (e) => e && (e.code === 404 || e.code === '404');
const isConflict = (e) => e && (e.code === 412 || e.code === '412' || e.code === 404);

async function readObject(bucket) {
  const file = bucket.file(OBJECT);
  let meta;
  try { [meta] = await file.getMetadata(); }
  catch (e) { if (isMissing(e)) throw Object.assign(new Error('Directory not seeded'), { code: 'directory-not-seeded' }); throw e; }
  // Read that exact generation, never an older body with newer generation metadata.
  const generation = meta.generation;
  const [bytes] = await bucket.file(OBJECT, { generation }).download();
  return { snapshot: JSON.parse(bytes.toString('utf8')), generation };
}

async function saveIfGeneration(bucket, snapshot, generation) {
  await bucket.file(OBJECT).save(encodeDirectory(snapshot), {
    resumable: false,
    contentType: 'application/json',
    metadata: { cacheControl: CACHE_CONTROL },
    preconditionOpts: { ifGenerationMatch: generation == null ? 0 : generation },
  });
}

async function publishChanges(bucket, changes, { retries = 5, sleep = pause } = {}) {
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const { snapshot, generation } = await readObject(bucket);
      const { snapshot: next, changed } = mergeDirectory(snapshot, changes);
      if (!changed) return { changed: 0, wrote: false };
      await saveIfGeneration(bucket, next, generation);
      return { changed, wrote: true };
    } catch (e) {
      if (e && e.code === 'directory-not-seeded') throw new Error('Public driver directory not seeded yet. Create cacheRequests/drivers first.');
      if (!isConflict(e) || attempt === retries - 1) throw e;
      await sleep(Math.min(1000, 50 * Math.pow(2, attempt)));
    }
  }
}

async function rebuild(bucket, firestore) {
  // Only called by an explicit console request, NEVER on a timer or page request.
  for (let attempt = 0; attempt < 3; attempt++) {
    let generation = 0;
    try {
      const [meta] = await bucket.file(OBJECT).getMetadata();
      generation = meta.generation;
    } catch (e) { if (!isMissing(e)) throw e; }
    const { createDirectory } = require('./snapshot.cjs');
    const all = await firestore.collection('users').get();
    const doc = createDirectory(all.docs);
    try {
      await saveIfGeneration(bucket, doc, generation);
      return { drivers: Object.keys(doc.drivers).length, sourceDocuments: all.size };
    } catch (e) {
      if (!isConflict(e) || attempt === 2) throw e;
    }
  }
}

// Multiple writes in the existing GridStats sync commonly arrive in the same burst.
// Keep each invocation open for a short window and publish the combined delta once.
function batchedPublisher(publish, windowMs = 1200) {
  let waiting = [], timer = null, chain = Promise.resolve();
  return (change) => new Promise((resolve, reject) => {
    waiting.push({ change, resolve, reject });
    if (timer) return;
    timer = setTimeout(() => {
      const group = waiting;
      waiting = [];
      timer = null;
      chain = chain.catch(() => {}).then(() => publish(group.map((p) => p.change)));
      chain.then((result) => group.forEach((p) => p.resolve(result)), (err) => group.forEach((p) => p.reject(err)));
    }, windowMs);
  });
}

module.exports = { OBJECT, CACHE_CONTROL, readObject, saveIfGeneration, publishChanges, rebuild, batchedPublisher };
