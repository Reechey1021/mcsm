// services/cloud/fake.js
// The test backend: same interface as firebase.js, but everything lives in this
// browser's localStorage. Each tab is its own "device" (signed-in user kept in
// sessionStorage). Open two tabs to play two people.
//
// Test accounts:  owner@mcsm.test / demo1234  (owner)
//                 pilota@mcsm.test / demo1234 (driver with a finished profile)
// URL helpers:    ?fakecloud  ?fakeuser=owner|pilota  ?fakereset
import { RAW, TEAM_NAMES, GT_TEAMS } from './fake-seed.js';
import { regStatus, reserveMode, snapshotOf, defaultPq } from '../../model/season.js';
import { isComplete } from '../../model/profile.js';
import { DEFAULT_TABLE } from '../../engine/scoring.js';
import { shiftDay, DAY } from '../../model/time.js';
import { promoteRelegate, gpGrid } from '../../engine/scoring.js';
import { pqRanking, pqProposal, sheetId } from '../../model/race.js';
import { windowState, specPickError } from '../../model/protest.js';

const KEY = 'mcsm:fakecloud:v1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const lag = () => sleep(120 + Math.random() * 160);
const fail = (code) => { const e = new Error(code); e.code = code; throw e; };
const clone = (x) => (x == null ? x : JSON.parse(JSON.stringify(x)));

function rng(seed) { return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }

function seed() {
  const R = rng(31031);
  const now = Date.now();
  const db = { accounts: {}, users: {}, priv: {}, psnIds: {}, teams: {}, gtTeams: {}, audit: [] };
  GT_TEAMS.forEach(([tag, name]) => { db.gtTeams[tag] = { id: tag, tag, name }; });
  TEAM_NAMES.forEach((name, i) => {
    const hue = Math.round((i * 137.5 + 20) % 360);
    const id = 't' + i;
    db.teams[id] = { id, name, c1: `hsl(${hue} 78% 56%)`, c2: `hsl(${(hue + 160) % 360} 70% 62%)`, status: i % 7 === 3 ? 'perm' : 'free', createdAt: now };
  });
  const used = new Set([21, 7]);
  const brands = ['Fanatec', 'Fanatec', 'Logitech', 'Thrustmaster', 'Moza', 'Fanatec', 'Simagic'];
  const views = ['cockpit', 'bonnet', 'bumper', 'chase'];
  const teamIds = Object.keys(db.teams);
  RAW.split('\n').forEach((line, i) => {
    const [dr, sr, last, first, psn] = line.split('|');
    const m = psn.match(/^(IGTSH|MGTK|GL|GTHH|GTHL)_/);
    let n; do { n = 2 + Math.floor(R() * 97); } while (used.has(n)); used.add(n);
    const input = R() < 0.86 ? 'wheel' : 'pad';
    const uid = 'demo-' + i;
    db.users[uid] = {
      firstName: first, lastName: last.charAt(0) + last.slice(1).toLocaleLowerCase('hu'), psn, psnLower: psn.toLowerCase(), dr, sr,
      input, wheelBrand: input === 'wheel' ? brands[Math.floor(R() * brands.length)] : null, view: views[Math.floor(R() * views.length)],
      raceNumber: n, gtTeamId: m ? m[1] : null, teamId: i < 46 ? teamIds[Math.floor(i / 2) % teamIds.length] : null,
      complete: true, lang: 'hu', createdAt: now - (60 - i) * 86400000, updatedAt: now,
    };
    db.psnIds[psn.toLowerCase()] = uid;
  });
  const acct = (uid, email, profile, roles) => {
    db.accounts[email] = { uid, email, password: 'demo1234', emailVerified: true };
    db.users[uid] = { ...profile, psnLower: profile.psn.toLowerCase(), complete: true, lang: 'hu', createdAt: now, updatedAt: now, ...(roles ? { roles } : {}) };
    db.priv[uid] = { email };
    db.psnIds[profile.psn.toLowerCase()] = uid;
  };
  acct('owner', 'owner@mcsm.test', { firstName: 'Richárd', lastName: 'Horváth', psn: 'IGTSH_Reechey-', dr: 'A+', sr: 'S', input: 'wheel', wheelBrand: 'Fanatec', view: 'tv', raceNumber: 21, gtTeamId: 'IGTSH', teamId: null }, { owner: true });
  acct('pilota', 'pilota@mcsm.test', { firstName: 'Elek', lastName: 'Teszt', psn: 'Teszt_Elek', dr: 'B', sr: 'A', input: 'pad', wheelBrand: null, view: 'chase', raceNumber: 7, gtTeamId: null, teamId: 't22' }, null);
  seedSeasons(db);
  seedRace(db);
  seedProtests(db);
  return db;
}

