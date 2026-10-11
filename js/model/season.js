// model/season.js
// Season rules as pure functions: registration window, the derived entry list
// (cap, waitlist, reserves), entry checks and countdown targets.
import { isComplete } from './profile.js';
import { DEFAULT_TABLE } from '../engine/scoring.js';
import { shiftDay, DAY } from './time.js';

export const STATES = ['draft', 'announced', 'pq', 'running', 'finished', 'archived'];
export const LIVE_STATES = ['announced', 'pq', 'running'];
export const FORMATS = ['oneMake', 'special', 'spec'];
export const slugFor = (no) => 'mcsm' + Number(no);

// 'draft' | 'soon' | 'open' | 'closed'
export function regStatus(s, now = Date.now()) {
  if (!s || s.state === 'draft') return 'draft';
  if (s.state !== 'announced') return 'closed';
  if (s.regOpensAt == null || now < s.regOpensAt) return 'soon';
  if (s.regClosesAt != null && now >= s.regClosesAt) return 'closed';
  return 'open';
}
// Reserves may join while registration is open (approved at once), and afterwards
// during the season (then an admin has to approve them).
export function reserveMode(s, now = Date.now()) {
  const r = regStatus(s, now);
  if (r === 'open') return 'open';
  if (s && ((s.state === 'announced' && r === 'closed') || s.state === 'pq' || s.state === 'running')) return 'approval';
  return 'none';
}

const orderOf = (e) => (e.order != null ? e.order : e.createdAt || 0);

// The entry list is derived, never stored: the first `cap` drivers by order are in,
// the rest wait. A withdrawal therefore promotes the next driver automatically.
export function entryTable(season, entries) {
  const cap = season.cap || Infinity;
  const live = entries.filter((e) => e.status !== 'withdrawn');
  const drivers = live.filter((e) => e.type === 'driver').sort((a, b) => orderOf(a) - orderOf(b));
  const byUid = {};
  const inList = [], waitlist = [];
  drivers.forEach((e, i) => {
    if (i < cap) { inList.push(e); byUid[e.uid] = { status: 'in', pos: i + 1 }; }
    else if (season.waitlist !== false) { waitlist.push(e); byUid[e.uid] = { status: 'waitlist', pos: waitlist.length }; }
    else byUid[e.uid] = { status: 'over', pos: i + 1 };
  });
  const reserves = live.filter((e) => e.type === 'reserve').sort((a, b) => orderOf(a) - orderOf(b));
  reserves.forEach((e, i) => { byUid[e.uid] = { status: e.approved === false ? 'pending' : 'reserve', pos: i + 1 }; });
  entries.filter((e) => e.status === 'withdrawn').forEach((e) => { byUid[e.uid] = { status: 'withdrawn', pos: null }; });
  return { byUid, inList, waitlist, reserves, full: inList.length >= cap, cap: season.cap || null };
}

// Returns an error key, or '' if this person may enter as `type`.
export function entryBlocker(season, { user, profile, entries, type = 'driver', now = Date.now() }) {
  if (!user) return 'entryErrSignIn';
  if (!isComplete(profile)) return 'entryErrProfile';
  if (!user.emailVerified) return 'entryErrVerify';
  if (profile.suspendedUntil && profile.suspendedUntil > now) return 'entryErrSuspended';
  if (type === 'driver' && regStatus(season, now) !== 'open') return 'entryErrClosed';
  if (type === 'reserve' && reserveMode(season, now) === 'none') return 'entryErrClosed';
  if (type === 'driver' && season.waitlist === false && entryTable(season, entries).full) return 'entryErrFull';
  const mine = entries.find((e) => e.uid === user.uid);
  if (mine && mine.status !== 'withdrawn') return 'entryErrAlready';
  if (profile.raceNumber === 1 && season.championUid !== user.uid) return 'errNumberOne';
  if (profile.teamId) {
    const mates = entries.filter((e) => e.uid !== user.uid && e.status !== 'withdrawn' && e.snapshot && e.snapshot.teamId === profile.teamId);
    if (mates.some((e) => e.snapshot.raceNumber === profile.raceNumber)) return 'errNumberTeam';
    if (mates.length >= 3) return 'entryErrTeamFull';
  }
  return '';
}

export function snapshotOf(p) {
  const keys = ['firstName', 'lastName', 'psn', 'psnLower', 'raceNumber', 'dr', 'sr', 'teamId', 'gtTeamId', 'input'];
  return Object.fromEntries(keys.map((k) => [k, p[k] ?? null]));
}

