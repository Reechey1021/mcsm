// services/season-summary.js
// A saved copy of a finished season's public race data (season, entries, published rounds and
// results, PQ, penalties) in content/summary-<sid>. Visitors read this one document instead of
// six collections; standings, the hall of fame, profiles and team history all use it.
// Written by an admin's browser when a season is finished, and again after any later edit to it.
import { backend } from './backend.js';
import { seasons as loadSeasons, invalidate } from '../core/data.js';
import { isAdmin } from './session.js';

export const SUMMARY_VERSION = 1;
export const FINISHED_STATES = ['finished', 'archived'];
const key = (sid) => 'summary-' + sid;
const clean = (x) => JSON.parse(JSON.stringify(x));   // Firestore refuses undefined values

export async function buildSummary(sid) {
  const [season, entries, roundDocs, sheets, pqDocs, penalties] = await Promise.all([
    backend.seasons.get(sid), backend.entries.list(sid), backend.race.roundsList(sid, { staff: false }),
    backend.race.sheetsList(sid, { staff: false }), backend.race.pqList(sid), backend.penalties.list(sid),
  ]);
  if (!season || !FINISHED_STATES.includes(season.state)) return false;
  const doc = clean({ v: SUMMARY_VERSION, sid, savedAt: Date.now(), season, entries, roundDocs, sheets, pqDocs, penalties });
  if (JSON.stringify(doc).length > 900000) throw new Error('Season summary too large: ' + sid);
  await backend.content.save(key(sid), doc);
  return true;
}

export async function rebuildAllSummaries() {
  invalidate();
  let n = 0;
  for (const s of (await loadSeasons()).filter((x) => FINISHED_STATES.includes(x.state))) if (await buildSummary(s.id)) n++;
  return n;
}

export async function readSummary(sid) {
  const d = await backend.content.get(key(sid)).catch(() => null);
  return d && d.v === SUMMARY_VERSION ? d : null;
}

// After an admin edits anything in a season: if it's finished, refresh its summary (debounced).
const timers = {};
export function touchSummary(sid) {
  if (!sid || !isAdmin()) return;
  clearTimeout(timers[sid]);
  timers[sid] = setTimeout(async () => {
    try { const s = (await loadSeasons()).find((x) => x.id === sid); if (s && FINISHED_STATES.includes(s.state)) await buildSummary(sid); }
    catch (e) { console.warn('season summary not refreshed', sid, e); }
  }, 2500);
}
