// Shared browser-session data cache. TTLs prevent other devices' edits remaining stale forever;
// successful local writes invalidate immediately in services/backend.js.
import { persisted } from './persist.js';
import { backend } from '../services/backend.js';
import { isAdmin } from '../services/session.js';
import { cached, invalidate } from './cache.js';
export { cached, invalidate } from './cache.js';

export const teams = () => cached('teams', () => persisted('teams', 'teams', () => backend.teams.list()).then((a) => a.slice().sort((x, y) => x.name.localeCompare(y.name, 'hu'))), 5 * 60000);
export const gtTeams = () => cached('gtTeams', () => persisted('gtTeams', 'teams', () => backend.gtTeams.list()).then((a) => a.slice().sort((x, y) => x.tag.localeCompare(y.tag))), 5 * 60000);
export const users = () => cached('users', () => backend.users.list(), 2 * 60000);
// Public Drivers listing only; keep full users() for admin, Compare and race logic.
export const publicDriverDirectory = () => cached('publicDriverDirectory', () => backend.kind === 'fake' ? users() : backend.users.publicList(), 2 * 60000);
export const homeOverview = () => cached('homeOverview', () => backend.users.homeOverview(), 2 * 60000);
export async function teamMap() { return Object.fromEntries((await teams()).map((tm) => [tm.id, tm])); }
export const seasons = () => { const k = 'seasons:' + (isAdmin() ? 'all' : 'public'); return cached(k, () => persisted(k, 'seasons', () => backend.seasons.list({ all: isAdmin() })).then((a) => a.slice().sort((x, y) => y.no - x.no)), 2 * 60000); };
export const entries = (sid) => cached('entries:' + sid, () => backend.entries.list(sid), 30000);
export const invalidateSeason = (sid) => { invalidate('seasons:all'); invalidate('seasons:public'); if (sid) { invalidate('entries:' + sid); invalidate('race:' + sid); invalidate('raceDocs:' + sid); } };
export const cars = () => cached('cars', () => backend.content.get('cars').then((d) => (d && d.cars) || []), 15 * 60000);
export const tracks = () => cached('tracks', () => backend.content.get('tracks').then((d) => (d && d.tracks) || []).catch(() => []), 15 * 60000);