export function nextRound(s, now = Date.now()) {
  return (s.rounds || []).slice().sort((a, b) => a.date - b.date).find((r) => r.date + 3 * 3600000 > now) || null;
}

// What the big countdown on the home page counts down to.
export function countdownTarget(s, now = Date.now()) {
  const r = regStatus(s, now);
  if (r === 'soon') return { kind: 'regOpens', at: s.regOpensAt };
  if (r === 'open' && s.regClosesAt) return { kind: 'regCloses', at: s.regClosesAt };
  const rd = nextRound(s, now);
  return rd ? { kind: 'round', at: rd.date, round: rd } : null;
}

export function defaultPq(round1) {
  if (!round1) return [];
  return [
    { id: 'pq1', name: 'PQ1', date: shiftDay(round1, -2, '20:00') },
    { id: 'pq2', name: 'PQ2', date: shiftDay(round1, -1, '20:00') },
    { id: 'pq3', name: 'PQ3', date: shiftDay(round1, 0, '18:00') },
  ];
}

export function newSeason(no, from) {
  const base = {
    id: slugFor(no), no: Number(no), name: '', description: '', coverUrl: '', state: 'draft', featured: false,
    format: 'oneMake', car: '', cars: [], rounds: [], pq: [],
    regOpensAt: null, regClosesAt: null, cap: 48, waitlist: true, lobbySize: 16, promote: 2, championUid: null,
    points: JSON.parse(JSON.stringify(DEFAULT_TABLE)), championships: { teams: true, gt: ['MGTK'] },
  };
  if (!from) return base;
  const keep = ['format', 'car', 'cars', 'cap', 'waitlist', 'lobbySize', 'lobbies', 'promote', 'points', 'championships', 'coverUrl', 'pqLobby'];
  keep.forEach((k) => { if (from[k] !== undefined) base[k] = JSON.parse(JSON.stringify(from[k])); });
  return base;
}

// Default registration window for a season whose round 1 is at `r1`.
export function defaultWindow(r1, pq) {
  const opens = shiftDay(r1, -14, '12:00');
  const closes = pq && pq[0] ? pq[0].date : r1 - 2 * DAY;
  return { regOpensAt: opens, regClosesAt: closes };
}

export function validateSeason(s, existingIds = []) {
  const e = {};
  if (!Number.isInteger(Number(s.no)) || Number(s.no) < 1 || Number(s.no) > 999) e.no = 'errSeasonNo';
  else if (existingIds.includes(slugFor(s.no))) e.no = 'errSeasonNoTaken';
  if (!s.name || !s.name.trim()) e.name = 'errRequired';
  if (s.coverUrl && !/^(https:\/\/\S+|data:image\/)/.test(s.coverUrl)) e.coverUrl = 'errUrl';
  if (!s.rounds.length) e.rounds = 'errNoRounds';
  if (s.rounds.some((r) => !r.date || !r.track)) e.rounds = 'errRoundIncomplete';
  if (s.format === 'oneMake' && !(s.car || '').trim()) e.car = 'errRequired';
  if (s.format === 'special' && s.rounds.some((r) => !(r.car || '').trim())) e.car = 'errCarPerRound';
  if (s.format === 'spec' && (s.cars || []).filter((c) => c.trim()).length < Math.max(2, s.rounds.length)) e.car = 'errCarPack';
  if (!s.regOpensAt || !s.regClosesAt) e.window = 'errWindow';
  else if (s.regClosesAt <= s.regOpensAt) e.window = 'errWindowOrder';
  if (!Number.isInteger(Number(s.cap)) || s.cap < 2) e.cap = 'errCap';
  if (!Number.isInteger(Number(s.lobbySize)) || s.lobbySize < 2 || s.lobbySize > 20) e.lobbySize = 'errLobbySize';
  const p = s.points || {};
  if (!Array.isArray(p.raceA) || p.raceA.length < 1 || p.raceA.some((x) => !Number.isFinite(x))) e.points = 'errPoints';
  if (!Array.isArray(p.quali) || p.quali.some((x) => !Number.isFinite(x))) e.points = 'errPoints';
  return e;
}

// Lobby sizes can differ per lobby (e.g. a streamer takes a slot in A). Falls back to lobbySize.
export function lobbySizes(s) {
  const base = Number((s && s.lobbySize) || 16);
  const own = (s && s.lobbies) || {};
  return { A: Number((own.A && own.A.size) || base), B: Number((own.B && own.B.size) || base), C: Number((own.C && own.C.size) || base) };
}
export const lobbyHost = (s, L) => ((s && s.lobbies && s.lobbies[L]) || {}).host || null;
