// engine/scoring.js
// MCSM scoring, standings and lobby logic. Pure functions, no DOM, no database:
// everything is computed from raw results so standings can never drift.
//
// Shapes:
//   round   = { lobbies: { A: [driverId...], B: [...], C: [...] },
//               results: { A: { Q: [row], S: [row], GP: [row] }, ... } }
//   row     = { id, pos, status: 'OK'|'DNF'|'DNS'|'DSQ'|'NT', best?: seconds, time?, gap? }
//   table   = { raceA: [16 numbers], dnf: {A,B,C}, quali: [16], fl: 3, lobbyStep: 100 }

export const DEFAULT_TABLE = {
  raceA: [315, 300, 290, 280, 270, 260, 250, 245, 240, 235, 230, 225, 220, 215, 210, 205],
  dnf: { A: 200, B: 100, C: 0 },
  quali: [23, 20, 18, 16, 14, 12, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1],
  fl: 3,
  lobbyStep: 100,
};
export const LOBBIES = ['A', 'B', 'C'];
const lobbyIndex = (L) => Math.max(0, LOBBIES.indexOf(L));

export function racePoints(table, lobby, pos) {
  const v = table.raceA[pos - 1];
  return v == null ? 0 : v - lobbyIndex(lobby) * table.lobbyStep;
}

export function sessionPoints(table, session, lobby, e) {
  if (!e || e.status === 'DNS' || e.status === 'DSQ') return 0;
  if (session === 'Q') return e.status === 'NT' ? 0 : (table.quali[e.pos - 1] || 0);
  if (e.status === 'DNF') return table.dnf[lobby] ?? 0;
  return racePoints(table, lobby, e.pos);
}

export function flHolder(rows) {
  let best = null;
  (rows || []).forEach((r) => { if (r.best != null && r.status !== 'DNS' && r.status !== 'DSQ' && (!best || r.best < best.best)) best = r; });
  return best ? best.id : null;
}

export function roundTotals(round, table = DEFAULT_TABLE) {
  const out = {};
  // Imported rounds from the old site only know each driver's round total.
  if (round && round.legacy) {
    round.legacy.forEach((r) => { out[r.id] = { id: r.id, lobby: null, q: 0, s: 0, gp: 0, fl: 0, total: r.points || 0, qPos: r.pos, sPos: r.pos, gpPos: r.pos, legacy: true }; });
    return out;
  }
  if (!round || !round.results) return out;
  for (const L of LOBBIES) {
    const res = round.results[L]; if (!res || !round.lobbies[L]) continue;
    const flS = flHolder(res.S), flGP = flHolder(res.GP);
    const find = (rows, id) => (rows || []).find((r) => r.id === id);
    for (const id of round.lobbies[L]) {
      const q = find(res.Q, id), s = find(res.S, id), g = find(res.GP, id);
      const qp = sessionPoints(table, 'Q', L, q), sp = sessionPoints(table, 'S', L, s), gp = sessionPoints(table, 'GP', L, g);
      const fl = (flS === id ? table.fl : 0) + (flGP === id ? table.fl : 0);
      out[id] = { id, lobby: L, q: qp, s: sp, gp, fl, total: qp + sp + gp + fl, qPos: q ? q.pos : 99, sPos: s ? s.pos : 99, gpPos: g ? g.pos : 99 };
    }
  }
  return out;
}

// Rank one lobby by round total; ties: qualifying result, then sprint result (Biblia).
export function lobbyRanking(round, L, table = DEFAULT_TABLE) {
  const tot = roundTotals(round, table);
  return round.lobbies[L].map((id) => tot[id]).filter(Boolean)
    .sort((a, b) => b.total - a.total || a.qPos - b.qPos || a.sPos - b.sPos).map((x) => x.id);
}

// Bottom n of A swap with top n of B, and the same between B and C.
// No-shows (optional set) rank last in their lobby, so they are the first to drop,
// and they are never promoted: the next driver who raced takes the place.
export function promoteRelegate(round, n = 2, table = DEFAULT_TABLE, noShows = null) {
  const absent = (id) => !!(noShows && noShows.has(id));
  const rank = (L) => { const r = lobbyRanking(round, L, table); return [...r.filter((id) => !absent(id)), ...r.filter(absent)]; };
  const A = rank('A'), B = rank('B'), C = rank('C');
  const upFrom = (list) => list.filter((id) => !absent(id)).slice(0, n);
  const upB = upFrom(B), upC = upFrom(C);
  const downA = A.slice(A.length - upB.length), restB = B.filter((id) => !upB.includes(id));
  const downB = restB.slice(restB.length - upC.length);
  return {
    A: [...A.slice(0, A.length - upB.length), ...upB],
    B: [...downA, ...restB.filter((id) => !downB.includes(id)), ...upC],
    C: [...downB, ...C.filter((id) => !upC.includes(id))],
  };
}

