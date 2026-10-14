'use strict';
// Public Drivers-page projection. No auth, roles, push settings or account data.
// Keep in step with isComplete() in js/model/profile.js when fields change.
const MAX_JSON_BYTES = 1024 * 1024;
const PROFILE_STRINGS = ['firstName', 'lastName', 'psn', 'psnLower', 'input', 'wheelBrand', 'wheelOther', 'view', 'dr', 'sr', 'teamId', 'gtTeamId', 'gt7Avatar'];
const PROFILE_NUMBERS = ['raceNumber', 'drPoints', 'createdAt'];
const DR = new Set(['S', 'A+', 'A', 'B', 'C', 'D', 'E']);
const SR = new Set(['S', 'A', 'B', 'C', 'D', 'E']);
const VIEWS = new Set(['tv', 'monitor', 'vr', 'cockpit', 'bonnet', 'bumper', 'chase']);
const NAME_RE = /^[\p{L}][\p{L}' .-]{0,39}$/u;
const PSN_RE = /^[A-Za-z][A-Za-z0-9_-]{2,15}$/;

function complete(p) {
  return !!p && NAME_RE.test(p.lastName || '') && NAME_RE.test(p.firstName || '') &&
    PSN_RE.test(p.psn || '') && ['wheel', 'pad'].includes(p.input) &&
    VIEWS.has(p.view) && Number.isInteger(p.raceNumber) && p.raceNumber >= 1 && p.raceNumber <= 999 &&
    DR.has(p.dr) && SR.has(p.sr) && !(p.input === 'wheel' && p.wheelBrand === 'other' && !String(p.wheelOther || '').trim());
}

function publicProfile(uid, p) {
  if (!complete(p)) return null;
  const out = { uid };
  for (const key of PROFILE_STRINGS) {
    if (typeof p[key] === 'string') out[key] = p[key].slice(0, key === 'gt7Avatar' ? 1024 : 200);
  }
  for (const key of PROFILE_NUMBERS) {
    if (typeof p[key] === 'number' && Number.isFinite(p[key])) out[key] = p[key];
  }
  if (!out.psnLower) out.psnLower = String(out.psn).toLowerCase();
  return out;
}

function revisionOf(timestamp) {
  if (!timestamp) return '';
  if (Number.isInteger(timestamp.seconds) && Number.isInteger(timestamp.nanoseconds)) {
    return String(timestamp.seconds).padStart(12, '0') + '.' + String(timestamp.nanoseconds).padStart(9, '0');
  }
  // CloudEvents include a timestamp for deletes, which have no after.updateTime.
  const s = String(timestamp);
  const match = /^(\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d)(?:\.(\d+))?Z$/.exec(s);
  if (!match) throw new Error('Invalid directory event timestamp');
  return String(Math.floor(Date.parse(match[1] + 'Z') / 1000)).padStart(12, '0') + '.' + String((match[2] || '').padEnd(9, '0')).slice(0, 9);
}

function createDirectory(snapshots, now = Date.now()) {
  const drivers = Object.create(null), revisions = Object.create(null);
  for (const snap of snapshots) {
    const p = publicProfile(snap.id, snap.data());
    if (!p) continue;
    drivers[snap.id] = p;
    revisions[snap.id] = revisionOf(snap.updateTime);
  }
  return { version: 1, updatedAt: now, drivers, revisions };
}

function patchForEvent(uid, before, after, afterTime, eventTime) {
  const oldPublic = publicProfile(uid, before);
  const newPublic = publicProfile(uid, after);
  if (JSON.stringify(oldPublic) === JSON.stringify(newPublic)) return null;
  return { uid, profile: newPublic, revision: revisionOf(afterTime || eventTime) };
}

function mergeDirectory(source, patches, now = Date.now()) {
  if (!source || source.version !== 1 || !source.drivers || !source.revisions) throw new Error('Invalid directory snapshot');
  const drivers = Object.assign(Object.create(null), source.drivers);
  const revisions = Object.assign(Object.create(null), source.revisions);
  let changed = 0;
  for (const patch of patches) {
    if (!patch || !patch.uid || !patch.revision) continue;
    if (revisions[patch.uid] && revisions[patch.uid] >= patch.revision) continue;
    revisions[patch.uid] = patch.revision;
    if (patch.profile) drivers[patch.uid] = patch.profile;
    else delete drivers[patch.uid];
    changed++;
  }
  return { snapshot: { version: 1, updatedAt: changed ? now : source.updatedAt, drivers, revisions }, changed };
}

function encodeDirectory(doc) {
  const bytes = Buffer.from(JSON.stringify(doc));
  if (bytes.length > MAX_JSON_BYTES) throw new Error('Public directory exceeds 1 MiB; stop and review sharding before publishing');
  return bytes;
}

module.exports = { MAX_JSON_BYTES, publicProfile, revisionOf, createDirectory, patchForEvent, mergeDirectory, encodeDirectory };
