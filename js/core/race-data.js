// core/race-data.js
// Loads everything a season's race screens need in one go and derives the rest.
import { backend } from '../services/backend.js';
import { isStaff } from '../services/session.js';
import { teamMap, gtTeams, cached, invalidate, users as loadUsers } from './data.js';
import { entryTable } from '../model/season.js';
import { buildRounds, seasonTeams, tableOf, pqRanking } from '../model/race.js';

export async function loadRace(sid, { drafts = false } = {}) {
  const staff = isStaff();
  const [season, entries, roundDocs, sheets, pqDocs, tmap, gts, penalties, people] = await Promise.all([
    backend.seasons.get(sid), backend.entries.list(sid), backend.race.roundsList(sid, { staff }),
    backend.race.sheetsList(sid, { staff }), backend.race.pqList(sid), teamMap(), gtTeams(), backend.penalties.list(sid), loadUsers().catch(() => []),
  ]);
  if (!season) return null;
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
}
export const raceCached = (sid) => cached('race:' + sid, () => loadRace(sid));
export const invalidateRace = (sid) => invalidate('race:' + sid);
