// engine/rating.js
// MCSM Rating v1: a zero-sum, opponent-adjusted rating centred on 100.0.
//   MCSM Rating = 0.25 × Q (pace) + 0.65 × R (races) + 0.10 × D (discipline)
// Every round is replayed in order from the stored seeds, so the same seeds and results always
// give the same ratings (amended results are simply part of the next replay).
// Pure: no I/O. See RATING_CFG for every tunable constant.

export const RATING_VERSION = 1;
export const RATING_CFG = {
  base: 100, min: 50, max: 200,
  wQ: 0.25, wR: 0.65, wD: 0.10,
  kQ: 10, kRace: 12, sprintShare: 0.35, mainShare: 0.65,
  eloScale: 6,
  gapMin: 0.75, gapSpan: 0.50, gapSaturation: 0.006,
  gridSprint: 12, gridMain: 6, gridMaxAdj: 96,
  provisionalRounds: 5, capEstablished: 6, capProvisional: 12,
  penalty: 8, dnsPenalty: 8, dnfConfidence: 0.5, perfSensitivity: 60,
};
export const TIERS = [125, 110, 100, 90, 75];

const C = RATING_CFG;
export const overallOf = (s) => C.wQ * s.Q + C.wR * s.R + C.wD * s.D;
export const seedComponents = (seed) => { const qr = (seed - C.wD * 100) / (C.wQ + C.wR); return { Q: qr, R: qr, D: 100 }; };
export const expected = (eloDiff) => 1 / (1 + Math.pow(10, -eloDiff / 400));
export function provisionalMultiplier(done) { return done <= 1 ? 3 : done === 2 ? 2.5 : done === 3 ? 2 : done === 4 ? 1.5 : 1; }
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// Founding population: manual tiers (Unknown = 100) shifted so their average is exactly 100.
export function normaliseSeeds(tiers, founders) {
  const vals = founders.map((u) => Number(tiers[u]) || C.base);
  const mean = vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : C.base;
  const out = {}; founders.forEach((u, i) => { out[u] = vals[i] - (mean - C.base); });
  return { seeds: out, mean };
}

function median(xs) { const a = xs.slice().sort((x, y) => x - y); const m = a.length >> 1; return a.length ? (a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2) : null; }
const started = (st) => st === 'OK' || st === 'DNF' || st === 'DSQ';

// Head-to-head pairs for one session. Returns [{ win, lose, conf, eWin }].
function qualiPairs(rows, rating) {
  const field = rows.filter((r) => r.status === 'OK' || r.status === 'NT').sort((a, b) => (a.status === b.status ? a.pos - b.pos : a.status === 'OK' ? -1 : 1));
  const times = field.filter((r) => r.status === 'OK' && r.best > 0).map((r) => r.best);
  const med = median(times);
  const pairs = [];
  for (let i = 0; i < field.length; i++) for (let j = i + 1; j < field.length; j++) {
    const a = field[i], b = field[j];
    if (a.status === 'NT' && b.status === 'NT') continue;
    let conf = 1;
    if (med && a.best > 0 && b.best > 0 && a.status === 'OK' && b.status === 'OK') conf = C.gapMin + C.gapSpan * Math.min(Math.abs(b.best - a.best) / (C.gapSaturation * med), 1);
    const eWin = expected(C.eloScale * (rating(a.id) - rating(b.id)));
    pairs.push({ win: a.id, lose: b.id, conf, eWin });
  }
  return { pairs, n: field.length };
}
function racePairs(rows, rating, grid, gridCoef) {
  const field = rows.filter((r) => started(r.status));
  const order = { OK: 0, DNF: 1, DSQ: 2 };
  field.sort((a, b) => order[a.status] - order[b.status] || a.pos - b.pos);
  const g = (id) => (grid[id] != null ? grid[id] : 99);
  const pairs = [];
  for (let i = 0; i < field.length; i++) for (let j = i + 1; j < field.length; j++) {
    const a = field[i], b = field[j];
    if (a.status !== 'OK' && b.status !== 'OK') continue;             // DNF/DSQ vs DNF/DSQ: no reliable order
    const conf = a.status === 'OK' && b.status === 'OK' ? 1 : b.status === 'DNF' ? C.dnfConfidence : 1;
    const adj = clamp(gridCoef * (g(b.id) - g(a.id)), -C.gridMaxAdj, C.gridMaxAdj);
    const eWin = expected(C.eloScale * (rating(a.id) - rating(b.id)) + adj);
    pairs.push({ win: a.id, lose: b.id, conf, eWin });
  }
  return { pairs, n: field.length };
}

