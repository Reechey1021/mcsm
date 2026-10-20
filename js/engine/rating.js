// engine/rating.js
// MCSM Rating V2.0: position-based, rolling 10 race nights. Pure and deterministic (no Firebase).
//
//   - Every finishing position has a fixed value by lobby: A 150..120, B 120..90, C 90..60 (−2 per place),
//     whatever the number of starters. A DNF counts as the lobby's 16th place.
//   - A driver's last 10 race nights count. A race night is any round with a result in it (also DSQ or
//     no qualifying time); a round they didn't start (DNS) doesn't count and changes nothing.
//   - Qualifying, Sprint and Gran'Prix are averaged separately over those nights (DNS, DSQ and no time
//     add nothing to the average), then combined: 20% Q + 40% Sprint + 40% GP.
//   - Calibration: the rating is shown from the 3rd race night (MCSM25–30 history included).
//   - MCSM25–30 come from the V2.0 calibration history (blank = no result); live from MCSM31.
export const RATING_VERSION = '2.0';
export const RATING_CFG = { window: 10, provisionalRounds: 3, wQ: 0.2, wS: 0.4, wG: 0.4, lobbySize: 16, top: 150, lobbyStep: 30, placeStep: 2, floor: 50 };
const C = RATING_CFG;
export const COMPONENTS = ['q', 's', 'g'];
const SESSIONS = [['Q', 'q'], ['S', 's'], ['GP', 'g']];
const byKey = (a, b) => (a < b ? -1 : a > b ? 1 : 0);

// The value of a finishing position: A1 150, A16 120, B1 120, B16 90, C1 90, C16 60.
export function positionValue(lobby, pos) {
  const li = Math.max(0, String(lobby || 'A').toUpperCase().charCodeAt(0) - 65);
  const p = Math.min(Math.max(1, Number(pos) || C.lobbySize), C.lobbySize);
  return Math.max(C.floor, C.top - li * C.lobbyStep - (p - 1) * C.placeStep);
}
export const overallOf = (v) => C.wQ * v.q + C.wS * v.s + C.wG * v.g;
// V2.0 values are already the displayed values (kept for older callers).
export const publicOf = (x) => x;

// One session row -> its value, or null if it adds nothing to the average.
function sessionValue(lobby, sess, row) {
  if (!row) return null;
  if (row.status === 'OK' && row.pos > 0) return positionValue(lobby, row.pos);
  if (row.status === 'DNF' && sess !== 'Q') return positionValue(lobby, C.lobbySize);
  return null;                                   // DNS, DSQ, no time
}
// A live round for one driver -> a race-night entry, or null if they didn't start anything.
export function roundEntry(rd, uid) {
  for (const L of Object.keys(rd.results || {}).sort(byKey)) {
    const res = rd.results[L] || {};
    const rows = Object.fromEntries(SESSIONS.map(([S]) => [S, (res[S] || []).find((r) => r.id === uid) || null]));
    if (!Object.values(rows).some(Boolean)) continue;
    if (!Object.values(rows).some((r) => r && r.status !== 'DNS')) return null;
    const e = { key: rd.key, label: rd.label, lobby: L };
    SESSIONS.forEach(([S, c]) => { e[c] = sessionValue(L, S, rows[S]); });
    return e;
  }
  return null;
}
// MCSM25–30 rows ([season, round, lobby, psn, q, s, gp, ...], positions or null) -> race-night entries.
export function historyEntries(rows) {
  return rows.filter((r) => [r[4], r[5], r[6]].some((p) => Number.isInteger(p)))
    .slice().sort((a, b) => a[0] - b[0] || a[1] - b[1])
    .map((r) => ({ key: `h${r[0]}-${r[1]}`, label: `MCSM${r[0]} / ${r[1]}`, lobby: r[2],
      q: Number.isInteger(r[4]) ? positionValue(r[2], r[4]) : null, s: Number.isInteger(r[5]) ? positionValue(r[2], r[5]) : null, g: Number.isInteger(r[6]) ? positionValue(r[2], r[6]) : null }));
}
// The rating from the last 10 race nights (null if a component has no result in them).
export function summarize(entries) {
  const win = entries.slice(-C.window);
  const avg = (c) => { const v = win.map((e) => e[c]).filter((x) => x != null); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; };
  const q = avg('q'), s = avg('s'), g = avg('g');
  return { q, s, g, r: q != null && s != null && g != null ? overallOf({ q, s, g }) : null };
}

/**
 * start: { uid: { hist: [race-night entries] } } (MCSM25–30, oldest first).
 * rounds: chronological final rounds [{ key, label, results: { L: { Q, S, GP } } }].
 * Returns { drivers: { uid: state }, audit }.
 */
export function computeRatings(rounds, start = {}) {
  const S = {};
  const get = (u) => {
    if (!S[u]) {
      const entries = ((start[u] && start[u].hist) || []).slice();
      const cur = summarize(entries);
      const established = entries.length >= C.provisionalRounds && cur.r != null;
      S[u] = { entries, n: entries.length, cur, established, imported: entries.length > 0, prior: established ? { ...cur } : null, history: [], highest: established ? cur.r : null };
    }
    return S[u];
  };
  Object.keys(start).sort(byKey).forEach(get);
  const audit = [];
  for (const rd of rounds) {
    const ids = new Set();
    Object.values(rd.results || {}).forEach((res) => Object.values(res).forEach((rows) => (rows || []).forEach((r) => ids.add(r.id))));
    let counted = 0;
    for (const u of [...ids].sort(byKey)) {
      const e = roundEntry(rd, u);
      if (!e) continue;                          // didn't start: nothing changes
      const st = get(u);
      const wasEst = st.established, before = wasEst ? st.cur.r : null;
      st.entries.push(e); st.n++; counted++;
      const sm = summarize(st.entries);
      if (sm.r != null || !wasEst) st.cur = sm;  // a ranked driver keeps his rating if a component has no result left in his window
      let graduation = false;
      if (!st.established && st.n >= C.provisionalRounds && st.cur.r != null) { st.established = true; st.graduatedAt = rd.key; graduation = true; }
      const after = st.cur.r;
      st.history.push({ key: rd.key, label: rd.label, before, after, delta: wasEst && after != null && before != null ? after - before : null,
        q: st.cur.q, s: st.cur.s, g: st.cur.g, provisional: !wasEst, graduation });
      if (st.established && after != null) st.highest = graduation ? after : Math.max(st.highest || 0, after);
    }
    audit.push({ key: rd.key, drivers: counted });
  }
  return { drivers: S, audit };
}

// What drivers may see (content/ratings): ranked drivers' values and history from their first rating;
// unranked drivers only their round count. The first published rating has no change (dl: null).
export function publicEntry(st, { baseline = null } = {}) {
  if (!st.established || st.cur.r == null) return { e: 0, n: st.n };
  const f3 = (v) => (v == null ? null : +v.toFixed(3));
  const last = st.history[st.history.length - 1];
  const pts = st.history.filter((x) => (!x.provisional || x.graduation) && x.after != null).map((x) => ({ l: x.label, r: f3(x.after), q: f3(x.q), s: f3(x.s), g: f3(x.g) }));
  return {
    e: 1, r: st.cur.r, q: st.cur.q, s: st.cur.s, g: st.cur.g, n: st.n, hi: st.highest,
    dl: last && !last.provisional && !last.graduation && last.delta != null ? last.delta : null,
    h: [...(baseline ? [baseline] : []), ...pts],
  };
}

// Drivers who have just become ranked: unranked (or absent) in the previously published ratings, ranked
// now, through their race nights since MCSM31 (not straight from the history). Never on the first publish.
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
