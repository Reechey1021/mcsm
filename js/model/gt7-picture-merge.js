// GT7 profile-picture imports: non-destructive, whitelist-based Firestore updates.
// The generated script is run on gran-turismo.com and returns [{ guid, avatar, cover }].
import { GT7_DEFAULT_AVATAR } from '../data/gt7-images.js';

export const PICTURE_BATCH_LIMIT = 25;

function validPhotoUrl(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  try {
    const u = new URL(value.trim());
    if (u.protocol !== 'https:') return null;
    if (u.hostname !== 'gran-turismo.com' && !u.hostname.endsWith('.gran-turismo.com')) return null;
    return u.href;
  } catch { return null; }
}

export function previewPictureImport(raw, users, allowedGuids, limit = PICTURE_BATCH_LIMIT) {
  const rows = JSON.parse(raw.trim());
  if (!Array.isArray(rows) || !rows.length || rows.length > limit) throw new Error('invalid-json');
  const byGuid = new Map(users.filter((u) => u.gt7Guid).map((u) => [String(u.gt7Guid), u]));
  const ops = [], seen = new Set();
  let unknown = 0, empty = 0, unchanged = 0, duplicates = 0;
  for (const r of rows) {
    if (!r || typeof r !== 'object' || !r.guid) { unknown++; continue; }
    const guid = String(r.guid);
    if (seen.has(guid)) { duplicates++; continue; }
    seen.add(guid);
    const u = byGuid.get(guid);
    if (!u || !allowedGuids.has(guid)) { unknown++; continue; }
    const avatar = validPhotoUrl(r.avatar), cover = validPhotoUrl(r.cover);
    const changes = {};
    if (avatar && avatar !== GT7_DEFAULT_AVATAR && avatar !== u.gt7Avatar) changes.gt7Avatar = avatar;
    if (cover && cover !== u.gt7Cover) changes.gt7Cover = cover;
    if (!avatar && !cover) empty++;
    else if (!Object.keys(changes).length) unchanged++;
    if (Object.keys(changes).length) ops.push({ path: ['users', u.uid], data: changes, merge: true });
  }
  return { rows: rows.length, ops, unknown, empty, unchanged, duplicates };
}
