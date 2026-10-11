// model/race.js
// Turning stored race data into what the scoring engine needs, plus the time formats.
//
// Stored (per season):
//   pq/{pqId}        { times: { uid: seconds } }                    one doc per PQ session
//   rounds/{n}       { lobbies: {A,B,C}, lobbiesPublished, resultsState: 'none'|'provisional'|'final' }
//   sheets/{n-L-S}   { n, L, S, rows: [{ id, pos, status, best, time, gap, laps }], state: 'draft'|'published' }
import { LOBBIES, DEFAULT_TABLE, lobbiesFromPq } from '../engine/scoring.js';

export const SESSIONS = ['Q', 'S', 'GP'];
export const sheetId = (n, L, S) => `${n}-${L}-${S}`;

/* ---------- time formats ---------- */
const num = (s) => Number(String(s).replace(',', '.'));
// '1:57.234' -> 117.234, '57.2' -> 57.2
const digitsToSec = (d) => {
  const ms = Number(d.slice(-3)), sec = Number(d.slice(-5, -3) || 0), rest = d.slice(0, -5);
  const min = rest.length > 2 ? Number(rest.slice(-2)) : Number(rest || 0), hr = rest.length > 2 ? Number(rest.slice(0, -2)) : 0;
  if (sec >= 60 || (rest.length > 2 && min >= 60)) return null;
  return Math.round((hr * 3600 + min * 60 + sec + ms / 1000) * 1000) / 1000;
};
// Digits only: "157105" -> 1:57.105, "57105" -> 57.105, "3456" -> 3.456, "2013400" -> 20:13.400
export function parseLap(str) {
  const s = String(str || '').trim().replace(/^\+/, '');
  if (!s) return null;
  if (/^\d{4,7}$/.test(s)) { const v = digitsToSec(s); return v > 0 ? v : null; }
  const m = /^(?:(\d{1,2}):)?(\d{1,2}(?:[.,]\d{1,3})?)$/.exec(s);
  if (!m) return null;
  const v = (m[1] ? Number(m[1]) * 60 : 0) + num(m[2]);
  return Number.isFinite(v) && v > 0 ? Math.round(v * 1000) / 1000 : null;
}
// '20:13.400' or '1:00:24.843' -> seconds
export function parseRaceTime(str) {
  const s = String(str || '').trim();
  if (/^\d{4,9}$/.test(s)) { const v = digitsToSec(s); return v > 0 ? v : null; }
  const m = /^(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2}(?:[.,]\d{1,3})?)$/.exec(s);
  if (!m) return parseLap(s);
  return Math.round(((m[1] ? Number(m[1]) * 3600 : 0) + Number(m[2]) * 60 + num(m[3])) * 1000) / 1000;
}
// '+3.456' -> { gap: 3.456 }, '+1 kör' / '+1 lap' / '+1L' -> { laps: 1 }
export function parseGap(str) {
  const s = String(str || '').trim().toLowerCase();
  if (!s) return null;
  const lp = /^\+?\s*(\d+)\s*(l|lap|laps|kör|kor)$/.exec(s);
  if (lp) return { laps: Number(lp[1]) };
  const g = parseLap(s);
  return g == null ? null : { gap: g };
}
export function fmtLap(sec) {
  if (sec == null) return '–';
  const m = Math.floor(sec / 60), s = sec - m * 60;
  return m ? `${m}:${s.toFixed(3).padStart(6, '0')}` : s.toFixed(3);
}
export function fmtRace(sec) {
  if (sec == null) return '–';
  const hh = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (hh ? hh + ':' + String(m).padStart(2, '0') : m) + ':' + s.toFixed(3).padStart(6, '0');
}

/* ---------- PQ ---------- */
// Seeded drivers first (in entry order), then everyone with a PQ time (fastest first),
// then entered drivers without a time.
export function pqRanking(inList, pqDocs) {
  const times = {};
  for (const d of pqDocs) for (const [uid, t] of Object.entries(d.times || {})) {
    if (!times[uid] || t < times[uid].t) times[uid] = { t, pq: d.id };
  }
  const seeded = inList.filter((e) => e.seeded).map((e) => ({ uid: e.uid, seeded: true }));
  const timed = inList.filter((e) => !e.seeded && times[e.uid]).map((e) => ({ uid: e.uid, ...times[e.uid] })).sort((a, b) => a.t - b.t);
  const none = inList.filter((e) => !e.seeded && !times[e.uid]).map((e) => ({ uid: e.uid, missing: true }));
  return [...seeded, ...timed, ...none];
}
export function pqProposal(ranking, size = 16) {
  const order = ranking.map((r) => r.uid);
  const z = typeof size === 'object' ? size : { A: size, B: size, C: size };
  return { A: order.slice(0, z.A), B: order.slice(z.A, z.A + z.B), C: order.slice(z.A + z.B) };
}
// One PQ per driver per season: who already has a time in another session?
export function pqConflicts(pqDocs, pqId) {
  const out = {};
  for (const d of pqDocs) if (d.id !== pqId) for (const uid of Object.keys(d.times || {})) out[uid] = d.id;
  return out;
}

