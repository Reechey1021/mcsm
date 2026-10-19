// services/mcsm-rating.js
// MCSM Rating v3.2 wiring. The historical bootstrap (MCSM25-30, imported once by an admin) lives in
// an admin-only record (config/ratingBootstrap). Admins compute; only what drivers may see is
// published to content/ratings: full numbers for established drivers, the round count otherwise.
import { persisted } from '../core/persist.js';
import { backend } from './backend.js';
import { seasons as loadSeasons, users as loadUsers, cached, invalidate } from '../core/data.js';
import { loadRace } from '../core/race-data.js';
import { computeRatings, overallOf, publicOf, publicEntry, newlyRanked, RATING_CFG, RATING_VERSION } from '../engine/rating.js';
import { normName } from '../model/name-match.js';
import { buildRecap } from '../model/recap.js';
export const LIVE_FROM_SEASON = 31;
const ALIASES = { 'tdrenkovics': 'mgtknothingtomi' };
// Finished live rounds (MCSM31 onwards) with session results; imported old rounds only have totals.
export async function collectRounds() {
  const all = (await loadSeasons()).filter((s) => s.no >= LIVE_FROM_SEASON).sort((a, b) => a.no - b.no);
  const out = [];
  for (const s of all) {
    if (!(s.rounds || []).length) continue;
    const ctx = await loadRace(s.id).catch(() => null);
    if (!ctx) continue;
    for (const rd of ctx.built.slice().sort((a, b) => a.n - b.n)) {
      if (rd.legacy || rd.state !== 'final' || !rd.results || !Object.keys(rd.results).length) continue;
      out.push({ key: `${s.id}-${rd.n}`, label: `MCSM${s.no} / ${rd.n}`, results: rd.results });
    }
  }
  return out;
}
export async function loadBootstrap() { return (await backend.config.get('ratingBootstrap').catch(() => null)) || null; }
export const saveBootstrap = (doc) => backend.config.save('ratingBootstrap', doc);
// Match imported PSN IDs to accounts: saved choices first, then exact PSN (accents/case ignored).
export function matchBootstrap(entries, users, map = {}) {
  const byNorm = {};
  users.forEach((u) => { if (u.psn) byNorm[normName(u.psn)] = u.uid; });
  return entries.map((e) => {
    const k = normName(e.psn);
    const uid = map[k] !== undefined ? map[k] : byNorm[ALIASES[k] || k] || null;
    return { ...e, key: k, uid };
  });
}
export function startFrom(boot, users) {
  const start = {};
  if (!boot || !boot.entries) return start;
  matchBootstrap(boot.entries, users, boot.map || {}).forEach((e) => {
    if (!e.uid || start[e.uid]) return;
    start[e.uid] = { q: e.q, s: e.s, g: e.g, n: e.rounds || 0, established: e.status === 'established' || (e.rounds || 0) >= RATING_CFG.provisionalRounds };
  });
  return start;
}
// opts.recap = { sid, n }: the round whose results were just made final; its drivers get a round recap.
export async function computeAndPublish(opts = {}) {
  invalidate('users'); invalidate();
  const [boot, users, rounds, prevDoc] = await Promise.all([loadBootstrap(), loadUsers(), collectRounds(), backend.content.get('ratings').catch(() => null)]);
  const start = startFrom(boot, users);
  const res = computeRatings(rounds, start);
  const drivers = {};
  let established = 0;
  const f3 = (v) => +v.toFixed(3);
  for (const [uid, st] of Object.entries(res.drivers)) {
    // drivers established from the historical import start their history at MCSM25–30
    const baseline = start[uid] && (start[uid].established || (start[uid].n || 0) >= RATING_CFG.provisionalRounds)
      ? { l: 'MCSM25–30', r: f3(overallOf(st.prior)), q: f3(publicOf(st.prior.q)), s: f3(publicOf(st.prior.s)), g: f3(publicOf(st.prior.g)) } : null;
    drivers[uid] = publicEntry(st, { baseline });
    if (drivers[uid].e) established++;
  }
  const out = { version: RATING_VERSION, computedAt: Date.now(), rounds: rounds.length, established, drivers };
  await backend.content.save('ratings', out);
  const known = new Set(users.map((u) => u.uid));
  // Round recap ("Eredményeid"): every driver of the round that was just made final gets a note on their
  // own profile (positions, rating before/after or calibration progress, championship place). Shown once.
  const recapped = new Set();
  if (opts.recap && opts.recap.sid) {
    try {
      invalidate('race:' + opts.recap.sid);
      const ctx = await loadRace(opts.recap.sid, { staff: true, includeUsers: false });
      const rd = ctx && ctx.built.find((r) => r.n === opts.recap.n);
      const racers = rd ? [...new Set(Object.values(rd.results || {}).flatMap((res) => Object.values(res).flatMap((rows) => (rows || []).map((r) => r.id))))] : [];
      const notes = racers.filter((u) => known.has(u)).map((u) => [u, buildRecap(ctx, opts.recap.n, u, out, { calibRounds: RATING_CFG.provisionalRounds })]).filter(([, note]) => note);
      for (let i = 0; i < notes.length; i += 10) {
        await Promise.all(notes.slice(i, i + 10).map(([u, note]) => backend.users.save(u, { roundRecap: note }).then(() => { if (note.mode === 'ranked') recapped.add(u); }).catch((e) => console.warn('round recap note', u, e))));
      }
    } catch (e) { console.warn('round recaps not written', e); }
  }
  // "You're now ranked": a note on the profile of each driver who has just completed calibration
  // (they see the reveal once; their profile is already loaded, so it costs them no reads).
  // Not needed when their round recap already is the "Besorolva!" screen.
  for (const n of newlyRanked(prevDoc && prevDoc.drivers, drivers, res.drivers)) {
    if (!known.has(n.uid) || recapped.has(n.uid)) continue;
    const { uid, ...note } = n;
    await backend.users.save(uid, { rankReveal: { ...note, at: Date.now() } }).catch((e) => console.warn('rank reveal note', uid, e));
  }
  if (boot) await saveBootstrap({ ...boot, lastRun: { at: Date.now(), rounds: rounds.length, established } });
  invalidate('mcsmRatings');
  return { rounds: rounds.length, established, audit: res.audit };
}
export const publicRatings = () => cached('mcsmRatings', () => persisted('ratings', 'ratings', () => backend.content.get('ratings')).then((d) => d || { drivers: {} }).catch(() => ({ drivers: {} })));