// Seasons for the test backend: MCSM31 running (real dates), MCSM30/29 finished, and a
// made-up MCSM32 whose registration is always open relative to "now".
function seedSeasons(db) {
  const now = Date.now();
  const at = (iso) => Date.parse(iso);
  const pts = () => JSON.parse(JSON.stringify(DEFAULT_TABLE));
  const base = { cap: 48, waitlist: true, lobbySize: 16, promote: 2, championUid: null, points: pts(), championships: { teams: true, gt: ['MGTK'] }, cars: [], description: '', featured: false, createdAt: now, updatedAt: now };
  const r31 = [at('2026-10-11T19:00:00+02:00'), at('2026-10-18T19:00:00+02:00'), at('2026-10-25T19:00:00+01:00')];
  db.seasons = {
    mcsm31: { ...base, id: 'mcsm31', no: 31, name: 'FT-1 Cup [Gr.3]', state: 'running', format: 'oneMake', car: 'Toyota FT-1 Vision Gran Turismo (Gr.3)', coverUrl: 'assets/cover31_big.jpg',
      rounds: [['grandvalley', 'Grand Valley', 'Highway 1', 'USA'], ['kyoto', 'Kyoto Driving Park', 'Yamagiwa', 'JPN'], ['dragon', 'Dragon Trail', 'Gardens', 'CRO']].map(([trackId, track, layout, cc], i) => ({ n: i + 1, date: r31[i], trackId, track, layout, cc, car: '' })),
      pq: defaultPq(r31[0]), regOpensAt: at('2026-09-27T12:00:00+02:00'), regClosesAt: at('2026-10-09T20:00:00+02:00') },
    mcsm30: { ...base, id: 'mcsm30', no: 30, name: 'Elantra TCR [Gr.4]', state: 'finished', format: 'oneMake', car: 'Hyundai Elantra N TCR', coverUrl: 'assets/cover30.jpg', rounds: [], pq: [], regOpensAt: at('2026-08-30T12:00:00+02:00'), regClosesAt: at('2026-09-11T20:00:00+02:00') },
    mcsm29: { ...base, id: 'mcsm29', no: 29, name: 'Saint Croix Tour III.', state: 'archived', format: 'special', car: '', coverUrl: 'assets/cover29.jpg', rounds: [], pq: [], regOpensAt: at('2026-05-24T12:00:00+02:00'), regClosesAt: at('2026-06-05T20:00:00+02:00') },
  };
  const r1 = shiftDay(now, 16, '19:00');
  const r32 = [r1, shiftDay(r1, 7, '19:00'), shiftDay(r1, 14, '19:00')];
  const pq32 = defaultPq(r1);
  db.seasons.mcsm32 = { ...base, id: 'mcsm32', no: 32, name: 'Tesztszezon [Gr.4]', state: 'announced', featured: true, format: 'spec', car: '', cars: ['Porsche 911 RSR', 'BMW M4 Gr.4', 'Mercedes-AMG GT3', 'Ferrari 458 Gr.4'], coverUrl: '',
    description: 'Tesztadat: ez a szezon csak a teszt módban létezik.',
    rounds: [['suzuka', 'Suzuka Circuit', '', 'JPN'], ['spa', 'Circuit de Spa-Francorchamps', '', 'BEL'], ['monza', 'Monza', '', 'ITA']].map(([trackId, track, layout, cc], i) => ({ n: i + 1, date: r32[i], trackId, track, layout, cc, car: '' })),
    pq: pq32, regOpensAt: shiftDay(now, -2, '12:00'), regClosesAt: pq32[0].date };
  db.entries = { mcsm31: {}, mcsm32: {}, mcsm30: {}, mcsm29: {} };
  const demo = Object.keys(db.users).filter((u) => u.startsWith('demo-')).sort((a, b) => +a.slice(5) - +b.slice(5));
  demo.forEach((uid, i) => {
    const p = db.users[uid];
    db.entries.mcsm31[uid] = { uid, type: 'driver', status: 'entered', order: at('2026-09-27T12:00:00+02:00') + i * 60000, approved: true, seeded: i < 12, snapshot: snapshotOf(p), availability: [], absences: [], note: '', createdAt: at('2026-09-27T12:00:00+02:00') + i * 60000 };
    if (i % 3 !== 2 && i < 44) db.entries.mcsm32[uid] = { uid, type: i > 40 ? 'reserve' : 'driver', status: 'entered', order: now - (50 - i) * 3600000, approved: true, seeded: false, snapshot: snapshotOf(p), availability: i > 40 ? [1, 3] : [], absences: [], note: '', createdAt: now - (50 - i) * 3600000 };
  });
}


