// Shared short-lived race snapshot. Concurrent screens share a single set of Firestore requests.
// Staff/draft results are never reused by public readers. Writes invalidate immediately;
// TTL handles changes published from other tabs or devices.
import { backend } from '../services/backend.js';
import { isStaff, session } from '../services/session.js';
import { teamMap, gtTeams, entries as loadEntries } from './data.js';
import { cached, invalidateRace as clearRace } from './cache.js';
import { entryTable } from '../model/season.js';
import { buildRounds, seasonTeams, tableOf, pqRanking } from '../model/race.js';

export function loadRace(sid, { drafts = false, includeUsers = true } = {}) {
  const staff = isStaff();
  const ttl = staff ? 20000 : 45000;
  const visibility = staff ? 'staff' : 'public';
  const view = drafts && staff ? 'drafts' : 'published';
  const userScope = staff ? (session.user?.uid || 'anonymous') : 'public';
  return cached(`race:${sid}:${visibility}:${view}:${includeUsers ? 'enriched' : 'light'}:${userScope}`, async () => {
    const raw = await cached(`raceDocs:${sid}:${visibility}:${userScope}`, async () => {
      const [season, entries, roundDocs, sheets, pqDocs, penalties, tmap, gts] = await Promise.all([
        backend.seasons.get(sid), loadEntries(sid), backend.race.roundsList(sid, { staff }),
        backend.race.sheetsList(sid, { staff }), backend.race.pqList(sid),
        backend.penalties.list(sid), teamMap(), gtTeams(),
      ]);
      return { season, entries, roundDocs, sheets, pqDocs, penalties, tmap, gts };
    }, ttl);
    if (!raw.season) return null;
    let people = [];
    if (includeUsers) {
      // Profiles are needed for current GT7 avatars in race lobbies; the homepage and
      // standings based on frozen entry snapshots don't need the whole driver directory.
      try { const d = await import('./data.js'); people = await d.publicDriverDirectory().catch(() => d.users()); } catch { /* snapshots suffice */ }
    }
    const { season, entries, roundDocs, sheets, pqDocs, penalties, tmap, gts } = raw;
    const table = entryTable(season, entries);
    const snaps = Object.fromEntries(entries.map((e) => [e.uid, e.snapshot || {}]));
    const userById = Object.fromEntries(people.map((u) => [u.uid, u]));
    const built = buildRounds(season, roundDocs, sheets, { drafts: drafts && staff, penalties });
    const ids = [...new Set([...table.inList.map((e) => e.uid), ...table.reserves.map((e) => e.uid), ...built.flatMap((r) => Object.values(r.lobbies).flat())])];
    return {
      season, entries, table, roundDocs, sheets, pqDocs, tmap, gts, snaps, built, ids, penalties,
      person: (uid) => ({ ...(userById[uid] || {}), ...(snaps[uid] || {}) }),
      teams: seasonTeams(entries), points: tableOf(season),
      pqRank: pqRanking(table.inList, pqDocs),
      roundDoc: (n) => roundDocs.find((r) => r.n === n) || null,
      sheet: (n, L, S) => sheets.find((s) => s.n === n && s.L === L && s.S === S) || null,
    };
  }, ttl);
}
export const raceCached = (sid) => loadRace(sid);
export const invalidateRace = clearRace;
