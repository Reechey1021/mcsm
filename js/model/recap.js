// model/recap.js
// The round recap a driver sees when a round's results are final ("Eredményeid"), built from the
// race data (ctx) and the published ratings (P). Pure: the same function writes the note at publish
// time and rebuilds it for the "Összefoglaló" (replay) button on the round page.
//   mode 'rated'   – ranked before this round: rating before → after, change, "Új csúcs!"
//   mode 'ranked'  – became ranked with this round: first rating, no change, "#rank of total"
//   mode 'calib'   – still calibrating: progress (done / 3), no numbers
//   mode 'results' – no rating information for this round: places and championship only
import { driverStandings, teamStandings } from '../engine/scoring.js';

const keyOf = (l) => { const m = /MCSM(\d+)\s*\/\s*(\d+)/.exec(String(l)); return m ? +m[1] * 1000 + +m[2] : /MCSM25/.test(String(l)) ? 0 : null; };
const pts = (x) => (x && x.h ? x.h.map((e) => (Array.isArray(e) ? { l: e[0], r: e[1] } : e)) : []);
const started = (st) => st === 'OK' || st === 'DNF' || st === 'DSQ';

// One session's result for a driver: { pos } or { st: 'DNF' | 'DNS' | 'DSQ' | 'NT' } or null.
function sessionResult(rows, uid) {
  const r = (rows || []).find((x) => x.id === uid);
  if (!r) return null;
  return r.status === 'OK' ? { pos: r.pos } : { st: r.status };
}

export function buildRecap(ctx, n, uid, P, { calibRounds = 3 } = {}) {
  const idx = ctx.built.findIndex((r) => r.n === n);
  const rd = ctx.built[idx];
  if (!rd || rd.legacy) return null;
  const L = Object.keys(rd.results || {}).find((k) => Object.values(rd.results[k] || {}).some((rows) => (rows || []).some((r) => r.id === uid)));
  if (!L) return null;
  const res = rd.results[L];
  const cards = { q: sessionResult(res.Q, uid), s: sessionResult(res.S, uid), g: sessionResult(res.GP, uid) };
  const raced = ['S', 'GP'].some((S) => (res[S] || []).some((r) => r.id === uid && started(r.status)));
  if (!raced && !(cards.q && cards.q.pos)) return null;   // didn't take part
  // championship: position after this round vs after the previous one
  const pos = (upTo) => { const ds = driverStandings(ctx.built.slice(0, upTo), ctx.ids, { table: ctx.points }); const i = ds.findIndex((r) => r.id === uid); return i < 0 ? null : i + 1; };
  const champ = { now: pos(idx + 1), prev: idx > 0 ? pos(idx) : null };
  const base = { sid: ctx.season.id, no: ctx.season.no, n, lobby: L, cards, champ, at: Date.now() };
  const lastN = Math.max(0, ...((ctx.season.rounds || []).map((r) => r.n)));
  if (lastN && n === lastN) base.finale = seasonFinale(ctx, idx, uid, P, calibRounds);
  const x = (P && P.drivers || {})[uid];
  const label = `MCSM${ctx.season.no} / ${n}`;
  if (x && x.e) {
    const hist = pts(x);
    const i = hist.findIndex((e) => e.l === label);
    if (i > 0) {
      const before = hist[i - 1].r, after = hist[i].r;
      const high = after > Math.max(...hist.slice(0, i).map((e) => e.r)) + 1e-9;
      return { ...base, mode: 'rated', before, after, delta: after - before, high };
    }
    if (i === 0) {
      // first ever rating: rank among everyone ranked at that point
      const k = keyOf(label);
      const at = Object.values(P.drivers).map((d) => { if (!d || !d.e) return null; let best = null; pts(d).forEach((e) => { const kk = keyOf(e.l); if (kk != null && kk <= k && (!best || kk >= best.k)) best = { k: kk, r: e.r }; }); return best ? best.r : null; }).filter((v) => v != null);
      const rank = at.filter((v) => v > hist[0].r + 1e-9).length + 1;
      return { ...base, mode: 'ranked', after: hist[0].r, rank, total: at.length };
    }
    return { ...base, mode: 'results' };
  }
  if (x && !x.e) {
    // completed rounds as of this round (published n is today's count; later rounds this season removed)
    const later = ctx.built.filter((r) => r.n > n && Object.values(r.results || {}).some((rs) => ['S', 'GP'].some((S) => (rs[S] || []).some((row) => row.id === uid && started(row.status))))).length;
    const done = Math.max(0, Math.min(calibRounds - 1, (x.n || 0) - later));
    return { ...base, mode: 'calib', done, total: calibRounds };
  }
  return { ...base, mode: 'results' };
}

// The season's final picture for one driver (shown after the last round's recap):
// final place, points, wins and podiums, MCSM Rating over the season, team and MGTK places.
function seasonFinale(ctx, idx, uid, P, calibRounds) {
  const upTo = ctx.built.slice(0, idx + 1);
  const ds = driverStandings(upTo, ctx.ids, { table: ctx.points });
  const i = ds.findIndex((r) => r.id === uid);
  if (i < 0) return null;
  const me = ds[i];
  const out = { pos: i + 1, field: ds.length, points: me.total, wins: me.wins || 0, podiums: (me.wins || 0) + (me.p2 || 0) + (me.p3 || 0) };
  // MCSM Rating from just before the season to the end of it (ranked drivers only)
  const x = (P && P.drivers || {})[uid];
  const no = ctx.season.no;
  if (x && x.e) {
    const hist = pts(x).map((e) => ({ k: keyOf(e.l), r: e.r })).filter((e) => e.k != null);
    const before = hist.filter((e) => e.k < no * 1000 + 1).pop();
    const end = hist.filter((e) => e.k <= no * 1000 + 999).pop();
    if (end) out.rating = { end: end.r, change: before ? end.r - before.r : null };
  } else if (x) out.calib = { done: Math.min(calibRounds, x.n || 0), total: calibRounds };
  // team and MGTK championship places
  const snap = ctx.snaps[uid] || {};
  if (snap.teamId && (ctx.season.championships || {}).teams !== false) {
    const ts = teamStandings(upTo, ctx.teams, { table: ctx.points });
    const ti = ts.findIndex((r) => r.id === snap.teamId);
    if (ti >= 0) out.team = { name: (ctx.tmap[snap.teamId] || {}).name || '', pos: ti + 1 };
  }
  const gt = snap.gtTeamId;
  if (gt && ((ctx.season.championships || {}).gt || []).includes(gt)) {
    const gs = driverStandings(upTo, ctx.ids, { table: ctx.points, filter: (u) => (ctx.snaps[u] || {}).gtTeamId === gt });
    const gi = gs.findIndex((r) => r.id === uid);
    if (gi >= 0) out.gt = { tag: gt, pos: gi + 1 };
  }
  return out;
}