// MCSM31 race data: PQ times, round 1 (final), round 2 (provisional) and round 3 line-ups.
// Simulated with fixed randomness so the test data is the same every time.
function seedRace(db) {
  const R = rng(4242);
  const sid = 'mcsm31';
  const season = db.seasons[sid];
  db.race = { [sid]: { pq: {}, rounds: {}, sheets: {} } };
  const race = db.race[sid];
  const entries = Object.values(db.entries[sid]).sort((a, b) => a.order - b.order);
  const skill = Object.fromEntries(entries.map((e, i) => [e.uid, 100 - i * 1.3 + (R() - 0.5) * 10]));
  const base = [117.2, 89.6, 111.4];
  // PQ
  season.pq.forEach((p) => { race.pq[p.id] = { id: p.id, times: {} }; });
  entries.filter((e) => !e.seeded).forEach((e) => {
    const pq = season.pq[Math.floor(R() * season.pq.length)].id;
    race.pq[pq].times[e.uid] = +(base[0] + (100 - skill[e.uid]) * 0.055 + R() * 0.45).toFixed(3);
  });
  const lob1 = pqProposal(pqRanking(entries, Object.values(race.pq)), 16);
  const sim = (rd, L, ids) => {
    const perf = (id, spread) => skill[id] + (R() - 0.5) * spread;
    const Q = ids.map((id) => ({ id, v: perf(id, 9) })).sort((a, b) => b.v - a.v).map((x, i) => ({ id: x.id, pos: i + 1, status: 'OK', best: +(base[rd] + (100 - x.v) * 0.045 + R() * 0.12).toFixed(3) }));
    const race_ = (len, spread, dnfP, grid) => {
      const rows = grid.map((id, gi) => ({ id, v: perf(id, spread) - gi * 0.25, status: R() < 0.012 ? 'DNS' : (R() < dnfP ? 'DNF' : 'OK') }));
      const fin = rows.filter((r) => r.status === 'OK').sort((a, b) => b.v - a.v);
      const out = rows.filter((r) => r.status !== 'OK').sort((a, b) => (a.status === 'DNF' ? 0 : 1) - (b.status === 'DNF' ? 0 : 1));
      let gap = 0;
      const res = fin.map((r, i) => { if (i > 0) gap += 0.35 + R() * 3.9 + (i > 9 ? R() * 3 : 0); return { id: r.id, pos: i + 1, status: 'OK', time: i === 0 ? +(len + R() * 25).toFixed(3) : null, gap: i === 0 ? null : +gap.toFixed(3), best: +(base[rd] + 0.25 + (100 - r.v) * 0.04 + R() * 0.3).toFixed(3) }; });
      out.forEach((r, i) => res.push({ id: r.id, pos: fin.length + i + 1, status: r.status, best: r.status === 'DNF' ? +(base[rd] + 0.6 + R() * 0.8).toFixed(3) : null }));
      return res;
    };
    const S = race_(20 * 60, 11, 0.03, Q.map((r) => r.id));
    const GP = race_(60 * 60, 13, 0.05, gpGrid(Q));
    return { Q, S, GP };
  };
  const put = (n, lobbies, state) => {
    race.rounds[n] = { n, lobbies, lobbiesPublished: true, resultsState: state };
    if (state === 'none') return;
    for (const L of ['A', 'B', 'C']) {
      const r = sim(n - 1, L, lobbies[L]);
      for (const S of ['Q', 'S', 'GP']) race.sheets[sheetId(n, L, S)] = { id: sheetId(n, L, S), n, L, S, rows: r[S], state: 'published', updatedAt: Date.now() };
    }
  };
  const asRound = (n) => ({ lobbies: race.rounds[n].lobbies, results: Object.fromEntries(['A', 'B', 'C'].map((L) => [L, Object.fromEntries(['Q', 'S', 'GP'].map((S) => [S, race.sheets[sheetId(n, L, S)].rows]))])) });
  put(1, lob1, 'final');
  put(2, promoteRelegate(asRound(1), season.promote), 'provisional');
  race.rounds[3] = { n: 3, lobbies: promoteRelegate(asRound(2), season.promote), lobbiesPublished: true, resultsState: 'none' };
  season.state = 'running';
}

// Judges, a published decision for round 1, an open case for round 2 (its protest window is
// extended in the test data so filing can be tried), and the matching penalty.
function seedProtests(db) {
  const now = Date.now();
  const race = db.race.mcsm31;
  ['demo-4', 'demo-10', 'demo-11', 'demo-20'].forEach((uid) => { db.users[uid].roles = { judge: true }; db.users[uid].judgeScope = uid === 'demo-20' ? ['B', 'C'] : ['A', 'B', 'C']; });
  db.users.owner.roles = { ...(db.users.owner.roles || {}), judgeChair: true };
  race.rounds[2].protestOpensAt = now - DAY;
  race.rounds[2].protestClosesAt = now + 3 * DAY;
  const A1 = race.rounds[1].lobbies.A, A2 = race.rounds[2].lobbies.A;
  const gp1 = race.sheets[sheetId(1, 'A', 'GP')].rows.filter((r) => r.status === 'OK');
  const victim = gp1[2].id, culprit = gp1[1].id;
  race.protests = {
    p1: { id: 'p1', n: 1, L: 'A', S: 'GP', lap: 7, corner: 'T4', involved: [culprit], by: victim, type: 'driver', title: 'Kitolás a 4-es kanyarban', description: 'A féktávon belülről érkezett, és kitolt a pályáról. Három helyet vesztettem.', video: 'https://youtu.be/dQw4w9WgXcQ',
      status: 'published', panel: ['demo-4', 'demo-10', 'demo-11', 'owner'].filter((u) => u !== victim && u !== culprit), createdAt: now - 18 * DAY,
      decision: { outcome: 'time', target: culprit, seconds: 5, text: 'A felvételen jól látszik, hogy a fékezés túl késői volt, és a sértett nem hagyhatott több helyet. 5 másodperces időbüntetés.' }, decidedAt: now - 16 * DAY, publishedAt: now - 16 * DAY },
    p2: { id: 'p2', n: 2, L: 'A', S: 'S', lap: 3, corner: 'T1', involved: [A2[5]], by: A2[3], type: 'driver', title: 'Rajt utáni érintkezés', description: 'Az 1-es kanyar bejáratánál hátulról meglökött, megpördültem.', video: '',
      status: 'review', panel: ['demo-4', 'demo-10', 'demo-11', 'owner'].filter((u) => u !== A2[5] && u !== A2[3]), createdAt: now - 2 * DAY },
  };
  race.votes = { p2: {} };
  race.protests.p2.panel.filter((u) => u !== 'owner').slice(0, 2).forEach((uid, i) => { race.votes.p2[uid] = { uid, outcome: i ? 'time' : 'time', target: A2[5], seconds: 3, reason: 'Elkerülhető érintkezés.', at: now - DAY }; });
  race.notes = { p2: [{ id: 'n1', by: race.protests.p2.panel[0], text: 'A visszajátszásban a 2. körtől nézzétek, ott jobban látszik.', at: now - DAY }] };
  race.penalties = { pen1: { id: 'pen1', protestId: 'p1', n: 1, L: 'A', S: 'GP', uid: culprit, kind: 'time', seconds: 5, at: now - 16 * DAY } };
  race.picks = {};
  void A1;
  db.notifications = {
    nn1: { id: 'nn1', kind: 'season', sid: 'mcsm31', type: 'resultsOut', params: { s: 'MCSM31', n: 2 }, link: '#/szezonok/mcsm31/fordulo/2', by: 'owner', at: now - 2 * DAY },
    nn2: { id: 'nn2', kind: 'season', sid: 'mcsm31', type: 'lobbiesOut', params: { s: 'MCSM31', n: 3 }, link: '#/szezonok/mcsm31/fordulo/3', by: 'owner', at: now - DAY },
    nn3: { id: 'nn3', kind: 'all', sid: 'mcsm32', type: 'regOpen', params: { s: 'MCSM32' }, link: '#/szezonok/mcsm32', by: 'owner', at: now - 2 * DAY },
  };
}