// A ranked driver's MCSM Rating as it stood after round n of season no (their last value at or
// before then; the MCSM25–30 import counts as the start). null if they weren't ranked yet.
const histKey = (l) => { const m = /MCSM(\d+)\s*\/\s*(\d+)/.exec(String(l)); return m ? +m[1] * 1000 + +m[2] : /MCSM25/.test(String(l)) ? 0 : null; };
export function ratingAt(x, no, n) {
  if (!x || !x.e) return null;
  const target = no * 1000 + n;
  let best = null;
  (x.h || []).forEach((e) => { const p = Array.isArray(e) ? { l: e[0], r: e[1] } : e; const k = histKey(p.l); if (k != null && k <= target && (!best || k >= best.k)) best = { k, r: p.r }; });
  return best ? best.r : null;
}
// { A: { avg, ranked, total } ... } for the lobbies of one round (ranked drivers only).
export function lobbyAverages(P, lobbies, no, n) {
  const out = {};
  Object.entries(lobbies || {}).forEach(([L, ids]) => {
    const vals = (ids || []).map((u) => ratingAt((P.drivers || {})[u], no, n)).filter((v) => v != null);
    if (vals.length) out[L] = { avg: vals.reduce((a, b) => a + b, 0) / vals.length, ranked: vals.length, total: ids.length };
  });
  return out;
}
export const fmtRating = (v) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
