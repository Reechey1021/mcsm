'use strict';
// Two event triggers only. No schedules, no polling, no modification to GT7 sync.
// 1) users/{uid} changes: update *only* that driver's public fields in the shared file.
// 2) cacheRequests/drivers: manually initialise/repair the file in Firebase Console.
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { patchForEvent } = require('./snapshot.cjs');
const { publishChanges, rebuild, batchedPublisher } = require('./publisher.cjs');

admin.initializeApp({ storageBucket: 'mcsm-a0a92.firebasestorage.app' });
const bucket = () => admin.storage().bucket();
const firestore = () => admin.firestore();
// Confirm your Firestore location before deployment; eur3 uses europe-west1.
const REGION = 'europe-central2';
const common = {
  region: REGION, memory: '256MiB', cpu: 1, minInstances: 0,
  maxInstances: 1, concurrency: 80, timeoutSeconds: 60, retry: false,
};
const publishBatch = batchedPublisher(async (items) => {
  const result = await publishChanges(bucket(), items);
  if (result.wrote) console.info('Updated public directory', { changes: result.changed });
  return result;
});

exports.updatePublicDriverDirectory = onDocumentWritten({ ...common, document: 'users/{uid}' }, async (event) => {
  // Retry failed events for at most 10 minutes, not indefinitely.
  const eventAt = Date.parse(event.time || '');
  if (!Number.isFinite(eventAt)) { console.error('Directory event missing timestamp', event.id); return; }
  const age = Date.now() - eventAt;
  if (age > 10 * 60000) {
    console.error('Skipped expired public-directory update', event.id);
    return;
  }
  const before = event.data && event.data.before && event.data.before.exists ? event.data.before.data() : null;
  const afterSnap = event.data && event.data.after;
  const after = afterSnap && afterSnap.exists ? afterSnap.data() : null;
  const patch = patchForEvent(event.params.uid, before, after, afterSnap && afterSnap.exists ? afterSnap.updateTime : null, event.time);
  if (!patch) return; // Ignore notification/read-state, roles and other non-public edits.
  await publishBatch(patch);
});

exports.rebuildPublicDriverDirectory = onDocumentWritten({ ...common, document: 'cacheRequests/drivers', retry: false }, async (event) => {
  // Only an explicit console create/update triggers the one-time/repair full read.
  if (!event.data || !event.data.after || !event.data.after.exists) return;
  const result = await rebuild(bucket(), firestore());
  console.info('Rebuilt public driver directory', result);
});