// Firestore refuses arrays directly inside arrays; the test backend does too, so it's caught early.
const hasNestedArray = (v, inArr = false) => (Array.isArray(v) ? (inArr || v.some((x) => hasNestedArray(x, true))) : v && typeof v === 'object' ? Object.values(v).some((x) => hasNestedArray(x, false)) : false);
export function createFakeBackend() {
  try { if (new URLSearchParams(location.search).has('fakereset')) localStorage.removeItem(KEY); } catch { /* */ }
  let db;
  try { db = JSON.parse(localStorage.getItem(KEY)); } catch { db = null; }
  if (!db) db = seed();
  if (!db.seasons) seedSeasons(db);
  if (!db.race) seedRace(db);
  if (!db.race.mcsm31.protests) seedProtests(db);
  const persist = () => { try { localStorage.setItem(KEY, JSON.stringify(db)); } catch { /* full or blocked */ } };
  persist();

  const authSubs = new Set();
  const userSubs = new Map(); // uid -> Set(cb)
  const sget = (k) => { try { return sessionStorage.getItem(k); } catch { return null; } };
  const sset = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch { /* */ } };
  // ?fakeuser=owner signs this tab in as a test account
  try {
    const fu = new URLSearchParams(location.search).get('fakeuser');
    if (fu) { const a = Object.values(db.accounts).find((x) => x.uid === fu || x.email.startsWith(fu + '@')); if (a) sset('mcsm:fakeuid', a.uid); }
  } catch { /* */ }
  const currentAcct = () => { const uid = sget('mcsm:fakeuid'); return uid ? Object.values(db.accounts).find((a) => a.uid === uid) || null : null; };
  const toUser = (a) => (a ? { uid: a.uid, email: a.email, emailVerified: !!a.emailVerified } : null);
  const fireAuth = () => { const u = toUser(currentAcct()); authSubs.forEach((cb) => cb(u)); };
  const fireUser = (uid) => { (userSubs.get(uid) || []).forEach((cb) => cb(clone(db.users[uid]) || null)); };
  // other tabs = other devices
  window.addEventListener('storage', (e) => {
    if (e.key !== KEY) return;
    try { db = JSON.parse(e.newValue) || db; } catch { /* */ }
    userSubs.forEach((_, uid) => fireUser(uid));
  });
  const emailOk = (e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e || '');
  const me = () => { const a = currentAcct(); if (!a) fail('permission-denied'); return a; };
  const isAdminUid = (uid) => { const r = (db.users[uid] && db.users[uid].roles) || {}; return !!(r.admin || r.owner); };
  const isStaff = (uid) => { const r = (db.users[uid] && db.users[uid].roles) || {}; return !!(r.admin || r.owner || r.resultsEditor); };
  const bucket = (sid) => { db.race = db.race || {}; db.race[sid] = db.race[sid] || { pq: {}, rounds: {}, sheets: {} }; const b = db.race[sid]; b.protests = b.protests || {}; b.votes = b.votes || {}; b.notes = b.notes || {}; b.penalties = b.penalties || {}; b.picks = b.picks || {}; return b; };
  const roleOf = (uid) => (db.users[uid] && db.users[uid].roles) || {};
  const isJudgeUid = (uid) => { const r = roleOf(uid); return !!(r.judge || r.judgeChair || r.admin || r.owner); };
  const isChairUid = (uid) => { const r = roleOf(uid); return !!(r.judgeChair || r.admin || r.owner); };

  return {
    kind: 'fake',
    auth: {
      onChange(cb) { authSubs.add(cb); setTimeout(() => cb(toUser(currentAcct())), 0); return () => authSubs.delete(cb); },
      async signUp(email, password) {
        await lag(); email = (email || '').trim().toLowerCase();
        if (!emailOk(email)) fail('auth/invalid-email');
        if (!password || password.length < 8) fail('auth/weak-password');
        if (db.accounts[email]) fail('auth/email-already-in-use');
        const uid = 'u' + Date.now().toString(36) + Math.floor(Math.random() * 1e4);
        db.accounts[email] = { uid, email, password, emailVerified: false };
        db.users[uid] = { createdAt: Date.now(), updatedAt: Date.now(), lang: 'hu' };
        db.priv[uid] = { email };
        persist(); sset('mcsm:fakeuid', uid); fireAuth();
        return toUser(db.accounts[email]);
      },
      async signIn(email, password) {
        await lag(); email = (email || '').trim().toLowerCase();
        if (!emailOk(email)) fail('auth/invalid-email');
        const a = db.accounts[email];
        if (!a || !a.password || a.password !== password) fail('auth/invalid-credential');
        sset('mcsm:fakeuid', a.uid); fireAuth();
        return toUser(a);
      },
      async signOut() { sset('mcsm:fakeuid', null); fireAuth(); },
      async sendReset(email) { await lag(); if (!emailOk((email || '').trim())) fail('auth/invalid-email'); /* a real reset email goes out in Firebase; in test mode the activation screen offers the link */ },
      async sendVerification() { await lag(); me(); },
      async reload() { await lag(); const u = toUser(currentAcct()); fireAuth(); return u; },
      async changePassword(current, next) {
        await lag(); const a = me();
        if (a.password !== current) fail('auth/invalid-credential');
        if (!next || next.length < 8) fail('auth/weak-password');
        a.password = next; persist();
      },
      async idToken() { return 'fake-token'; },
      async applyCode(code) { await lag(); if (code === 'expired') fail('auth/invalid-action-code'); const a = currentAcct(); if (a) { a.emailVerified = true; persist(); fireAuth(); } },
      // Test codes look like "fake:<email>" (the activation screen shows a test link).
      async checkResetCode(code) { await lag(); if (code === 'expired') fail('auth/invalid-action-code'); const email = String(code).startsWith('fake:') ? code.slice(5) : 'pilota@mcsm.test'; if (!db.accounts[email]) fail('auth/invalid-action-code'); return email; },
      async confirmReset(code, password) { await lag(); if (!password || password.length < 8) fail('auth/weak-password'); const email = String(code).startsWith('fake:') ? code.slice(5) : 'pilota@mcsm.test'; const a = db.accounts[email]; if (a) { a.password = password; persist(); } },
      // Test backend only: pretend the user clicked the link in the verification email.
      async devVerify() { const a = me(); a.emailVerified = true; persist(); fireAuth(); },
    },
    users: {
      watch(uid, cb) {
        if (!userSubs.has(uid)) userSubs.set(uid, new Set());
        userSubs.get(uid).add(cb);
        setTimeout(() => cb(clone(db.users[uid]) || null), 0);
        return () => userSubs.get(uid).delete(cb);
      },
      async get(uid) { await lag(); return clone(db.users[uid]) || null; },
      async list() { await lag(); return Object.entries(db.users).map(([uid, p]) => ({ uid, ...clone(p) })); },
      async getPrivate(uid) { await lag(); const a = me(); if (a.uid !== uid && !isAdminUid(a.uid)) fail('permission-denied'); return clone(db.priv[uid]) || {}; },
      async lockOwner(psnLower) { await lag(); return db.psnIds[psnLower] || null; },
      async remove(uid) { await lag(); const a = me(); if (!roleOf(a.uid).owner) fail('permission-denied'); delete db.users[uid]; persist(); },
      async removeFull(uid, psnLower) { await lag(); const a = me(); if (!isAdminUid(a.uid)) fail('permission-denied'); delete db.users[uid]; delete db.priv[uid]; if (psnLower) delete db.psnIds[psnLower]; persist(); },
      async psnFree(psn, uid) { await sleep(150); const k = String(psn || '').trim().toLowerCase(); return !db.psnIds[k] || db.psnIds[k] === uid; },
      async teammates(teamId, uid) { await lag(); if (!teamId) return []; return Object.entries(db.users).filter(([id, p]) => p.teamId === teamId && id !== uid).map(([id, p]) => ({ uid: id, ...clone(p) })); },
      async save(uid, patch) {
        await lag(); const a = me();
        if (a.uid !== uid && !isAdminUid(a.uid)) fail('permission-denied');
        if (a.uid === uid && !isAdminUid(a.uid) && ('roles' in patch || 'suspendedUntil' in patch)) fail('permission-denied');
        const cur = db.users[uid] || {};
        if (patch.psnLower && patch.psnLower !== cur.psnLower) {
          if (db.psnIds[patch.psnLower] && db.psnIds[patch.psnLower] !== uid) fail('psn-taken');
          if (cur.psnLower) delete db.psnIds[cur.psnLower];
          db.psnIds[patch.psnLower] = uid;
        }
        if (patch.teamId && patch.teamId !== cur.teamId && !isAdminUid(a.uid) && db.teams[patch.teamId] && db.teams[patch.teamId].status !== 'free') fail('permission-denied');
        db.users[uid] = { ...cur, ...clone(patch), updatedAt: Date.now() };
        persist(); fireUser(uid);
      },
    },
    teams: {
      async list() { await lag(); return Object.values(clone(db.teams)); },
      async save(team) {
        await lag(); const a = me(); if (!isAdminUid(a.uid)) fail('permission-denied');
        const id = team.id || ('t' + Date.now().toString(36));
        db.teams[id] = { ...(db.teams[id] || { createdAt: Date.now() }), ...clone(team), id, updatedAt: Date.now() };
        persist(); return id;
      },
      async remove(id) { await lag(); const a = me(); if (!isAdminUid(a.uid)) fail('permission-denied'); delete db.teams[id]; persist(); },
    },
    gtTeams: {
      async list() { await lag(); return Object.values(clone(db.gtTeams)); },
      async save(tm) {
        await lag(); const a = me(); if (!isAdminUid(a.uid)) fail('permission-denied');
        const id = tm.tag.trim().toUpperCase();
        db.gtTeams[id] = { id, tag: id, name: tm.name.trim(), logoUrl: tm.logoUrl || null }; persist(); return id;
      },
      async remove(id) { await lag(); const a = me(); if (!isAdminUid(a.uid)) fail('permission-denied'); delete db.gtTeams[id]; persist(); },
    },
    seasons: {
      async list() {
        await lag(); const a = currentAcct(); const admin = a && isAdminUid(a.uid);
        return Object.values(clone(db.seasons)).filter((x) => admin || x.state !== 'draft');
      },
      async get(id) { await lag(); const x = db.seasons[id]; const a = currentAcct(); if (!x || (x.state === 'draft' && !(a && isAdminUid(a.uid)))) return null; return clone(x); },
      async save(season) {
        await lag(); const a = me(); if (!isAdminUid(a.uid)) fail('permission-denied');
        db.seasons[season.id] = { ...(db.seasons[season.id] || { createdAt: Date.now() }), ...clone(season), updatedAt: Date.now() };
        if (!db.entries[season.id]) db.entries[season.id] = {};
        persist(); return season.id;
      },
      async patch(id, data) { await lag(); const a = me(); if (!isAdminUid(a.uid)) fail('permission-denied'); db.seasons[id] = { ...db.seasons[id], ...clone(data), updatedAt: Date.now() }; persist(); },
      async remove(id) { await lag(); const a = me(); if (!isAdminUid(a.uid)) fail('permission-denied'); delete db.seasons[id]; delete db.entries[id]; persist(); },
      async purge(id) { await lag(); const a = me(); if (!isAdminUid(a.uid)) fail('permission-denied'); delete db.seasons[id]; delete db.entries[id]; if (db.race) delete db.race[id]; persist(); },
    },
    entries: {
      async list(sid) { await lag(); return Object.values(clone(db.entries[sid] || {})); },
      async get(sid, uid) { await lag(); return clone((db.entries[sid] || {})[uid]) || null; },
      // Mirrors the Firestore rules: drivers may create their own entry only when allowed,
      // and may only change a few fields of it afterwards. Admins can do anything.
      async save(sid, uid, data) {
        await lag(); const a = me(); const admin = isAdminUid(a.uid);
        const season = db.seasons[sid]; if (!season) fail('not-found');
        const cur = (db.entries[sid] || {})[uid];
        if (!admin) {
          if (a.uid !== uid) fail('permission-denied');
          const next = { ...(cur || {}), ...data };
          if (!cur) {
            const p = db.users[uid];
            if (!isComplete(p) || !a.emailVerified || (p.suspendedUntil && p.suspendedUntil > Date.now())) fail('permission-denied');
            if (next.seeded) fail('permission-denied');
            if (next.type === 'driver' && regStatus(season) !== 'open') fail('permission-denied');
            if (next.type === 'reserve' && !(reserveMode(season) === 'open' || (reserveMode(season) === 'approval' && next.approved === false))) fail('permission-denied');
          } else {
            const allowed = ['status', 'absences', 'availability', 'note', 'updatedAt', 'withdrawnAt', 'order', 'snapshot'];
            if (Object.keys(data).some((k) => !allowed.includes(k))) fail('permission-denied');
            if (('order' in data || 'snapshot' in data) && !(cur.status === 'withdrawn' && next.status === 'entered' && regStatus(season) === 'open')) fail('permission-denied');
          }
        }
        db.entries[sid] = db.entries[sid] || {};
        db.entries[sid][uid] = { ...(cur || { createdAt: Date.now() }), ...clone(data), uid, updatedAt: Date.now() };
        persist();
      },
      async remove(sid, uid) { await lag(); const a = me(); if (!isAdminUid(a.uid)) fail('permission-denied'); delete (db.entries[sid] || {})[uid]; persist(); },
    },
    race: {
      async pqList(sid) { await lag(); return Object.values(clone(((db.race || {})[sid] || {}).pq || {})); },
      async pqSave(sid, pqId, times) {
        await lag(); const a = me(); if (!isStaff(a.uid)) fail('permission-denied');
        bucket(sid).pq[pqId] = { id: pqId, times: clone(times), updatedAt: Date.now() }; persist();
      },
      async roundsList(sid) {
        await lag(); const a = currentAcct(); const staff = a && isStaff(a.uid);
        return Object.values(clone(bucket(sid).rounds)).filter((r) => staff || r.lobbiesPublished);
      },
      async roundSave(sid, n, data) {
        await lag(); const a = me(); if (!isAdminUid(a.uid)) fail('permission-denied');
        bucket(sid).rounds[n] = { ...(bucket(sid).rounds[n] || { n }), ...clone(data), n, updatedAt: Date.now() }; persist();
      },
      async sheetsList(sid) {
        await lag(); const a = currentAcct(); const staff = a && isStaff(a.uid);
        return Object.values(clone(bucket(sid).sheets)).filter((x) => staff || x.state === 'published');
      },
      async sheetSave(sid, id, data) {
        await lag(); const a = me(); if (!isStaff(a.uid)) fail('permission-denied');
        if (data.state === 'published' && !isAdminUid(a.uid)) fail('permission-denied');
        bucket(sid).sheets[id] = { ...(bucket(sid).sheets[id] || {}), ...clone(data), id, updatedAt: Date.now(), by: a.uid }; persist();
      },
    },
    protests: {
      async list(sid) {
        await lag(); const a = currentAcct(); const judge = a && isJudgeUid(a.uid);
        return Object.values(clone(bucket(sid).protests)).filter((p) => judge || p.status === 'published' || (a && (p.by === a.uid || (p.involved || []).includes(a.uid))));
      },
      async save(sid, id, data) {
        await lag(); const a = me(); const b = bucket(sid); const cur = id ? b.protests[id] : null;
        if (!cur) {
          if (data.by !== a.uid) fail('permission-denied');
          if (data.type === 'judge') { if (!isJudgeUid(a.uid)) fail('permission-denied'); }
          else {
            const season = db.seasons[sid]; const round = (season.rounds || []).find((r) => r.n === data.n);
            const entry = (db.entries[sid] || {})[a.uid];
            if (!entry || entry.status === 'withdrawn' || entry.approved === false || windowState(round, b.rounds[data.n] || {}) !== 'open' || data.status !== 'filed') fail('permission-denied');
          }
          const nid = 'p' + Date.now().toString(36);
          b.protests[nid] = { ...clone(data), id: nid, createdAt: Date.now() }; persist(); return nid;
        }
        const own = cur.by === a.uid && Object.keys(data).every((k) => ['status', 'updatedAt'].includes(k)) && cur.status === 'filed' && data.status === 'withdrawn';
        if (!own && !isChairUid(a.uid)) fail('permission-denied');
        b.protests[id] = { ...cur, ...clone(data), updatedAt: Date.now() }; persist(); return id;
      },
    },
    votes: {
      async list(sid, pid) { await lag(); const a = me(); if (!isJudgeUid(a.uid)) fail('permission-denied'); return Object.values(clone(bucket(sid).votes[pid] || {})); },
      async save(sid, pid, vote) {
        await lag(); const a = me(); if (!isJudgeUid(a.uid)) fail('permission-denied');
        const b = bucket(sid); b.votes[pid] = b.votes[pid] || {}; b.votes[pid][a.uid] = { ...clone(vote), uid: a.uid, at: Date.now() }; persist();
      },
    },
    notes: {
      async list(sid, pid) { await lag(); const a = me(); if (!isJudgeUid(a.uid)) fail('permission-denied'); return clone(bucket(sid).notes[pid] || []); },
      async add(sid, pid, text) { await lag(); const a = me(); if (!isJudgeUid(a.uid)) fail('permission-denied'); const b = bucket(sid); b.notes[pid] = b.notes[pid] || []; b.notes[pid].push({ id: 'n' + Date.now().toString(36), by: a.uid, text, at: Date.now() }); persist(); },
    },
    penalties: {
      async list(sid) { await lag(); return Object.values(clone(bucket(sid).penalties)); },
      async save(sid, pen) { await lag(); const a = me(); if (!isChairUid(a.uid)) fail('permission-denied'); const id = pen.id || ('pen' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5)); bucket(sid).penalties[id] = { ...clone(pen), id, at: Date.now() }; persist(); return id; },
      async remove(sid, id) { await lag(); const a = me(); if (!isChairUid(a.uid)) fail('permission-denied'); delete bucket(sid).penalties[id]; persist(); },
    },
    picks: {
      async list(sid) {
        await lag(); const a = currentAcct(); const admin = a && isAdminUid(a.uid);
        const myTeam = a && db.entries[sid] && db.entries[sid][a.uid] && db.entries[sid][a.uid].snapshot ? db.entries[sid][a.uid].snapshot.teamId : null;
        return Object.values(clone(bucket(sid).picks)).filter((p) => admin || p.lockAt <= Date.now() || (myTeam && p.teamId === myTeam));
      },
      async save(sid, n, teamId, car) {
        await lag(); const a = me(); const admin = isAdminUid(a.uid);
        const entry = (db.entries[sid] || {})[a.uid];
        if (!admin && !(entry && entry.status !== 'withdrawn' && entry.snapshot && entry.snapshot.teamId === teamId)) fail('permission-denied');
        const season = db.seasons[sid]; const all = Object.values(bucket(sid).picks);
        const e = specPickError(season, all, teamId, n, car);
        if (e && !(admin && e === 'specLocked')) fail(e === 'specLocked' ? 'permission-denied' : 'spec-used');
        const round = season.rounds.find((r) => r.n === n);
        bucket(sid).picks[`${n}_${teamId}`] = { n, teamId, car, lockAt: round.date, by: a.uid, at: Date.now() }; persist();
      },
    },
    content: {
      async get(id) { await lag(); return clone((db.content || {})[id]) || null; },
      async save(id, data) { await lag(); const a = me(); if (!isAdminUid(a.uid)) fail('permission-denied'); if (hasNestedArray(data)) fail('invalid-argument'); db.content = db.content || {}; db.content[id] = { ...clone(data), updatedAt: Date.now(), by: a.uid }; persist(); },
    },
    config: {
      async get(id) { await lag(); const a = me(); if (!isAdminUid(a.uid)) fail('permission-denied'); return clone((db.config || {})[id]) || null; },
      async save(id, data) { await lag(); const a = me(); if (!isAdminUid(a.uid)) fail('permission-denied'); db.config = db.config || {}; db.config[id] = clone(data); persist(); },
    },
    notify: {
      async list(uid) {
        await lag();
        return Object.values(clone(db.notifications || {})).filter((n) => n.kind === 'all' || n.kind === 'season' || (uid && (n.uids || []).includes(uid)));
      },
      async add(n) {
        await lag(); const a = me();
        const driverTypes = ['protestAgainst', 'protestNew', 'promoted', 'reservePending', 'claimDispute', 'roleGranted'];
        if (!(isAdminUid(a.uid) || isJudgeUid(a.uid) || (n.kind === 'users' && driverTypes.includes(n.type) && (n.uids || []).length <= 60))) fail('permission-denied');
        db.notifications = db.notifications || {};
        const id = 'n' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        db.notifications[id] = { ...clone(n), id, by: a.uid, at: Date.now() }; persist(); return id;
      },
    },
    audit: {
      async add(entry) { const a = me(); db.audit.unshift({ id: 'a' + Date.now().toString(36) + Math.random().toString(36).slice(2, 5), at: Date.now(), by: a.uid, ...clone(entry) }); db.audit = db.audit.slice(0, 500); persist(); },
      async list(n = 100) { await lag(); const a = me(); if (!isAdminUid(a.uid)) fail('permission-denied'); return clone(db.audit.slice(0, n)); },
    },
    admin: {
      async writeMany(ops, onProgress) {
        await lag(); const a = me(); if (!isAdminUid(a.uid)) fail('permission-denied');
        ops.forEach((o, i) => {
          const [c1, id1, c2, id2] = o.path;
          const put = (obj, key) => { obj[key] = o.merge ? { ...(obj[key] || {}), ...clone(o.data) } : clone(o.data); };
          if (c1 === 'users' && !c2) put(db.users, id1);
          else if (c1 === 'users' && c2 === 'private') put(db.priv, id1);
          else if (c1 === 'psnIds') db.psnIds[id1] = o.data.uid;
          else if (c1 === 'teams') put(db.teams, id1);
          else if (c1 === 'gtTeams') put(db.gtTeams, id1);
          else if (c1 === 'seasons' && !c2) { put(db.seasons, id1); db.entries[id1] = db.entries[id1] || {}; }
          else if (c1 === 'seasons' && c2 === 'entries') { db.entries[id1] = db.entries[id1] || {}; put(db.entries[id1], id2); }
          else if (c1 === 'seasons' && c2 === 'rounds') put(bucket(id1).rounds, id2);
          else if (c1 === 'seasons' && c2 === 'pq') put(bucket(id1).pq, id2);
          else if (c1 === 'seasons' && c2 === 'sheets') put(bucket(id1).sheets, id2);
          else if (c1 === 'seasons' && c2 === 'penalties') put(bucket(id1).penalties, id2);
          else if (c1 === 'seasons' && c2 === 'protests') put(bucket(id1).protests, id2);
          if (onProgress && (i % 50 === 0 || i === ops.length - 1)) onProgress(i + 1, ops.length);
        });
        persist();
      },
      // Simulates functions/index.js
      async call(action, payload) {
        await lag(); const a = me(); if (!roleOf(a.uid).owner) fail('fn-forbidden');
        if (action === 'importUsers') {
          let created = 0; const errors = [];
          (payload.users || []).forEach((u, i) => {
            const clash = db.accounts[u.email] && db.accounts[u.email].uid !== u.uid;
            if (clash) { errors.push({ index: i, message: 'email already used by another account' }); return; }
            db.accounts[u.email] = { uid: u.uid, email: u.email, password: (db.accounts[u.email] || {}).password || null, emailVerified: true }; created++;
          });
          persist(); return { successCount: created, failureCount: errors.length, errors };
        }
        if (action === 'ping') return { ok: true, project: 'fake' };
        if (action === 'readResults') {
          const names = (payload.hint || []).slice(0, 16);
          const isQ = payload.session === 'Q' || payload.session === 'PQ';
          const results = names.map((p, i) => ({
            position: i + 1,
            displayName: i % 4 === 1 ? `${p.firstName[0]}. ${p.lastName}` : p.psn,
            bestLap: `1:5${1 + Math.floor(i / 6)}.${String(814 + i * 37).slice(-3)}`,
            totalTime: !isQ && i === 0 ? '20:13.400' : null, gap: !isQ && i > 0 ? `+${(i * 1.234).toFixed(3)}` : isQ && i > 0 ? `+0${(i * 0.123).toFixed(3)}` : null,
            status: !isQ && i === names.length - 1 ? 'dnf' : 'finished',
            confidence: i === 2 ? 0.55 : 0.97, warnings: i === 2 ? ['Egy számjegy bizonytalan'] : [],
          }));
          await lag();
          return { ok: true, model: 'fake-gemini', title: 'MCSM : TESZT', results };
        }
        if (action === 'importData') { await this.writeMany(payload.ops || []); return { ok: true, written: (payload.ops || []).length }; }
        fail('fn-unknown');
      },
      async functionsConfig() { return { url: 'fake://functions' }; },
    },
    storage: {
      // Test mode keeps images as data URLs in this browser.
      async upload(path, blob) { await lag(); return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(blob); }); },
      async remove() { await lag(); },
    },
    dev: {
      accounts: () => Object.values(db.accounts).map((a) => ({ email: a.email, uid: a.uid })),
      reset() { try { localStorage.removeItem(KEY); } catch { /* */ } },
    },
  };
}
