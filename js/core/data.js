// core/data.js
// Small read cache over the backend for lists many screens share (teams, GT teams, users).
// Cleared whenever we write, so screens always see fresh data after an edit.
import { backend } from '../services/backend.js';
import { isAdmin } from '../services/session.js';

const cache = new Map();
export function cached(key, loader) {
  if (!cache.has(key)) cache.set(key, loader().catch((e) => { cache.delete(key); throw e; }));
  return cache.get(key);
}
export const invalidate = (key) => (key ? cache.delete(key) : cache.clear());
export const teams = () => cached('teams', () => backend.teams.list().then((a) => a.sort((x, y) => x.name.localeCompare(y.name, 'hu'))));
export const gtTeams = () => cached('gtTeams', () => backend.gtTeams.list().then((a) => a.sort((x, y) => x.tag.localeCompare(y.tag))));
export const users = () => cached('users', () => backend.users.list());
export async function teamMap() { return Object.fromEntries((await teams()).map((tm) => [tm.id, tm])); }
export const seasons = () => cached('seasons:' + (isAdmin() ? 'all' : 'public'), () => backend.seasons.list({ all: isAdmin() }).then((a) => a.sort((x, y) => y.no - x.no)));
export const entries = (sid) => cached('entries:' + sid, () => backend.entries.list(sid));
export const invalidateSeason = (sid) => { invalidate('seasons:all'); invalidate('seasons:public'); if (sid) invalidate('entries:' + sid); };
// GT7 car list imported from GT GridStats (content/cars). Empty until an admin imports it.
export const cars = () => cached('cars', () => backend.content.get('cars').then((d) => (d && d.cars) || []));
// GT7 track list from GT GridStats (content/tracks): photos, maps, lengths.
export const tracks = () => cached('tracks', () => backend.content.get('tracks').then((d) => (d && d.tracks) || []).catch(() => []));