// Drivers' championship. ids: every driver to include; filter: optional (e.g. MGTK only),
// in which case wins/podiums are counted among the filtered drivers only.
export function driverStandings(rounds, ids, { table = DEFAULT_TABLE, filter = null } = {}) {
  const acc = {};
  ids.forEach((id) => { if (!filter || filter(id)) acc[id] = { id, total: 0, wins: 0, p2: 0, p3: 0, last: 0, per: [] }; });
  rounds.forEach((rd, ri) => {
    const tot = roundTotals(rd, table);
    if (rd.legacy) {
      const order = rd.legacy.filter((r) => r.status !== 'DNS' && acc[r.id]).sort((a, b) => a.pos - b.pos).map((r) => r.id);
      if (order[0]) acc[order[0]].wins++;
      if (order[1]) acc[order[1]].p2++;
      if (order[2]) acc[order[2]].p3++;
    }
    for (const L of LOBBIES) {
      const res = rd.results && rd.results[L]; if (!res) continue;
      for (const key of ['S', 'GP']) {
        const order = (res[key] || []).filter((r) => r.status === 'OK' && acc[r.id]).sort((a, b) => a.pos - b.pos).map((r) => r.id);
        if (order[0]) acc[order[0]].wins++;
        if (order[1]) acc[order[1]].p2++;
        if (order[2]) acc[order[2]].p3++;
      }
    }
    Object.values(acc).forEach((a) => { const r = tot[a.id]; const v = r ? r.total : 0; a.per[ri] = r || null; a.total += v; if (ri === rounds.length - 1) a.last = v; });
  });
  return Object.values(acc)
    .sort((a, b) => b.total - a.total || b.wins - a.wins || b.p2 - a.p2 || b.p3 - a.p3 || b.last - a.last)
    .map((a, i) => ({ ...a, pos: i + 1 }));
}

// Teams' championship: per round, the sum of the team's (at most two) best-scoring starters.
export function teamStandings(rounds, teams, { table = DEFAULT_TABLE } = {}) {
  const acc = Object.fromEntries(teams.map((tm) => [tm.id, { id: tm.id, total: 0, wins: 0, p2: 0, p3: 0, last: 0, per: [] }]));
  rounds.forEach((rd, ri) => {
    const tot = roundTotals(rd, table);
    const per = teams.map((tm) => ({ id: tm.id, v: tm.members.map((id) => (tot[id] ? tot[id].total : 0)).sort((a, b) => b - a).slice(0, 2).reduce((s, x) => s + x, 0) }))
      .sort((a, b) => b.v - a.v);
    per.forEach((x, i) => { const a = acc[x.id]; a.total += x.v; a.per[ri] = x.v; if (i === 0) a.wins++; if (i === 1) a.p2++; if (i === 2) a.p3++; if (ri === rounds.length - 1) a.last = x.v; });
  });
  return Object.values(acc)
    .sort((a, b) => b.total - a.total || b.wins - a.wins || b.p2 - a.p2 || b.p3 - a.p3 || b.last - a.last)
    .map((a, i) => ({ ...a, pos: i + 1 }));
}

// Gran'Prix grid: qualifying top 8 reversed, everyone else in qualifying order.
export function gpGrid(qRows) {
  const q = [...qRows].sort((a, b) => a.pos - b.pos).map((r) => r.id);
  return [...q.slice(0, 8).reverse(), ...q.slice(8)];
}

// Round-1 lobbies from PQ: seeded first (in the given order), then fastest PQ laps.
export function lobbiesFromPq(seededIds, pqTimes, size = 16) {
  const order = [...seededIds, ...[...pqTimes].sort((a, b) => a.t - b.t).map((p) => p.id)];
  return { A: order.slice(0, size), B: order.slice(size, size * 2), C: order.slice(size * 2) };
}
