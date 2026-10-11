// services/mcsm-rating.js
// Ties the rating engine to the league's data. Admins compute (seeds are admin-only, in
// config/ratingSeeds) and publish only what drivers may see to content/ratings: full numbers for
// established drivers (5+ rounds), just the round count for everyone else.
import { backend } from './backend.js';
import { seasons as loadSeasons, users as loadUsers, cached, invalidate } from '../core/data.js';
import { loadRace } from '../core/race-data.js';
import { gpGrid } from '../engine/scoring.js';
import { computeRatings, normaliseSeeds, overallOf, reliabilityOf, RATING_CFG, RATING_VERSION } from '../engine/rating.js';

// Every finished round with session results (imported old rounds only have totals: skipped).
export async function collectRounds() {
  const all = (await loadSeasons()).slice().sort((a, b) => a.no - b.no);
  const out = [];
  for (const s of all) {
    if (!(s.rounds || []).length) continue;
    const ctx = await loadRace(s.id).catch(() => null);
    if (!ctx) continue;
    for (const rd of ctx.built) {
      if (rd.legacy || rd.state !== 'final' || !rd.results || !Object.keys(rd.results).length) continue;
      const gp = Object.fromEntries(Object.entries(rd.results).map(([L, res]) => [L, gpGrid(res.Q || []).map((r) => r.id)]));
      out.push({
        key: `${s.id}-${rd.n}`, label: `MCSM${s.no} · ${rd.n}.`, sid: s.id, no: s.no, n: rd.n,
        lobbies: rd.lobbies || {}, results: rd.results, gpGrid: gp,
        penalties: (ctx.penalties || []).filter((p) => p.n === rd.n && p.uid).map((p) => ({ uid: p.uid, L: p.L, severity: p.severity || 1 })),
        excused: ctx.entries.filter((e) => (e.absences || []).includes(rd.n)).map((e) => e.uid),
      });
    }
  }
  return out;
}

export async function loadSeeds() { return (await backend.config.get('ratingSeeds').catch(() => null)) || { tiers: {}, conf: {}, locked: false }; }
export const saveSeeds = (doc) => backend.config.save('ratingSeeds', doc);

// Founding population = locked list, or (before locking) everyone with a profile right now.
export function seedsFrom(doc, users) {
  const founders = doc.locked && doc.founders ? doc.founders : users.map((u) => u.uid);
  return normaliseSeeds(doc.tiers || {}, founders);
}

export async function computeAndPublish() {
  invalidate('users'); invalidate();
  const [doc, users, rounds] = await Promise.all([loadSeeds(), loadUsers(), collectRounds()]);
  const { seeds, mean } = seedsFrom(doc, users);
  const res = computeRatings(rounds, seeds);
  const drivers = {};
  let established = 0;
  for (const [uid, st] of Object.entries(res.drivers)) {
    if (!st.done && !st.history.length) continue;
    if (st.done >= RATING_CFG.provisionalRounds) {
      established++;
      const last = st.history[st.history.length - 1] || {};
      drivers[uid] = {
        e: 1, r: overallOf(st), q: st.Q, rr: st.R, d: st.D, n: st.done, rel: reliabilityOf(st.rel), hi: st.highest,
        dl: last.delta || 0, pf: last.perf ?? null, ex: last.expMain ?? null,
        // history from the point the rating became public (no provisional numbers)
        h: st.history.filter((x) => !x.provisional).map((x) => [x.label, +x.after.toFixed(3), x.perf == null ? null : +x.perf.toFixed(2)]),
      };
    } else drivers[uid] = { e: 0, n: st.done };
  }
  const pop = Object.values(res.drivers);
  const avg = pop.length ? pop.reduce((a, s) => a + overallOf(s), 0) / pop.length : 100;
  const out = { version: RATING_VERSION, computedAt: Date.now(), rounds: rounds.length, established, drivers };
  await backend.content.save('ratings', out);
  await saveSeeds({ ...doc, lastRun: { at: Date.now(), rounds: rounds.length, established, average: avg, mean, maxRoundSum: Math.max(0, ...res.audit.map((a) => Math.abs(a.sum))) } });
  invalidate('mcsmRatings');
  return { rounds: rounds.length, established, average: avg, audit: res.audit };
}

export const publicRatings = () => cached('mcsmRatings', () => backend.content.get('ratings').then((d) => d || { drivers: {} }).catch(() => ({ drivers: {} })));
