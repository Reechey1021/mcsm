'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { publicProfile, createDirectory, patchForEvent, mergeDirectory, encodeDirectory, revisionOf } = require('../directory-cache/snapshot.cjs');
const { OBJECT, rebuild, publishChanges, batchedPublisher } = require('../directory-cache/publisher.cjs');

const makeDriver = (name = 'Alpha', extra = {}) => ({
  firstName: name, lastName: 'Tester', psn: 'Alpha_TEST', psnLower: 'alpha_test',
  input: 'wheel', wheelBrand: 'Logitech', view: 'tv', raceNumber: 11, dr: 'B', sr: 'S',
  drPoints: 42000, gt7Avatar: 'https://example.com/avatar.png',
  teamId: 't0', gtTeamId: 'MGTK', createdAt: 100,
  roles: { owner: true }, pushPrefs: { live: true }, notifReadAt: 32,
  email: 'do-not-publish@example.com', suspendedUntil: 100000, ...extra,
});
const ts = (n) => ({ seconds: n, nanoseconds: 123000000 });
const snap = (id, d, n) => ({ id, data: () => d, updateTime: ts(n) });
function fakeBucket() {
  let payload = null, generation = 0, writes = 0, downloads = 0;
  return {
    file(name, options = {}) {
      assert.equal(name, OBJECT);
      return {
        async getMetadata() {
          if (!generation) throw Object.assign(new Error('missing'), { code: 404 });
          return [{ generation: String(generation) }];
        },
        async download() {
          if (!generation || options.generation && String(options.generation) !== String(generation)) throw Object.assign(new Error('not found'), { code: 404 });
          downloads++;
          return [payload];
        },
        async save(bytes, opts) {
          const expected = String(opts.preconditionOpts.ifGenerationMatch);
          if (expected !== String(generation)) throw Object.assign(new Error('conflict'), { code: 412 });
          assert.equal(opts.metadata.cacheControl, 'public, max-age=60');
          payload = Buffer.from(bytes); generation++; writes++;
        },
      };
    },
    stats() { return { generation, writes, downloads, body: payload && JSON.parse(payload.toString()) }; },
  };
}

async function main() {
  const profile = publicProfile('u1', makeDriver());
  assert(profile && profile.uid === 'u1');
  for (const secret of ['roles', 'email', 'notifReadAt', 'pushPrefs', 'suspendedUntil']) assert(!(secret in profile));
  assert.equal(publicProfile('u1', { firstName: 'Not finished' }), null);
  assert.equal(publicProfile('u1', makeDriver('Alpha', { wheelBrand: 'other', wheelOther: '' })), null);
  assert.equal(publicProfile('u1', makeDriver('Alpha', { wheelBrand: 'other', wheelOther: 'Moza' })).wheelOther, 'Moza');

  const initial = createDirectory([snap('u1', makeDriver(), 20), snap('u2', makeDriver('Beta'), 21), snap('incomplete', { firstName: 'New' }, 22)]);
  assert.deepEqual(Object.keys(initial.drivers).sort(), ['u1', 'u2']);
  assert.equal(initial.revisions.u1, revisionOf(ts(20)));
  assert(!encodeDirectory(initial).toString().includes('do-not-publish@example.com'));

  const before = makeDriver();
  const changed = makeDriver('Changed');
  assert.equal(patchForEvent('u1', before, { ...before, pushPrefs: { live: false } }, ts(21), null), null);
  const update = patchForEvent('u1', before, changed, ts(21), null);
  assert(update && update.profile.firstName === 'Changed');
  const applied = mergeDirectory(initial, [update], 900);
  assert.equal(applied.snapshot.drivers.u1.firstName, 'Changed');
  assert.equal(applied.changed, 1);
  assert.equal(mergeDirectory(applied.snapshot, [update]).changed, 0);
  assert.equal(mergeDirectory(applied.snapshot, [patchForEvent('u1', changed, before, ts(20), null)]).changed, 0);
  const removal = patchForEvent('u1', changed, null, null, '1970-01-01T00:00:22.000Z');
  assert.equal(mergeDirectory(applied.snapshot, [removal]).snapshot.drivers.u1, undefined);

  const bucket = fakeBucket();
  let firestoreReads = 0;
  const firestore = { collection(c) { assert.equal(c, 'users'); return { async get() { firestoreReads += 2; return { docs: [snap('u1', before, 20), snap('u2', makeDriver('Beta'), 21)], size: 2 }; } }; } };
  const seeded = await rebuild(bucket, firestore);
  assert.equal(seeded.drivers, 2); assert.equal(firestoreReads, 2);
  assert.equal(bucket.stats().writes, 1);
  const after = makeDriver('Newname');
  const oneChange = patchForEvent('u1', before, after, ts(25), null);
  await publishChanges(bucket, [oneChange]);
  assert.equal(bucket.stats().body.drivers.u1.firstName, 'Newname');
  assert.equal(bucket.stats().writes, 2);
  assert.equal(firestoreReads, 2, 'profile updates must not reload the directory from Firestore');
  await publishChanges(bucket, [oneChange]);
  assert.equal(bucket.stats().writes, 2, 'redelivered events must not rewrite the file');

  const waiting = batchedPublisher((batch) => publishChanges(bucket, batch), 10);
  const concurrent = [];
  for (let i = 0; i < 50; i++) concurrent.push(waiting({ uid: `u${i + 10}`, profile: publicProfile(`u${i + 10}`, makeDriver(`Pilot`)), revision: revisionOf(ts(30 + i)) }));
  await Promise.all(concurrent);
  assert.equal(bucket.stats().writes, 3, '50 simultaneous changes should produce only one extra object write');
  assert.equal(Object.keys(bucket.stats().body.drivers).length, 52);
  assert.equal(firestoreReads, 2);

  const dirSrc = fs.readFileSync(path.join(__dirname, '../js/screens/drivers.js'), 'utf8');
  assert(dirSrc.includes('Promise.all([publicDriverDirectory()'), 'driver list must load shared public snapshot');
  const dataSrc = fs.readFileSync(path.join(__dirname, '../js/core/data.js'), 'utf8');
  assert(dataSrc.includes("backend.kind === 'fake' ? users() : backend.users.publicList()"));
  const rules = fs.readFileSync(path.join(__dirname, '../storage.rules'), 'utf8');
  assert(rules.includes('match /public-cache/drivers.json') && rules.includes('allow write: if false'));
  console.log('Public directory cache: all tests passed (privacy, edits, deletes, stale/duplicate events, bulk coalescing, zero extra Firestore reads).');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
