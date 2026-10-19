// engine/rating.js
// MCSM Rating v3.2: result-only, normalised cross-lobby Elo updates.
//   Overall = 0.20 x Quali + 0.40 x Sprint + 0.40 x Grand Prix (public values).
// Each component is a latent skill x; the public value is d(x) = 50 + 12*softplus(0.8/12*(x-100) + b),
// so d(100) = 100, it never goes below 50 and has no upper cap. No forced mean or other bonuses.
//   - Starting point: the imported MCSM25-30 historical bootstrap, never re-fitted.
//   - Established drivers: chronological Elo per session (zero-sum when only established drivers race).
//   - Compare classified results across all lobbies, using A16=B1 and B16=C1.
//   - Provisional drivers (fewer than 3 completed rounds): per-round performance estimates, used as
//     opponents in that round; their starting rating is the mean of their 3 calibration rounds.
// Pure, deterministic: the same import and the same results always give the same ratings.
export const RATING_VERSION = '3.3';
export const RATING_CFG = {
  K: 10, eloScale: 6,
  priorMean: 100, priorSd: 55, provisionalRounds: 3,
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
const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
const started = (st) => st === 'OK' || st === 'DNF' || st === 'DSQ';

// The committee's position hierarchy is independent of the number of entrants or the
// number of lobbies present in a particular round. A16 equals B1; B16 equals C1.
const LOBBY_SIZE = 16;
const LOBBY_STRIDE = LOBBY_SIZE - 1;
function globalPosition(lobby, pos) {
  if (!/^[A-Z]$/.test(lobby)) throw new Error(`Unsupported rating lobby: ${lobby}`);
  const rank = Number(pos);
  if (!Number.isInteger(rank) || rank < 1) throw new Error(`Invalid rating position in lobby ${lobby}: ${pos}`);
  // Lobbies are normally 16; a bigger one keeps counting on (A17 sits just behind B1) instead of failing.
  return (lobby.charCodeAt(0) - 65) * LOBBY_STRIDE + rank;
}

// Official ranked positions only. No qualifying gaps, grid, overtaking or discipline modifiers.
// DNFs in a race all share their lobby's last place (16th, or behind the last finisher in a bigger
// lobby): they lose to every finisher, draw with each other (they all get the same DNF points) and tie
// with the next lobby's winner (A16 = B1). Entry order doesn't matter. Unranked qualifying attempts,
// DNS and DSQ do not provide a comparable finishing position.
function sessionField(rows, session, lobby) {
  const ranked = (r) => session === 'Q' ? r.status === 'OK' : r.status === 'OK' || r.status === 'DNF';
  const field = (rows || []).filter((r) => ranked(r) && r.pos > 0);
  const lastFinisher = Math.max(0, ...field.filter((r) => r.status === 'OK').map((r) => r.pos));
  const dnfRank = session === 'Q' ? Infinity : Math.max(LOBBY_SIZE, lastFinisher + 1);
  return field.map((r) => ({
    id: r.id, pos: globalPosition(lobby, r.status === 'DNF' && dnfRank !== Infinity ? dnfRank : r.pos),
  }));
}

// Inverse of publicOf (public value -> latent). Values at or below the floor map to the floor's limit.
export const latentOf = (y) => {
  const v = Math.max(C.floor + 1e-9, y);
  const z = Math.log(Math.expm1((v - C.floor) / C.t));
  return C.priorMean + ((z - B) * C.t) / C.slope;
};

/**
 * Calibration (provisional drivers, fewer than 3 completed rounds):
 *  - Each round, every provisional driver gets a ROUND PERFORMANCE estimate from that round's
 *    results only (regularised Bradley–Terry against established drivers' frozen pre-round ratings
 *    and the other provisional drivers; prior 100, SD 55). It is never seeded from earlier rounds.
 *  - Established drivers' Elo that round compares them with provisional drivers' round performance,
 *    normalised over the full eligible field (N − 1). Provisional drivers get no Elo deltas.
 *  - The hidden running estimate is the arithmetic mean of the PUBLIC component performances over
 *    the completed calibration rounds (imported provisional history counts as its own weight).
 *  - After the 3rd completed round that mean becomes the official starting rating (converted back to
 *    latent with latentOf); no Elo delta for that round, no published change. Normal Elo from round 4.
 *
 * start: { uid: { q, s, g, n, established } } (imported latent units; others start at 100).
 * rounds: chronological [{ key, label, results: { L: { Q, S, GP } } }].
 * Returns { drivers: { uid: state }, audit: [...] }.
 */
export function computeRatings(rounds, start = {}) {
  const S = {};
  const get = (u) => {
    if (!S[u]) {
      const b = start[u];
      const lat = b ? { q: b.q, s: b.s, g: b.g } : { q: C.priorMean, s: C.priorMean, g: C.priorMean };
      const n = b ? b.n || 0 : 0;
      // imported drivers with enough history are established from the start (3-round rule)
      const established = !!(b && (b.established || n >= C.provisionalRounds));
      // calibration sums in PUBLIC units; imported provisional history weighted by its rounds
      const cal = Object.fromEntries(COMPONENTS.map((c) => [c, b && !established && n > 0 ? { sum: publicOf(lat[c]) * n, cnt: n } : { sum: 0, cnt: 0 }]));
      S[u] = { lat, prior: { ...lat }, n, established, imported: !!b, cal, perfs: [], history: [], highest: established ? overallOf(lat) : null };
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
    const perf = {};   // this round's latent performance per provisional driver and component
    const startedRound = new Set(), rated = new Set();
    const lobbies = Object.keys(rd.results || {}).sort(byKey);
    for (const L of lobbies) {
      const res = rd.results[L] || {};
      for (const sess of ['S', 'GP']) (res[sess] || []).forEach((r) => { if (started(r.status)) startedRound.add(r.id); });
    }
    // Pool every lobby within each session BEFORE calculating pairwise outcomes.
    for (const sess of ['Q', 'S', 'GP']) {
      const c = SESSION_OF[sess];
      const field = lobbies.flatMap((L) => sessionField((rd.results[L] || {})[sess], sess, L));
      field.forEach((r) => rated.add(r.id));
      const N = field.length;
      if (N < 2) continue;
      if (new Set(field.map((r) => r.id)).size !== N) throw new Error(`Duplicate driver in ${rd.key} ${sess} rating results`);
      const w = 1 / (N - 1);
      // 1) provisional round performance from this round's results only
      const prov = field.filter((r) => !pre[r.id].est).map((r) => r.id).sort(byKey);
      if (prov.length) {
        const obs = [];
        for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
          const a = field[i], b = field[j];
          if (pre[a.id].est && pre[b.id].est) continue;
          const y = a.pos < b.pos ? 1 : a.pos > b.pos ? 0 : 0.5;
          if (!pre[a.id].est && pre[b.id].est) obs.push({ i: a.id, fixed: pre[b.id].lat[c], y, w });
          else if (pre[a.id].est && !pre[b.id].est) obs.push({ i: b.id, fixed: pre[a.id].lat[c], y: 1 - y, w });
          else obs.push({ i: a.id, j: b.id, y, w });
        }
        const est = fitRound(prov, obs);
        prov.forEach((u) => { (perf[u] = perf[u] || {})[c] = est[u]; });
      }
      // 2) established Elo over the full eligible field (provisional opponents at their round performance)
      const ratingOf = (r) => (pre[r.id].est ? pre[r.id].lat[c] : perf[r.id][c]);
      for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
        const a = field[i], b = field[j];
        const ea = pre[a.id].est, eb = pre[b.id].est;
        if (!ea && !eb) continue;
        const y = a.pos < b.pos ? 1 : a.pos > b.pos ? 0 : 0.5;
        const T = (C.K / (N - 1)) * (y - expected(C.eloScale * (ratingOf(a) - ratingOf(b))));
        if (ea) delta[a.id][c] += T;
        if (eb) delta[b.id][c] -= T;
      }
    }
    for (const u of list) if (pre[u].est) COMPONENTS.forEach((c) => { S[u].lat[c] += delta[u][c]; });
    for (const u of list) {
      const st = S[u];
      const completed = startedRound.has(u);
      if (completed) st.n++;
      let graduation = false;
      if (!pre[u].est) {
        // calibration: completed rounds add their public component performances to the mean
        if (completed && perf[u]) {
          COMPONENTS.forEach((c) => { if (perf[u][c] != null) { st.cal[c].sum += publicOf(perf[u][c]); st.cal[c].cnt++; } });
          st.perfs.push({ key: rd.key, ...Object.fromEntries(COMPONENTS.map((c) => [c, perf[u][c] != null ? publicOf(perf[u][c]) : null])) });
        }
        const mean = (c) => (st.cal[c].cnt ? st.cal[c].sum / st.cal[c].cnt : publicOf(C.priorMean));
        st.lat = Object.fromEntries(COMPONENTS.map((c) => [c, latentOf(mean(c))]));
        if (st.n >= C.provisionalRounds) { st.established = true; st.graduatedAt = rd.key; graduation = true; }
      }
      const after = overallOf(st.lat);
      if (rated.has(u) || completed) st.history.push({ key: rd.key, label: rd.label, before: pre[u].overall, after, delta: pre[u].est ? after - pre[u].overall : null,
        q: publicOf(st.lat.q), s: publicOf(st.lat.s), g: publicOf(st.lat.g), provisional: !pre[u].est, graduation });
      if (st.established) st.highest = graduation ? after : Math.max(st.highest || 0, after);
    }
    const estList = list.filter((u) => pre[u].est);
    audit.push({ key: rd.key, drivers: list.length, zeroSum: COMPONENTS.map((c) => estList.reduce((a, u) => a + delta[u][c], 0)), perf, delta, pre });
  }
  return { drivers: S, audit };
}

