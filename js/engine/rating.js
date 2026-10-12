// engine/rating.js
// MCSM Rating v3.2 (see MCSM_Rating_V3_2_Claude_Implementation_Spec.md).
//   Overall = 0.20 × Quali + 0.40 × Sprint + 0.40 × Gran'Prix   (public values)
// Each component is a latent skill x; the public value is d(x) = 50 + 12·softplus(0.8/12·(x−100) + b),
// so d(100) = 100, it never goes below 50 and has no upper cap. No forced mean, no penalties,
// no time gaps, no decay.
//   - Starting point: the V3.2 historical bootstrap (MCSM25–30), imported once, never re-fitted.
//   - Established drivers: chronological Elo, zero-sum among established drivers only, per session.
//   - Provisional drivers (fewer than 5 completed rounds): shadow placement. Their estimate is fitted
//     against opponents' frozen pre-round ratings; established drivers never gain or lose from them.
// Pure, deterministic: the same import and the same results always give the same ratings.

export const RATING_VERSION = '3.2';
export const RATING_CFG = {
  K: 10, eloScale: 6, gridSprint: 12, gridMain: 6, gridMaxAdj: 96,
  priorMean: 100, priorSd: 55, dnfFactor: 0.5, provisionalRounds: 5,
  wQ: 0.2, wS: 0.4, wG: 0.4, floor: 50, t: 12, slope: 0.8,
};
const C = RATING_CFG;
export const COMPONENTS = ['q', 's', 'g'];
const SESSION_OF = { Q: 'q', S: 's', GP: 'g' };

const B = Math.log(Math.expm1(C.floor / C.t));
const softplus = (z) => (z > 0 ? z + Math.log1p(Math.exp(-z)) : Math.log1p(Math.exp(z)));
export const publicOf = (x) => C.floor + C.t * softplus((C.slope / C.t) * (x - C.priorMean) + B);
export const overallOf = (lat) => C.wQ * publicOf(lat.q) + C.wS * publicOf(lat.s) + C.wG * publicOf(lat.g);
export const expected = (eloDiff) => 1 / (1 + Math.pow(10, -eloDiff / 400));
const A = Math.LN10 / 400;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const started = (st) => st === 'OK' || st === 'DNF' || st === 'DSQ';

// Valid classified participants of one session: Q = set a time; races = finished or DNF.
// DSQ, DNS and "no time" are unranked for the rating.
function sessionField(rows, S) {
  const ok = (r) => (S === 'Q' ? r.status === 'OK' : r.status === 'OK' || r.status === 'DNF');
  return (rows || []).filter((r) => ok(r) && r.pos > 0).map((r) => ({ id: r.id, pos: r.pos, dnf: r.status === 'DNF' }));
}

/**
 * start: { uid: { q, s, g, n, established } }  (bootstrap import, latent units; anyone else starts at 100)
 * rounds: chronological [{ key, label, results: {L: {Q, S, GP}}, grids: {L: {S: [uid], GP: [uid]}} }]
 * Returns { drivers: { uid: state }, audit: [...] }.
 */
