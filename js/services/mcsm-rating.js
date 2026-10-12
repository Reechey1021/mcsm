// services/mcsm-rating.js
// MCSM Rating v3.2 wiring. The historical bootstrap (MCSM25–30, imported once by an admin) lives in
// an admin-only record (config/ratingBootstrap). Admins compute; only what drivers may see is
// published to content/ratings: full numbers for established drivers, the round count otherwise.
import { backend } from './backend.js';
import { seasons as loadSeasons, users as loadUsers, cached, invalidate } from '../core/data.js';
import { loadRace } from '../core/race-data.js';
import { gpGrid } from '../engine/scoring.js';
import { computeRatings, overallOf, publicOf, RATING_CFG, RATING_VERSION } from '../engine/rating.js';
import { normName } from '../model/name-match.js';

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
      const grids = Object.fromEntries(Object.entries(rd.results).map(([L, res]) => {
        const q = (res.Q || []).filter((r) => r.status === 'OK' || r.status === 'NT').sort((a, b) => a.pos - b.pos);
        return [L, { S: q.map((r) => r.id), GP: gpGrid(res.Q || []).map((r) => r.id) }];
      }));
      out.push({ key: `${s.id}-${rd.n}`, label: `MCSM${s.no} / ${rd.n}`, results: rd.results, grids });
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

export async function computeAndPublish() {
  invalidate('users'); invalidate();
  const [boot, users, rounds] = await Promise.all([loadBootstrap(), loadUsers(), collectRounds()]);
  const start = startFrom(boot, users);
  const res = computeRatings(rounds, start);
  const drivers = {};
  let established = 0;
  const f3 = (v) => +v.toFixed(3);
  for (const [uid, st] of Object.entries(res.drivers)) {
    if (st.established) {
      established++;
      const last = st.history[st.history.length - 1];
      const base = start[uid] && start[uid].established ? [{ l: 'MCSM25–30', r: f3(overallOf(st.prior)), q: f3(publicOf(st.prior.q)), s: f3(publicOf(st.prior.s)), g: f3(publicOf(st.prior.g)) }] : [];
      drivers[uid] = {
        e: 1, r: overallOf(st.lat), q: publicOf(st.lat.q), s: publicOf(st.lat.s), g: publicOf(st.lat.g), n: st.n, hi: st.highest,
        dl: last ? last.delta : 0,
        // only rounds raced as an established driver (no provisional numbers are published)
        h: [...base, ...st.history.filter((x) => !x.provisional).map((x) => ({ l: x.label, r: f3(x.after), q: f3(x.q), s: f3(x.s), g: f3(x.g) }))],
      };
    } else drivers[uid] = { e: 0, n: st.n };
  }
  const out = { version: RATING_VERSION, computedAt: Date.now(), rounds: rounds.length, established, drivers };
  await backend.content.save('ratings', out);
  if (boot) await saveBootstrap({ ...boot, lastRun: { at: Date.now(), rounds: rounds.length, established } });
  invalidate('mcsmRatings');
  return { rounds: rounds.length, established, audit: res.audit };
}

export const publicRatings = () => cached('mcsmRatings', () => backend.content.get('ratings').then((d) => d || { drivers: {} }).catch(() => ({ drivers: {} })));