// One round's regularised Bradley–Terry fit over the provisional drivers in a session
// (established values are constants). Prior: neutral 100, SD 55. Deterministic.
function fitRound(prov, obs) {
  const x = Object.fromEntries(prov.map((u) => [u, C.priorMean]));
  const inv = 1 / (C.priorSd * C.priorSd);
  const k = C.eloScale * A;
  const by = Object.fromEntries(prov.map((u) => [u, []]));
  obs.forEach((o) => { by[o.i].push(o); if (o.j) by[o.j].push(o); });
  for (let sweep = 0; sweep < 300; sweep++) {
    let maxStep = 0;
    for (const u of prov) {
      let grad = (x[u] - C.priorMean) * inv, hess = inv;
      for (const o of by[u]) {
        const xi = x[o.i], xj = o.j ? x[o.j] : o.fixed;
        const p = 1 / (1 + Math.exp(-k * (xi - xj)));
        const r = o.w * (p - o.y) * k;
        grad += o.i === u ? r : -r;
        hess += o.w * p * (1 - p) * k * k;
      }
      const step = grad / hess;
      x[u] -= step;
      maxStep = Math.max(maxStep, Math.abs(step));
    }
    if (maxStep < 1e-10) break;
  }
  return x;
}

// What drivers may see (content/ratings): established drivers' numbers and history from their
// official start; provisional drivers only their round count. The first published rating has no
// change (dl: null) and nothing from calibration is exposed.
export function publicEntry(st, { baseline = null } = {}) {
  if (!st.established) return { e: 0, n: st.n };
  const f3 = (v) => +v.toFixed(3);
  const last = st.history[st.history.length - 1];
  const pts = st.history.filter((x) => !x.provisional || x.graduation).map((x) => ({ l: x.label, r: f3(x.after), q: f3(x.q), s: f3(x.s), g: f3(x.g) }));
  return {
    e: 1, r: overallOf(st.lat), q: publicOf(st.lat.q), s: publicOf(st.lat.s), g: publicOf(st.lat.g), n: st.n, hi: st.highest,
    dl: last && !last.provisional && !last.graduation && last.delta != null ? last.delta : null,
    h: [...(baseline ? [baseline] : []), ...pts],
  };
}

// Drivers who have just become ranked: unranked (or absent) in the previously published ratings, ranked
// now, and ranked through calibration (not the historical import). Nothing on the very first publish.
// Returns [{ uid, rank, total, r, q, s, g, label }] with their position among all ranked drivers.
export function newlyRanked(prevDrivers, nextDrivers, states) {
  if (!prevDrivers) return [];
  const ranked = Object.entries(nextDrivers).filter(([, x]) => x && x.e).sort((a, b) => b[1].r - a[1].r || (a[0] < b[0] ? -1 : 1));
  const total = ranked.length;
  return ranked.map(([uid, x], i) => ({ uid, x, rank: i + 1 }))
    .filter(({ uid }) => !(prevDrivers[uid] && prevDrivers[uid].e) && states[uid] && states[uid].graduatedAt)
    .map(({ uid, x, rank }) => {
      const grad = (states[uid].history || []).find((hh) => hh.graduation);
      return { uid, rank, total, r: x.r, q: x.q, s: x.s, g: x.g, label: grad ? grad.label : null };
    });
}

export const isEstablished = (st) => !!st && st.established;
