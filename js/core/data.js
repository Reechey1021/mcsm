// core/data.js
// Small read cache over the backend for lists many screens share (teams, GT teams, users).
// Cleared whenever we write, so screens always see fresh data after an edit.
import { backend } from '../services/backend.js';

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
export const seasons = () => cached('seasons', () => backend.seasons.list({ all: true }).then((a) => a.sort((x, y) => y.no - x.no)));
export const entries = (sid) => cached('entries:' + sid, () => backend.entries.list(sid));
export const invalidateSeason = (sid) => { invalidate('seasons'); if (sid) invalidate('entries:' + sid); };