/**
 * rounds: chronological [{ key, label, lobbies: {L: [uid]}, results: {L: {Q, S, GP}}, penalties: [{uid, L}],
 *          excused: Set|Array of uid, gpGrid: {L: [uid in grid order]} }]
 * seeds:  { uid: normalised seed } (anyone else starts at 100)
 * Returns { drivers: { uid: state }, rounds: [{ key, sums, applied }] } with full precision.
 */
export function computeRatings(rounds, seeds = {}) {
  const S = {};
  const get = (u) => {
    if (!S[u]) { const c = seedComponents(seeds[u] != null ? seeds[u] : C.base); S[u] = { ...c, seed: seeds[u] != null ? seeds[u] : C.base, done: 0, history: [], rel: { fin: 0, dnf: 0, dns: 0, dsq: 0 }, highest: null }; }
    return S[u];
  };
  Object.keys(seeds).sort(byKey).forEach(get);
  const audit = [];

  for (const rd of rounds) {
    const excused = new Set(rd.excused || []);
    const involved = new Set();
    Object.values(rd.lobbies || {}).forEach((l) => l.forEach((u) => involved.add(u)));
    Object.values(rd.results || {}).forEach((res) => Object.values(res).forEach((rows) => (rows || []).forEach((r) => involved.add(r.id))));
    const ids = [...involved].sort(byKey);
    ids.forEach(get);
    const pre = Object.fromEntries(ids.map((u) => [u, { Q: S[u].Q, R: S[u].R, D: S[u].D, done: S[u].done }]));
    const mult = (u) => provisionalMultiplier(pre[u].done);
    const transfers = [];            // { c: 'Q'|'R'|'D', to, from, amt }
    const U = {};                    // round-performance surprise sums per driver and session
    const addU = (u, k, v) => { (U[u] = U[u] || { q: 0, s: 0, m: 0, nq: 0, ns: 0, nm: 0 })[k] += v; };
    const pen = {};                  // event penalty points
    const expPos = {};               // expected main-race finishing position
    const startedRound = new Set();

    for (const L of Object.keys(rd.results || {}).sort()) {
      const res = rd.results[L] || {};
      const qRows = res.Q || [], sRows = res.S || [], gRows = res.GP || [];
      // qualifying
      const q = qualiPairs(qRows, (u) => pre[u].Q);
      for (const p of q.pairs) {
        const pm = (mult(p.win) + mult(p.lose)) / 2;
        const amt = (C.kQ / (q.n - 1)) * pm * p.conf * (1 - p.eWin);
        transfers.push({ c: 'Q', to: p.win, from: p.lose, amt });
        addU(p.win, 'q', p.conf * (1 - p.eWin)); addU(p.lose, 'q', -p.conf * (1 - p.eWin));
      }
      q.n > 1 && qRows.forEach((r) => { if (r.status === 'OK' || r.status === 'NT') addU(r.id, 'nq', q.n - 1); });
      // grids: sprint = qualifying order, Gran'Prix = stored grid (top 8 reversed)
      const qOrder = qRows.filter((r) => r.status === 'OK' || r.status === 'NT').sort((a, b) => a.pos - b.pos).map((r) => r.id);
      const sGrid = Object.fromEntries(qOrder.map((u, i) => [u, i + 1]));
      const gGrid = Object.fromEntries(((rd.gpGrid && rd.gpGrid[L]) || qOrder).map((u, i) => [u, i + 1]));
      for (const [rows, grid, coef, k, key] of [[sRows, sGrid, C.gridSprint, C.kRace * C.sprintShare, 's'], [gRows, gGrid, C.gridMain, C.kRace * C.mainShare, 'm']]) {
        const r = racePairs(rows, (u) => pre[u].R, grid, coef);
        for (const p of r.pairs) {
          const pm = (mult(p.win) + mult(p.lose)) / 2;
          transfers.push({ c: 'R', to: p.win, from: p.lose, amt: (k / (r.n - 1)) * pm * p.conf * (1 - p.eWin) });
          addU(p.win, key, p.conf * (1 - p.eWin)); addU(p.lose, key, -p.conf * (1 - p.eWin));
          if (key === 'm') { expPos[p.win] = (expPos[p.win] || 1) + (1 - p.eWin); expPos[p.lose] = (expPos[p.lose] || 1) + p.eWin; }
        }
        rows.forEach((x) => { if (started(x.status)) { startedRound.add(x.id); if (r.n > 1) addU(x.id, key === 's' ? 'ns' : 'nm', r.n - 1); } });
      }
      // discipline: confirmed penalties and unexcused no-shows; the others in the lobby share it
      const members = [...new Set([...(rd.lobbies[L] || []), ...qRows.map((r) => r.id), ...sRows.map((r) => r.id), ...gRows.map((r) => r.id)])].sort(byKey);
      const charge = (u, pts) => {
        pen[u] = (pen[u] || 0) + pts;
        const others = members.filter((x) => x !== u && !excused.has(x));
        if (!others.length) return;
        others.forEach((o) => transfers.push({ c: 'D', to: o, from: u, amt: (C.penalty * pts) / others.length }));
      };
      (rd.penalties || []).filter((p) => p.L === L).sort((a, b) => byKey(a.uid, b.uid)).forEach((p) => charge(p.uid, p.severity || 1));
      for (const u of members) {
        if (excused.has(u)) continue;
        const st = (rows) => ((rows.find((x) => x.id === u) || { status: 'DNS' }).status);
        const s1 = st(sRows), s2 = st(gRows);
        const count = (s) => { const R = S[u].rel; if (s === 'OK') R.fin++; else if (s === 'DNF') R.dnf++; else if (s === 'DSQ') R.dsq++; else R.dns++; };
        if (sRows.length) count(s1); if (gRows.length) count(s2);
        if ((sRows.length || gRows.length) && !started(s1) && !started(s2)) charge(u, C.dnsPenalty / C.penalty);
      }
    }

    // apply: bounded, balanced, in a fixed order (Q, R, D as generated)
    const delta = Object.fromEntries(ids.map((u) => [u, 0]));
    const cap = (u) => (pre[u].done < C.provisionalRounds ? C.capProvisional : C.capEstablished);
    const w = { Q: C.wQ, R: C.wR, D: C.wD };
    let proposed = 0, applied = 0;
    for (const tr of transfers) {
      if (!(tr.amt > 0)) continue;
      const gain = w[tr.c] * tr.amt;
      const roomTo = Math.min(cap(tr.to) - delta[tr.to], C.max - overallOf(S[tr.to]));
      const roomFrom = Math.min(cap(tr.from) + delta[tr.from], overallOf(S[tr.from]) - C.min);
      const f = Math.max(0, Math.min(1, roomTo / gain, roomFrom / gain));
      const amt = tr.amt * f;
      S[tr.to][tr.c] += amt; S[tr.from][tr.c] -= amt;
      delta[tr.to] += w[tr.c] * amt; delta[tr.from] -= w[tr.c] * amt;
      proposed += tr.amt; applied += amt;
    }

    // per-driver results of the round
    for (const u of ids) {
      const st = S[u], before = pre[u];
      const beforeOverall = overallOf(before), afterOverall = overallOf(st);
      if (startedRound.has(u)) st.done++;
      const perf = roundPerformance(before, U[u], pen[u] || 0);
      const took = startedRound.has(u) || (pen[u] || 0) > 0;
      if (took) {
        st.history.push({ key: rd.key, label: rd.label, before: beforeOverall, after: afterOverall, delta: afterOverall - beforeOverall, q: st.Q, r: st.R, d: st.D, perf, expMain: expPos[u] != null ? expPos[u] : null, provisional: before.done < C.provisionalRounds });
        if (st.done >= C.provisionalRounds) st.highest = Math.max(st.highest || 0, afterOverall);
      }
    }
    audit.push({ key: rd.key, transfers: transfers.length, proposed, applied, sum: ids.reduce((a, u) => a + (overallOf(S[u]) - overallOf(pre[u])), 0) });
  }
  return { drivers: S, audit };
}

// Round Performance: how this round went against pre-round expectations (descriptive only).
export function roundPerformance(before, u, penaltyPoints) {
  const k = C.perfSensitivity;
  const sess = (sum, n) => (n ? sum / n : 0);
  // each session's surprise is averaged over its N − 1 opponents
  const uq = u ? sess(u.q, u.nq) : 0, us = u ? sess(u.s, u.ns) : 0, um = u ? sess(u.m, u.nm) : 0;
  const pace = before.Q + k * uq;
  const race = before.R + k * (C.sprintShare * us + C.mainShare * um);
  const disc = Math.max(20, 100 - 25 * penaltyPoints);
  return C.wQ * pace + C.wR * race + C.wD * disc;
}

export function reliabilityOf(rel) {
  const total = rel.fin + rel.dnf + rel.dns + rel.dsq;
  return total ? (100 * (rel.fin + 0.5 * rel.dnf)) / total : null;
}
export const isEstablished = (st) => !!st && st.done >= C.provisionalRounds;