/* ---------- results → engine ---------- */
export function lobbyOf(lobbies, uid) {
  if (!lobbies) return null;
  for (const L of LOBBIES) if ((lobbies[L] || []).includes(uid)) return L;
  return null;
}
// Published penalties change results: time penalties are added to the race time and the
// session is re-sorted; a DSQ removes the driver from every session of that round.
// Lapped finishers stay behind everyone on the lead lap.
export function applyPenalties(rows, S, pens) {
  if (!pens || !pens.length) return rows;
  const dsq = new Set(pens.filter((p) => p.kind === 'dsq').map((p) => p.uid));
  const add = {};
  pens.filter((p) => p.kind === 'time' && p.S === S).forEach((p) => { add[p.uid] = (add[p.uid] || 0) + (p.seconds || 0); });
  if (!dsq.size && !Object.keys(add).length) return rows;
  const out = rows.map((r) => ({ ...r }));
  out.forEach((r) => { if (dsq.has(r.id)) r.status = 'DSQ'; });
  if (S !== 'Q') {
    const ok = out.filter((r) => r.status === 'OK').sort((a, b) => a.pos - b.pos);
    const base = ok[0] ? ok[0].time || 0 : 0;
    ok.forEach((r, i) => { r._t = (i === 0 ? 0 : r.gap || 0) + (r.laps ? r.laps * 1e5 : 0) + (add[r.id] || 0); if (add[r.id]) r.penalty = add[r.id]; });
    ok.sort((a, b) => a._t - b._t);
    const lead = ok[0] ? ok[0]._t : 0;
    ok.forEach((r, i) => { r.pos = i + 1; if (i === 0) { r.time = base + lead; r.gap = null; r.laps = null; } else { r.time = null; r.gap = r.laps ? null : Math.round((r._t - lead) * 1000) / 1000; } delete r._t; });
    const rest = out.filter((r) => r.status !== 'OK').sort((a, b) => a.pos - b.pos);
    rest.forEach((r, i) => { r.pos = ok.length + i + 1; });
    return [...ok, ...rest];
  }
  const ok = out.filter((r) => r.status === 'OK').sort((a, b) => a.pos - b.pos);
  const rest = out.filter((r) => r.status !== 'OK');
  return [...ok, ...rest].map((r, i) => ({ ...r, pos: i + 1 }));
}

// Engine rounds for every round that has results we may show.
export function buildRounds(season, roundDocs, sheets, { drafts = false, penalties = [] } = {}) {
  const byN = Object.fromEntries(roundDocs.map((r) => [r.n, r]));
  return (season.rounds || []).map((r) => {
    const doc = byN[r.n] || {};
    if (doc.legacy && doc.legacy.rows && doc.legacy.rows.length) return { n: r.n, info: r, lobbies: doc.lobbies || {}, results: {}, legacy: doc.legacy.rows, state: doc.resultsState || 'final' };
    const mine = sheets.filter((s) => s.n === r.n && (drafts || s.state === 'published'));
    if (!mine.length || !doc.lobbies) return null;
    const results = {};
    for (const L of LOBBIES) {
      const ls = mine.filter((s) => s.L === L);
      if (!ls.length) continue;
      const pens = penalties.filter((p) => p.n === r.n && p.L === L);
      results[L] = Object.fromEntries(SESSIONS.map((S) => [S, applyPenalties(((ls.find((s) => s.S === S) || {}).rows || []).slice().sort((a, b) => a.pos - b.pos), S, pens)]));
    }
    return { n: r.n, info: r, lobbies: doc.lobbies, results, state: doc.resultsState || 'provisional' };
  }).filter(Boolean);
}
export const tableOf = (season) => (season && season.points) || DEFAULT_TABLE;

// Teams as they stood at entry (team changes never rewrite a season).
export function seasonTeams(entries) {
  const m = {};
  entries.filter((e) => e.status !== 'withdrawn' && e.snapshot && e.snapshot.teamId).forEach((e) => { (m[e.snapshot.teamId] = m[e.snapshot.teamId] || []).push(e.uid); });
  return Object.entries(m).map(([id, members]) => ({ id, members }));
}

// No-shows in a round: DNS in every session they were listed for, or flagged "can't make it".
export function noShows(round, entries) {
  const out = new Set();
  const abs = new Set(entries.filter((e) => (e.absences || []).includes(round.n)).map((e) => e.uid));
  for (const L of LOBBIES) {
    const res = round.results && round.results[L]; if (!res) continue;
    for (const uid of round.lobbies[L] || []) {
      const st = SESSIONS.map((S) => ((res[S] || []).find((r) => r.id === uid) || { status: 'DNS' }).status);
      if (st.every((x) => x === 'DNS') || abs.has(uid)) out.add(uid);
    }
  }
  return out;
}

// Is a results sheet ready to publish? Returns error keys.
export function sheetProblems(rows, roster, S) {
  const errs = [];
  const ids = new Set(rows.map((r) => r.id));
  if (roster.some((id) => !ids.has(id))) errs.push('sheetErrMissing');
  const ok = rows.filter((r) => r.status === 'OK');
  if (S === 'Q') { if (ok.some((r) => r.best == null)) errs.push('sheetErrLaps'); }
  else {
    if (ok[0] && ok[0].time == null) errs.push('sheetErrWinner');
    if (ok.slice(1).some((r) => r.gap == null && r.laps == null)) errs.push('sheetErrGaps');
    const gaps = ok.slice(1).filter((r) => r.gap != null && !r.laps).map((r) => r.gap);
    if (gaps.some((g, i) => i > 0 && g < gaps[i - 1])) errs.push('sheetErrOrder');
  }
  return errs;
}