export function computeRatings(rounds, start = {}) {
  const S = {};
  const get = (u) => {
    if (!S[u]) {
      const b = start[u];
      const lat = b ? { q: b.q, s: b.s, g: b.g } : { q: C.priorMean, s: C.priorMean, g: C.priorMean };
      S[u] = { lat, prior: { ...lat }, n: b ? b.n || 0 : 0, established: !!(b && b.established), imported: !!b, obs: { q: [], s: [], g: [] }, history: [], highest: null };
      if (S[u].established) S[u].highest = overallOf(lat);
    }
    return S[u];
  };
  Object.keys(start).sort(byKey).forEach(get);
  const audit = [];

  for (const rd of rounds) {
    const ids = new Set();
    Object.values(rd.results || {}).forEach((res) => Object.values(res).forEach((rows) => (rows || []).forEach((r) => ids.add(r.id))));
    const list = [...ids].sort(byKey); list.forEach(get);
    const pre = Object.fromEntries(list.map((u) => [u, { lat: { ...S[u].lat }, est: S[u].established, overall: overallOf(S[u].lat) }]));
    const delta = Object.fromEntries(list.map((u) => [u, { q: 0, s: 0, g: 0 }]));
    const roundObs = { q: [], s: [], g: [] };
    const startedRound = new Set(), rated = new Set();

    for (const L of Object.keys(rd.results || {}).sort()) {
      const res = rd.results[L] || {};
      for (const sess of ['Q', 'S', 'GP']) {
        const c = SESSION_OF[sess];
        if (sess !== 'Q') (res[sess] || []).forEach((r) => { if (started(r.status)) startedRound.add(r.id); });
        const field = sessionField(res[sess], sess);
        field.forEach((r) => rated.add(r.id));
        const N = field.length;
        if (N < 2) continue;
        const gridOrder = sess === 'Q' ? null : ((rd.grids && rd.grids[L] && rd.grids[L][sess]) || []);
        const gpos = gridOrder ? Object.fromEntries(gridOrder.map((u, i) => [u, i + 1])) : {};
        const coef = sess === 'S' ? C.gridSprint : sess === 'GP' ? C.gridMain : 0;
        const grid = (a, b) => (coef && gpos[a] && gpos[b] ? clamp(coef * (gpos[b] - gpos[a]), -C.gridMaxAdj, C.gridMaxAdj) : 0);
        const dnf = (r) => (r.dnf ? C.dnfFactor : 1);
        // established vs established: zero-sum transfers from pre-round ratings
        const est = field.filter((r) => pre[r.id].est);
        const Ne = est.length;
        if (Ne >= 2) {
          for (let i = 0; i < Ne; i++) for (let j = i + 1; j < Ne; j++) {
            const a = est[i], b = est[j];
            const y = a.pos < b.pos ? 1 : a.pos > b.pos ? 0 : 0.5;
            const E = expected(C.eloScale * (pre[a.id].lat[c] - pre[b.id].lat[c]) + grid(a.id, b.id));
            const T = (C.K / (Ne - 1)) * dnf(a) * dnf(b) * (y - E);
            delta[a.id][c] += T; delta[b.id][c] -= T;
          }
        }
        // provisional drivers: observations against everyone in the session
        for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
          const a = field[i], b = field[j];
          if (pre[a.id].est && pre[b.id].est) continue;
          const y = a.pos < b.pos ? 1 : a.pos > b.pos ? 0 : 0.5;
          const w = (1 / (N - 1)) * dnf(a) * dnf(b);
          const g = grid(a.id, b.id);
          if (!pre[a.id].est && pre[b.id].est) roundObs[c].push({ i: a.id, fixed: pre[b.id].lat[c], y, g, w });
          else if (pre[a.id].est && !pre[b.id].est) roundObs[c].push({ i: b.id, fixed: pre[a.id].lat[c], y: 1 - y, g: -g, w });
          else roundObs[c].push({ i: a.id, j: b.id, y, g, w });
        }
      }
    }

    for (const u of list) if (pre[u].est) COMPONENTS.forEach((c) => { S[u].lat[c] += delta[u][c]; });
    COMPONENTS.forEach((c) => roundObs[c].forEach((o) => { S[o.i].obs[c].push(o); if (o.j) S[o.j].obs[c].push(o); }));
    const prov = Object.keys(S).filter((u) => !S[u].established && COMPONENTS.some((c) => S[u].obs[c].length)).sort(byKey);
    COMPONENTS.forEach((c) => fitPlacement(S, prov, c));
    for (const u of list) {
      const st = S[u];
      if (startedRound.has(u)) st.n++;
      const after = overallOf(st.lat);
      if (rated.has(u) || startedRound.has(u)) st.history.push({ key: rd.key, label: rd.label, before: pre[u].overall, after, delta: after - pre[u].overall, q: publicOf(st.lat.q), s: publicOf(st.lat.s), g: publicOf(st.lat.g), provisional: !pre[u].est });
      if (!st.established && st.n >= C.provisionalRounds) { st.established = true; st.graduatedAt = rd.key; }
      if (st.established) st.highest = Math.max(st.highest || 0, after);
    }
    const est = list.filter((u) => pre[u].est);
    audit.push({ key: rd.key, drivers: list.length, zeroSum: COMPONENTS.map((c) => est.reduce((a, u) => a + delta[u][c], 0)) });
  }
  return { drivers: S, audit };
}

// Regularised Bradley–Terry fit over provisional drivers only (established values are constants).
// Prior: the driver's starting estimate (bootstrap value, or 100 for newcomers), SD 55.
function fitPlacement(S, prov, c) {
  if (!prov.length) return;
  const inv = 1 / (C.priorSd * C.priorSd);
  const k = C.eloScale * A;
  for (let sweep = 0; sweep < 300; sweep++) {
    let maxStep = 0;
    for (const u of prov) {
      let grad = (S[u].lat[c] - S[u].prior[c]) * inv, hess = inv;
      for (const o of S[u].obs[c]) {
        const xi = S[o.i].lat[c], xj = o.j ? S[o.j].lat[c] : o.fixed;
        const p = 1 / (1 + Math.exp(-A * (C.eloScale * (xi - xj) + o.g)));
        const r = o.w * (p - o.y) * k;
        grad += o.i === u ? r : -r;
        hess += o.w * p * (1 - p) * k * k;
      }
      const step = grad / hess;
      S[u].lat[c] -= step;
      maxStep = Math.max(maxStep, Math.abs(step));
    }
    if (maxStep < 1e-10) break;
  }
}

export const isEstablished = (st) => !!st && st.established;
