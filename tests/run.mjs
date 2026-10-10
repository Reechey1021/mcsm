// tests/run.mjs — node tests/run.mjs
// Scoring engine, profile rules, translations and the test backend's account flows.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// Minimal browser shims for modules that touch storage/location.
const mem = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), clear: () => m.clear(), key: (i) => [...m.keys()][i] }; };
globalThis.localStorage = mem(); globalThis.sessionStorage = mem();
globalThis.location = { search: '' }; globalThis.window = { addEventListener() {} };
globalThis.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} }); globalThis.CSS = globalThis.CSS || { supports: () => false };

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
let passed = 0; const failed = [];
const test = async (name, fn) => { try { await fn(); passed++; } catch (e) { failed.push(`${name}: ${e.message}`); } };
const eq = (a, b, msg) => { if (JSON.stringify(a) !== JSON.stringify(b)) throw new Error(`${msg || ''} expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); };
const ok = (c, msg) => { if (!c) throw new Error(msg || 'assertion failed'); };

const S = await import('../js/engine/scoring.js');
const P = await import('../js/model/profile.js');
const { hu } = await import('../js/i18n/hu.js');
const { en } = await import('../js/i18n/en.js');

// ---------- scoring ----------
await test('race points per lobby', () => {
  eq(S.racePoints(S.DEFAULT_TABLE, 'A', 1), 315); eq(S.racePoints(S.DEFAULT_TABLE, 'B', 1), 215); eq(S.racePoints(S.DEFAULT_TABLE, 'C', 1), 115);
  eq(S.racePoints(S.DEFAULT_TABLE, 'A', 16), 205); eq(S.racePoints(S.DEFAULT_TABLE, 'C', 16), 5); eq(S.racePoints(S.DEFAULT_TABLE, 'A', 17), 0);
});
await test('session points: quali, DNF, DNS, DSQ', () => {
  const T = S.DEFAULT_TABLE;
  eq(S.sessionPoints(T, 'Q', 'C', { pos: 1, status: 'OK' }), 23);
  eq(S.sessionPoints(T, 'S', 'A', { pos: 3, status: 'DNF' }), 200);
  eq(S.sessionPoints(T, 'GP', 'B', { pos: 9, status: 'DNF' }), 100);
  eq(S.sessionPoints(T, 'GP', 'C', { pos: 9, status: 'DNF' }), 0);
  eq(S.sessionPoints(T, 'GP', 'A', { pos: 1, status: 'DNS' }), 0);
  eq(S.sessionPoints(T, 'GP', 'A', { pos: 1, status: 'DSQ' }), 0);
});
const mkRound = () => {
  const ids = (p, n) => Array.from({ length: n }, (_, i) => p + i);
  const lobbies = { A: ids('a', 16), B: ids('b', 16), C: ids('c', 16) };
  const rows = (arr, best = 100) => arr.map((id, i) => ({ id, pos: i + 1, status: 'OK', best: best + i * 0.1 }));
  const results = {};
  for (const L of ['A', 'B', 'C']) results[L] = { Q: rows(lobbies[L]), S: rows(lobbies[L]), GP: rows(lobbies[L]) };
  return { lobbies, results };
};
await test('round totals include fastest lap bonus', () => {
  const rd = mkRound(); const tot = S.roundTotals(rd);
  eq(tot.a0.total, 23 + 315 + 315 + 6); eq(tot.c15.total, 1 + 5 + 5);
});
await test('promotion/relegation swaps two each way', () => {
  const next = S.promoteRelegate(mkRound(), 2);
  ok(next.A.includes('b0') && next.A.includes('b1') && !next.A.includes('a15'), 'A');
  ok(next.B.includes('a14') && next.B.includes('c1') && !next.B.includes('b15'), 'B');
  ok(next.C.includes('b14') && next.C.includes('b15'), 'C');
  eq([next.A.length, next.B.length, next.C.length], [16, 16, 16]);
});
await test('lobby ranking tie-break: quali then sprint', () => {
  const rd = { lobbies: { A: ['x', 'y'] }, results: { A: { Q: [{ id: 'y', pos: 1, status: 'OK' }, { id: 'x', pos: 2, status: 'OK' }], S: [{ id: 'x', pos: 1, status: 'OK' }, { id: 'y', pos: 2, status: 'OK' }], GP: [] } } };
  // x: 20 + 315 = 335, y: 23 + 300 = 323 -> x first; make them equal via a custom table
  const T = { ...S.DEFAULT_TABLE, quali: [0, 15] };
  eq(S.lobbyRanking(rd, 'A', T), ['x', 'y']);
  const T2 = { ...S.DEFAULT_TABLE, quali: [15, 0] }; // x 315, y 15+300=315 -> tie, y better quali
  eq(S.lobbyRanking(rd, 'A', T2), ['y', 'x']);
});
await test('standings tie-break: wins, then seconds', () => {
  const rd = mkRound();
  const st = S.driverStandings([rd], [...rd.lobbies.A, ...rd.lobbies.B]);
  eq(st[0].id, 'a0'); eq(st[0].wins, 2); eq(st.length, 32);
  const mg = S.driverStandings([rd], [...rd.lobbies.A], { filter: (id) => id !== 'a0' });
  eq(mg[0].id, 'a1'); eq(mg[0].wins, 2, 'wins counted among filtered drivers');
});
await test('team standings: best two starters per round', () => {
  const rd = mkRound();
  const st = S.teamStandings([rd], [{ id: 't1', members: ['a0', 'a1', 'a2'] }, { id: 't2', members: ['b0'] }]);
  const tot = S.roundTotals(rd);
  eq(st[0].id, 't1'); eq(st[0].total, tot.a0.total + tot.a1.total);
});
await test('GP grid reverses the top eight', () => {
  const q = Array.from({ length: 10 }, (_, i) => ({ id: 'd' + (i + 1), pos: i + 1 }));
  eq(S.gpGrid(q), ['d8', 'd7', 'd6', 'd5', 'd4', 'd3', 'd2', 'd1', 'd9', 'd10']);
});
await test('lobbies from PQ: seeded first, then fastest', () => {
  const l = S.lobbiesFromPq(['s1'], [{ id: 'x', t: 90.2 }, { id: 'y', t: 90.1 }], 2);
  eq(l, { A: ['s1', 'y'], B: ['x'], C: [] });
});

// ---------- profile ----------
await test('validators', () => {
  eq(P.validate.name('Ádám'), ''); eq(P.validate.name('Nagy-W'), ''); eq(P.validate.name(''), 'errRequired'); eq(P.validate.name('R2D2'), 'errName');
  eq(P.validate.psn('IGTSH_Reechey-'), ''); eq(P.validate.psn('ab'), 'errPsn'); eq(P.validate.psn('1abc'), 'errPsn'); eq(P.validate.psn('a'.repeat(17)), 'errPsn');
  eq(P.validate.raceNumber(1, {}, {}), 'errNumberOne'); eq(P.validate.raceNumber(1, {}, { isAdmin: true }), ''); eq(P.validate.raceNumber(0, {}, {}), 'errNumber');
  eq(P.validate.raceNumber(1000, {}, {}), 'errNumber'); eq(P.validate.raceNumber(21, {}, { teammateNumbers: [21] }), 'errNumberTeam');
  eq(P.validate.wheelBrand(null, { input: 'pad' }), ''); eq(P.validate.wheelBrand(null, { input: 'wheel' }), '', 'brand is optional'); eq(P.validate.wheelBrand('other', { input: 'wheel', wheelOther: '' }), 'errWheelOther');
  eq(P.validate.stream('https://twitch.tv/x'), ''); eq(P.validate.stream('http://twitch.tv/x'), 'errStream'); eq(P.validate.stream(''), '');
});
await test('completeness and steps', () => {
  const p = { lastName: 'Teszt', firstName: 'Elek', psn: 'Teszt_Elek', input: 'pad', view: 'chase', raceNumber: 7, dr: 'B', sr: 'A' };
  ok(P.isComplete(p)); eq(P.stepsDone(p), 3);
  eq(P.stepsDone({ lastName: 'Teszt', firstName: 'Elek', psn: 'Teszt_Elek' }), 1);
  ok(!P.isComplete({ ...p, sr: null }));
  const c = P.clean({ ...p, psn: ' Teszt_Elek ', roles: { owner: true }, raceNumber: '7' });
  eq(c.psnLower, 'teszt_elek'); eq(c.raceNumber, 7); ok(!('roles' in c), 'roles stripped');
});

// ---------- translations ----------
await test('hu and en have the same keys', () => {
  const a = Object.keys(hu).sort(), b = Object.keys(en).sort();
  eq(a.filter((k) => !b.includes(k)), [], 'missing in en'); eq(b.filter((k) => !a.includes(k)), [], 'missing in hu');
});
await test('every t() key exists', () => {
  const files = []; const walk = (d) => readdirSync(d).forEach((f) => { const p = join(d, f); statSync(p).isDirectory() ? walk(p) : p.endsWith('.js') && files.push(p); });
  walk(join(root, 'js'));
  const src = files.map((f) => readFileSync(f, 'utf8')).join('\n');
  const keys = [...src.matchAll(/\bt\('([A-Za-z0-9_]+)'[,)]/g)].map((m) => m[1]);
  const valErrs = [...readFileSync(join(root, 'js/model/profile.js'), 'utf8').matchAll(/'(err[A-Za-z]+)'/g)].map((m) => m[1]);
  const backendErrs = [...readFileSync(join(root, 'js/services/backend.js'), 'utf8').matchAll(/'(err[A-Za-z]+)'/g)].map((m) => m[1]);
  const seasonErrs = [...readFileSync(join(root, 'js/model/season.js'), 'utf8').matchAll(/'((?:err|entryErr)[A-Za-z]+)'/g)].map((m) => m[1]);
  const dyn = [...P.VIEWS.map((v) => 'view_' + v), ...P.ROLE_KEYS.flatMap((r) => ['role_' + r, 'roleHint_' + r]), 'step0', 'step1', 'step2', 'teamStatus_free', 'teamStatus_perm', 'teamStatus_retired', 'navSeasons', 'navResults', 'navMe', 'navTeams', 'soonSeasons', 'soonResults', 'color1', 'color2', 'hidePassword',
    ...['draft', 'announced', 'pq', 'running', 'finished', 'archived'].map((k) => 'state_' + k), ...['draft', 'soon', 'open', 'closed'].map((k) => 'reg_' + k),
    ...['oneMake', 'special', 'spec'].map((k) => 'format_' + k), ...['in', 'waitlist', 'reserve', 'pending', 'withdrawn', 'over'].map((k) => 'es_' + k),
    ...['attekintes', 'nevezesek', 'fordulok', 'pq', 'tabella', 'ovasok'].map((k) => 'tab_' + k), 'swBasics', 'swRounds', 'swCars', 'swEntry', 'swScoring', 'swReview',
    'cdRegOpens', 'cdRegCloses', 'asDriver', 'asReserve', 'days', 'hours', 'mins', 'secs',
    ...['none', 'draft', 'published'].flatMap((k) => ['sheet_' + k, 'sheetShort_' + k])];
  const raceErrs = [...readFileSync(join(root, 'js/model/race.js'), 'utf8').matchAll(/'(sheetErr[A-Za-z]+)'/g)].map((m) => m[1]);
  dyn.push(...raceErrs, ...['filed', 'review', 'decided', 'published', 'notInvestigated', 'withdrawn'].map((k) => 'pst_' + k),
    ...['none', 'warning', 'time', 'dsq', 'other'].map((k) => 'outcome_' + k), 'conflictInvolved', 'conflictTeammate', 'outOfScope', 'specLocked', 'specUsed',
    ...['lobbiesOut', 'resultsOut', 'regOpen', 'seasonAnnounced', 'protestAgainst', 'protestNew', 'decision', 'promoted', 'reservePending', 'teamApproved', 'teamDeclined', 'raceToday'].map((k) => 'nt_' + k),
    'gsBlocked', 'gsAuth', 'gsQuota', 'gsNotFound', 'gsHttp', 'nt_claimDispute', 'nt_roleGranted', 'impWarnIncomplete', 'impWarnDr', 'impWarnCup', 'impWarnEntry', 'impWarnClash', ...['on', 'off', 'blocked', 'unsupported', 'ios-home'].map((k) => 'pushState_' + k));
  const missing = [...new Set([...keys, ...valErrs, ...backendErrs, ...seasonErrs, ...dyn])].filter((k) => !(k in hu));
  eq(missing, [], 'missing keys');
});

// ---------- test backend ----------
const { createFakeBackend } = await import('../js/services/cloud/fake.js');
await test('fake backend: sign up, profile, PSN lock, roles', async () => {
  const b = createFakeBackend();
  let user = null; b.auth.onChange((u) => { user = u; });
  await b.auth.signUp('uj@pilota.hu', 'jelszo123');
  ok(user === null || user.email === 'uj@pilota.hu');
  const uid = (await b.auth.reload()).uid;
  let threw = null; try { await b.users.save(uid, { psn: 'Teszt_Elek', psnLower: 'teszt_elek' }); } catch (e) { threw = e.code; }
  eq(threw, 'psn-taken');
  await b.users.save(uid, { psn: 'Uj_Pilota', psnLower: 'uj_pilota', lastName: 'Új', firstName: 'Pilóta' });
  eq((await b.users.get(uid)).psn, 'Uj_Pilota');
  ok(!(await b.users.psnFree('uj_pilota', 'someone-else')));
  threw = null; try { await b.users.save(uid, { roles: { admin: true } }); } catch (e) { threw = e.code; }
  eq(threw, 'permission-denied', 'drivers cannot grant themselves roles');
  threw = null; try { await b.teams.save({ name: 'X' }); } catch (e) { threw = e.code; }
  eq(threw, 'permission-denied', 'drivers cannot create teams');
  await b.auth.signOut();
  threw = null; try { await b.auth.signIn('owner@mcsm.test', 'rossz'); } catch (e) { threw = e.code; }
  eq(threw, 'auth/invalid-credential');
  await b.auth.signIn('owner@mcsm.test', 'demo1234');
  const id = await b.teams.save({ name: 'Új csapat', status: 'free', c1: '#ff0000', c2: '#00ff00' });
  ok((await b.teams.list()).some((x) => x.id === id));
  await b.users.save(uid, { roles: { judge: true } });
  eq((await b.users.get(uid)).roles, { judge: true });
  await b.audit.add({ action: 'user.update', target: uid });
  eq((await b.audit.list(5))[0].target, uid);
  threw = null; try { await b.auth.signUp('owner@mcsm.test', 'whatever1'); } catch (e) { threw = e.code; }
  eq(threw, 'auth/email-already-in-use');
});
await test('fake backend: drivers cannot pick permission teams', async () => {
  const b = createFakeBackend();
  await b.auth.signOut(); await b.auth.signIn('pilota@mcsm.test', 'demo1234');
  const perm = (await b.teams.list()).find((x) => x.status === 'perm');
  let threw = null; try { await b.users.save('pilota', { teamId: perm.id }); } catch (e) { threw = e.code; }
  eq(threw, 'permission-denied');
});


// ---------- seasons ----------
const SM = await import('../js/model/season.js');
const TM = await import('../js/model/time.js');
await test('budapest time conversion across DST', () => {
  eq(TM.budapestToMs('2026-10-25T19:00'), Date.parse('2026-10-25T19:00:00+01:00'));
  eq(TM.budapestToMs('2026-10-18T19:00'), Date.parse('2026-10-18T19:00:00+02:00'));
  eq(TM.msToBudapestInput(Date.parse('2026-10-25T18:00:00Z')), '2026-10-25T19:00');
  eq(TM.msToBudapestInput(TM.shiftDay(Date.parse('2026-10-25T19:00:00+01:00'), -2, '20:00')), '2026-10-23T20:00');
});
await test('registration status and reserve mode', () => {
  const s = { state: 'announced', regOpensAt: 1000, regClosesAt: 2000 };
  eq(SM.regStatus(s, 500), 'soon'); eq(SM.regStatus(s, 1500), 'open'); eq(SM.regStatus(s, 2500), 'closed');
  eq(SM.regStatus({ ...s, state: 'draft' }, 1500), 'draft'); eq(SM.regStatus({ ...s, state: 'running' }, 1500), 'closed');
  eq(SM.reserveMode(s, 1500), 'open'); eq(SM.reserveMode(s, 2500), 'approval'); eq(SM.reserveMode({ ...s, state: 'running' }, 9999), 'approval'); eq(SM.reserveMode({ ...s, state: 'finished' }, 9999), 'none');
});
const ent = (uid, order, extra = {}) => ({ uid, type: 'driver', status: 'entered', order, snapshot: { teamId: null, raceNumber: 10 + order }, ...extra });
await test('entry table: cap, waitlist, reserves, withdrawal promotes', () => {
  const s = { cap: 2, waitlist: true };
  const list = [ent('a', 1), ent('b', 2), ent('c', 3), ent('d', 4), ent('r', 5, { type: 'reserve' }), ent('p', 6, { type: 'reserve', approved: false })];
  let tb = SM.entryTable(s, list);
  eq(tb.inList.map((e) => e.uid), ['a', 'b']); eq(tb.waitlist.map((e) => e.uid), ['c', 'd']); eq(tb.byUid.d, { status: 'waitlist', pos: 2 });
  eq(tb.byUid.r.status, 'reserve'); eq(tb.byUid.p.status, 'pending'); ok(tb.full);
  list[0].status = 'withdrawn';
  tb = SM.entryTable(s, list);
  eq(tb.inList.map((e) => e.uid), ['b', 'c'], 'c promoted'); eq(tb.byUid.a.status, 'withdrawn');
  eq(SM.entryTable({ cap: 1, waitlist: false }, [ent('a', 1), ent('b', 2)]).byUid.b.status, 'over');
});
await test('entry blockers', () => {
  const s = { state: 'announced', regOpensAt: 0, regClosesAt: Date.now() + 1e6, cap: 3, waitlist: true, championUid: null };
  const profile = { lastName: 'Teszt', firstName: 'Elek', psn: 'Teszt_Elek', input: 'pad', view: 'chase', raceNumber: 7, dr: 'B', sr: 'A', teamId: 't1' };
  const user = { uid: 'me', emailVerified: true };
  eq(SM.entryBlocker(s, { user: null, profile, entries: [] }), 'entryErrSignIn');
  eq(SM.entryBlocker(s, { user, profile: { ...profile, sr: null }, entries: [] }), 'entryErrProfile');
  eq(SM.entryBlocker(s, { user: { ...user, emailVerified: false }, profile, entries: [] }), 'entryErrVerify');
  eq(SM.entryBlocker(s, { user, profile: { ...profile, suspendedUntil: Date.now() + 1e6 }, entries: [] }), 'entryErrSuspended');
  eq(SM.entryBlocker({ ...s, regClosesAt: 1 }, { user, profile, entries: [] }), 'entryErrClosed');
  eq(SM.entryBlocker({ ...s, regClosesAt: 1 }, { user, profile, entries: [], type: 'reserve' }), '', 'reserve allowed after close');
  eq(SM.entryBlocker(s, { user, profile, entries: [ent('me', 1)] }), 'entryErrAlready');
  eq(SM.entryBlocker(s, { user, profile, entries: [ent('me', 1, { status: 'withdrawn' })] }), '', 'can come back');
  eq(SM.entryBlocker(s, { user, profile: { ...profile, raceNumber: 1 }, entries: [] }), 'errNumberOne');
  eq(SM.entryBlocker({ ...s, championUid: 'me' }, { user, profile: { ...profile, raceNumber: 1 }, entries: [] }), '');
  const mate = (uid, n) => ({ uid, type: 'driver', status: 'entered', order: 1, snapshot: { teamId: 't1', raceNumber: n } });
  eq(SM.entryBlocker(s, { user, profile, entries: [mate('x', 7)] }), 'errNumberTeam');
  eq(SM.entryBlocker(s, { user, profile, entries: [mate('x', 2), mate('y', 3), mate('z', 4)] }), 'entryErrTeamFull');
  eq(SM.entryBlocker({ ...s, cap: 1, waitlist: false }, { user, profile, entries: [ent('x', 1)] }), 'entryErrFull');
});
await test('season defaults and validation', () => {
  const r1 = Date.parse('2026-11-08T19:00:00+01:00');
  const pq = SM.defaultPq(r1);
  eq(pq.map((p) => TM.msToBudapestInput(p.date)), ['2026-11-06T20:00', '2026-11-07T20:00', '2026-11-08T18:00']);
  const w = SM.defaultWindow(r1, pq);
  eq(TM.msToBudapestInput(w.regOpensAt), '2026-10-25T12:00'); eq(w.regClosesAt, pq[0].date);
  const s = SM.newSeason(32);
  eq(s.id, 'mcsm32');
  const errs = SM.validateSeason(s, ['mcsm32']);
  ok(errs.no && errs.name && errs.rounds && errs.car && errs.window, 'empty season errors');
  const good = { ...s, name: 'Teszt', car: 'X', rounds: [{ n: 1, date: r1, track: 'Suzuka' }], ...w };
  eq(SM.validateSeason(good, []), {});
  eq(SM.validateSeason({ ...good, format: 'spec', cars: ['A'] }, []).car, 'errCarPack');
  const copy = SM.newSeason(33, { ...good, cap: 32, rounds: good.rounds });
  eq(copy.cap, 32); eq(copy.rounds, [], 'rounds are not copied');
});
await test('fake backend: entering follows the rules', async () => {
  const b = createFakeBackend();
  await b.auth.signOut(); await b.auth.signIn('pilota@mcsm.test', 'demo1234');
  const s32 = await b.seasons.get('mcsm32');
  ok(s32 && SM.regStatus(s32) === 'open', 'test season open');
  await b.entries.save('mcsm32', 'pilota', { uid: 'pilota', type: 'driver', status: 'entered', order: Date.now(), approved: true, seeded: false, snapshot: {}, absences: [], availability: [], note: '', createdAt: Date.now() });
  eq((await b.entries.get('mcsm32', 'pilota')).status, 'entered');
  let threw = null; try { await b.entries.save('mcsm32', 'pilota', { seeded: true }); } catch (e) { threw = e.code; }
  eq(threw, 'permission-denied', 'drivers cannot seed themselves');
  await b.entries.save('mcsm32', 'pilota', { absences: [2] });
  threw = null; try { await b.entries.save('mcsm31', 'pilota', { uid: 'pilota', type: 'driver', status: 'entered', order: 1, snapshot: {} }); } catch (e) { threw = e.code; }
  eq(threw, 'permission-denied', 'closed season rejects drivers');
  await b.entries.save('mcsm31', 'pilota', { uid: 'pilota', type: 'reserve', status: 'entered', order: 1, approved: false, seeded: false, snapshot: {}, availability: [3] });
  eq((await b.entries.get('mcsm31', 'pilota')).approved, false);
  threw = null; try { await b.seasons.patch('mcsm32', { state: 'running' }); } catch (e) { threw = e.code; }
  eq(threw, 'permission-denied', 'drivers cannot change seasons');
  const drafts = (await b.seasons.list()).filter((x) => x.state === 'draft');
  eq(drafts.length, 0);
});


// ---------- race model ----------
const RM = await import('../js/model/race.js');
await test('time parsing and formatting', () => {
  eq(RM.parseLap('1:57.234'), 117.234); eq(RM.parseLap('57,2'), 57.2); eq(RM.parseLap('abc'), null); eq(RM.parseLap(''), null);
  eq(RM.parseRaceTime('20:13.400'), 1213.4); eq(RM.parseRaceTime('1:00:24.843'), 3624.843);
  eq(RM.parseGap('+3.456'), { gap: 3.456 }); eq(RM.parseGap('+1 kör'), { laps: 1 }); eq(RM.parseGap('+2 laps'), { laps: 2 }); eq(RM.parseGap('+1:02.500'), { gap: 62.5 });
  eq(RM.fmtLap(117.234), '1:57.234'); eq(RM.fmtLap(57.2), '57.200'); eq(RM.fmtRace(3624.843), '1:00:24.843'); eq(RM.fmtRace(1213.4), '20:13.400');
});
await test('PQ ranking, proposal, conflicts', () => {
  const inList = [{ uid: 's1', seeded: true }, { uid: 'a' }, { uid: 'b' }, { uid: 'c' }];
  const docs = [{ id: 'pq1', times: { a: 118.2 } }, { id: 'pq2', times: { b: 117.9 } }];
  const rank = RM.pqRanking(inList, docs);
  eq(rank.map((r) => r.uid), ['s1', 'b', 'a', 'c']); ok(rank[3].missing);
  eq(RM.pqProposal(rank, 2), { A: ['s1', 'b'], B: ['a', 'c'], C: [] });
  eq(RM.pqConflicts(docs, 'pq1'), { b: 'pq2' });
});
await test('buildRounds uses published sheets only', () => {
  const season = { rounds: [{ n: 1 }, { n: 2 }] };
  const docs = [{ n: 1, lobbies: { A: ['x', 'y'], B: [], C: [] }, resultsState: 'final' }, { n: 2, lobbies: { A: ['x', 'y'] } }];
  const sh = (n, S, state) => ({ n, L: 'A', S, state, rows: [{ id: 'y', pos: 2, status: 'OK' }, { id: 'x', pos: 1, status: 'OK' }] });
  const sheets = [sh(1, 'Q', 'published'), sh(1, 'S', 'published'), sh(1, 'GP', 'published'), sh(2, 'Q', 'draft')];
  const built = RM.buildRounds(season, docs, sheets);
  eq(built.length, 1); eq(built[0].results.A.Q.map((r) => r.id), ['x', 'y'], 'sorted by position'); eq(built[0].state, 'final');
  eq(RM.buildRounds(season, docs, sheets, { drafts: true }).length, 2);
});
await test('no-shows and sheet checks', () => {
  const round = { n: 2, lobbies: { A: ['x', 'y', 'z'] }, results: { A: { Q: [{ id: 'x', status: 'OK' }, { id: 'y', status: 'DNS' }], S: [{ id: 'y', status: 'DNS' }], GP: [] } } };
  const ns = RM.noShows(round, [{ uid: 'x', absences: [2] }]);
  ok(ns.has('y') && ns.has('z') && ns.has('x'), 'DNS everywhere, missing, or flagged');
  eq(RM.sheetProblems([{ id: 'a', status: 'OK', best: 90 }], ['a', 'b'], 'Q'), ['sheetErrMissing']);
  eq(RM.sheetProblems([{ id: 'a', status: 'OK', time: 1200 }, { id: 'b', status: 'OK', gap: 2 }, { id: 'c', status: 'OK', gap: 1 }], ['a', 'b', 'c'], 'S'), ['sheetErrOrder']);
  eq(RM.sheetProblems([{ id: 'a', status: 'OK', time: 1200 }, { id: 'b', status: 'OK', laps: 1 }, { id: 'c', status: 'DNF' }], ['a', 'b', 'c'], 'GP'), []);
});
await test('fake backend: race data permissions', async () => {
  const b = createFakeBackend();
  await b.auth.signOut(); await b.auth.signIn('pilota@mcsm.test', 'demo1234');
  ok((await b.race.sheetsList('mcsm31')).every((s) => s.state === 'published'), 'drivers see published only');
  let threw = null; try { await b.race.sheetSave('mcsm31', '3-A-Q', { rows: [] }); } catch (e) { threw = e.code; }
  eq(threw, 'permission-denied');
  await b.auth.signOut(); await b.auth.signIn('owner@mcsm.test', 'demo1234');
  await b.race.sheetSave('mcsm31', '3-A-Q', { n: 3, L: 'A', S: 'Q', rows: [], state: 'draft' });
  ok((await b.race.sheetsList('mcsm31')).some((s) => s.id === '3-A-Q'), 'staff see drafts');
  eq((await b.race.roundsList('mcsm31')).length, 3);
});


// ---------- protests & penalties ----------
const PM = await import('../js/model/protest.js');
await test('protest window: race night 21:30 to Monday 20:00, extendable', () => {
  const round = { date: Date.parse('2026-10-25T19:00:00+01:00') };
  const w = PM.protestWindow(round, {});
  eq(TM.msToBudapestInput(w.opensAt), '2026-10-25T21:30'); eq(TM.msToBudapestInput(w.closesAt), '2026-10-26T20:00');
  eq(PM.windowState(round, {}, w.opensAt - 1), 'soon'); eq(PM.windowState(round, {}, w.opensAt + 1), 'open'); eq(PM.windowState(round, {}, w.closesAt), 'closed');
  eq(PM.windowState(round, { protestClosesAt: w.closesAt + 1000 }, w.closesAt), 'open');
});
await test('eligibility: involved, teammates and scope are excluded', () => {
  const judges = [{ uid: 'j1', roles: { judge: true } }, { uid: 'j2', roles: { judge: true } }, { uid: 'j3', roles: { judge: true }, judgeScope: ['B', 'C'] }, { uid: 'x', roles: { judge: true } }, { uid: 'd', roles: {} }];
  const teams = { j2: 't1', v: 't1', x: null };
  const e = PM.eligibility({ by: 'x', involved: ['v'], L: 'A' }, judges, (u) => teams[u] || null);
  eq(e.map((r) => [r.uid, r.reason]), [['j1', ''], ['j2', 'conflictTeammate'], ['j3', 'outOfScope'], ['x', 'conflictInvolved']]);
  eq(PM.defaultPanel({ by: 'x', involved: ['v'], L: 'B' }, judges, (u) => teams[u] || null), ['j1', 'j3']);
});
await test('tally counts panel votes only and needs three', () => {
  const v = (uid, o, s, tg = 'z') => ({ uid, outcome: o, seconds: s, target: tg });
  let tl = PM.tally([v('a', 'time', 5), v('b', 'time', 5), v('outsider', 'none')], ['a', 'b', 'c']);
  eq(tl.valid, 2); ok(!tl.enough);
  tl = PM.tally([v('a', 'time', 5), v('b', 'time', 5), v('c', 'warning')], ['a', 'b', 'c']);
  ok(tl.enough); eq(tl.leading.outcome, 'time'); ok(!tl.tie);
});
await test('Biblia DSQ triggers', () => {
  const pens = [{ uid: 'a', n: 1, kind: 'time', seconds: 5 }, { uid: 'a', n: 1, kind: 'time', seconds: 3 }, { uid: 'a', n: 2, kind: 'time', seconds: 30 }];
  ok(PM.dsqFlags(pens, 'a', 1, { kind: 'time', seconds: 1 }).autoDsq, 'third penalty in a round');
  ok(!PM.dsqFlags([pens[0]], 'a', 1, { kind: 'time', seconds: 20 }).dsqPossible, '25 s is under 30');
  ok(PM.dsqFlags([pens[0]], 'a', 1, { kind: 'time', seconds: 25 }).dsqPossible, '30 s total');
});
await test('penalties reorder results', () => {
  const rows = [{ id: 'a', pos: 1, status: 'OK', time: 1200 }, { id: 'b', pos: 2, status: 'OK', gap: 2 }, { id: 'c', pos: 3, status: 'OK', gap: 4 }, { id: 'd', pos: 4, status: 'OK', laps: 1 }, { id: 'e', pos: 5, status: 'DNF' }];
  const out = RM.applyPenalties(rows, 'GP', [{ uid: 'a', kind: 'time', seconds: 5, S: 'GP' }, { uid: 'c', kind: 'dsq' }]);
  eq(out.map((r) => [r.id, r.pos, r.status]), [['b', 1, 'OK'], ['a', 2, 'OK'], ['d', 3, 'OK'], ['c', 4, 'DSQ'], ['e', 5, 'DNF']]);
  eq(out[0].time, 1202); eq(out[1].gap, 3); eq(out[1].penalty, 5); eq(out[2].laps, 1);
  eq(RM.applyPenalties(rows, 'S', [{ uid: 'a', kind: 'time', seconds: 5, S: 'GP' }]).map((r) => r.id), ['a', 'b', 'c', 'd', 'e'], 'other session untouched');
  eq(RM.applyPenalties(rows, 'GP', [{ uid: 'a', kind: 'warning' }]), rows, 'warnings change nothing');
});
await test('spec picks', () => {
  const season = { cars: ['X', 'Y', 'Z'], rounds: [{ n: 1, date: Date.now() + 1e6 }, { n: 2, date: Date.now() - 1 }] };
  const picks = [{ teamId: 't', n: 2, car: 'X' }];
  eq(PM.specPickError(season, picks, 't', 1, 'X'), 'specUsed'); eq(PM.specPickError(season, picks, 't', 1, 'Y'), '');
  eq(PM.specPickError(season, picks, 't', 2, 'Y'), 'specLocked'); eq(PM.specPickError(season, picks, 't', 1, 'Q'), 'errChoose');
});
await test('fake backend: protest permissions', async () => {
  const b = createFakeBackend();
  await b.auth.signOut(); await b.auth.signIn('pilota@mcsm.test', 'demo1234');
  ok((await b.protests.list('mcsm31')).every((p) => p.status === 'published'), 'drivers see published cases');
  let threw = null; try { await b.protests.save('mcsm31', null, { n: 2, L: 'A', S: 'S', by: 'pilota', type: 'driver', status: 'filed', involved: [] }); } catch (e) { threw = e.code; }
  eq(threw, 'permission-denied', 'not entered in MCSM31');
  threw = null; try { await b.votes.list('mcsm31', 'p2'); } catch (e) { threw = e.code; }
  eq(threw, 'permission-denied', 'votes are private');
  threw = null; try { await b.penalties.save('mcsm31', { uid: 'x', n: 1, kind: 'time', seconds: 5 }); } catch (e) { threw = e.code; }
  eq(threw, 'permission-denied');
  await b.auth.signOut(); await b.auth.signIn('owner@mcsm.test', 'demo1234');
  eq((await b.votes.list('mcsm31', 'p2')).length, 2);
});


// ---------- 0.5 ----------
await test('promotion with no-shows: they drop first and are never promoted', () => {
  const ids = (p, n) => Array.from({ length: n }, (_, i) => p + i);
  const lobbies = { A: ids('a', 4), B: ids('b', 4), C: ids('c', 4) };
  const rows = (a) => a.map((id, i) => ({ id, pos: i + 1, status: 'OK' }));
  const results = {}; for (const L of ['A', 'B', 'C']) results[L] = { Q: rows(lobbies[L]), S: rows(lobbies[L]), GP: rows(lobbies[L]) };
  const rd = { lobbies, results };
  eq(S.promoteRelegate(rd, 1), { A: ['a0', 'a1', 'a2', 'b0'], B: ['a3', 'b1', 'b2', 'c0'], C: ['b3', 'c1', 'c2', 'c3'] });
  const r = S.promoteRelegate(rd, 1, S.DEFAULT_TABLE, new Set(['a0', 'b0']));
  ok(!r.A.includes('a0') && r.B.includes('a0'), 'absent A winner drops'); ok(!r.A.includes('b0') && r.A.includes('b1'), 'absent B winner not promoted');
  eq([r.A.length, r.B.length, r.C.length], [4, 4, 4]);
});
await test('fake GridStats client answers in the documented shape', async () => {
  const { fakeGridstats } = await import('../js/services/gridstats.js');
  const g = fakeGridstats();
  const p1 = await g.carsPage(1); ok(p1.data.length && p1.data[0].name && p1.data[0].class && p1.next_page_url, 'cars page');
  const r = await g.racers(['IGTSH_Saby', 'MGTK_Dudu']); ok(r.drivers.every((d) => d.PSN_ID && d.DR && d.SR && d.stats), 'racers');
});
await test('fake backend: notifications and admin-only settings', async () => {
  const b = createFakeBackend();
  await b.auth.signOut(); await b.auth.signIn('pilota@mcsm.test', 'demo1234');
  let threw = null; try { await b.notify.add({ kind: 'season', sid: 'mcsm31', type: 'resultsOut' }); } catch (e) { threw = e.code; }
  eq(threw, 'permission-denied', 'drivers cannot broadcast');
  await b.notify.add({ kind: 'users', uids: ['owner'], type: 'protestAgainst', params: {} });
  threw = null; try { await b.config.get('gridstats'); } catch (e) { threw = e.code; }
  eq(threw, 'permission-denied', 'token is admin-only');
  await b.auth.signOut(); await b.auth.signIn('owner@mcsm.test', 'demo1234');
  ok((await b.notify.list('owner')).some((n) => n.type === 'protestAgainst'), 'owner sees personal notice');
  await b.config.save('gridstats', { token: 'x' }); eq((await b.config.get('gridstats')).token, 'x');
});


await test('GT7 Info car list: CSV, makers, classes', async () => {
  const G = await import('../js/services/gt7info.js');
  eq(G.parseCsv('a,b\n1,"x, y"\n'), [['a', 'b'], ['1', 'x, y']]);
  eq(G.classFromName('FT-1 VGT (Gr.3)'), 'Gr.3'); eq(G.classFromName('WRX Gr.B Rally Car'), 'Gr.B'); eq(G.classFromName('Corvette C7 Gr.3 Road Car'), '');
  eq(G.classFromName("458 Italia GT3 '13"), 'Gr.3'); eq(G.classFromName("911 GT3 R (992) '22"), 'Gr.3'); eq(G.classFromName("911 GT3 RS (992) '22"), ''); eq(G.classFromName("911 GT3 (996) '01"), '');
  const cat = G.buildCatalog('ID,ShortName,Maker\n2187,FT-1 VGT (Gr.3),43\n3311,911 RSR (991) \'17,136\n', 'ID,Name\n43,Toyota\n136,Porsche', 'ID,Group\n3311,3');
  eq(cat.map((c) => [c.name, c.cls]), [["Porsche 911 RSR (991) '17", 'Gr.3'], ['Toyota FT-1 VGT (Gr.3)', 'Gr.3']]);
  const fake = await G.fakeCatalog(); eq(fake.length, 20); ok(fake.some((c) => /Supra/.test(c.name)));
});


await test('DR gauge position and next class', async () => {
  const R = await import('../js/ui/rating.js');
  eq(R.drPosition(0), 0); eq(R.drPosition(4000), 0.2); eq(R.drPosition(7000), 0.3); eq(R.drPosition(50000), 0.8); eq(R.drPosition(250000), 1);
  eq(R.drPosition(null, 'B'), 0.5); eq(R.drPosition(null, 'E'), 0.02);
  eq(R.nextClass(9000), { cls: 'B', need: 1000 }); eq(R.nextClass(61000), null);
});


// ---------- 0.6 ----------
const IM = await import('../js/model/import.js');
await test('import: merge duplicates, teams, seasons, entries, PQ, totals', () => {
  const profiles = [
    { id: 'p1', psn_id: 'MGTK_HOPPÁ', firstname: 'Attila', lastname: 'PÁL', email: 'a@x.hu', dr: 'A', sr: 'S', controlling: 'steering_wheel', view: 'tv', number: 82, mcsm_team: 'SUFNI TUNING', gt_team: 'MGTK ', role: 'user', created_at: '2026-03-01T00:00:00Z' },
    { id: 'p2', psn_id: 'MGTK_Hoppá', firstname: 'Attila ', lastname: 'PÁL', email: 'b@x.hu', dr: 'A', sr: 'S', controlling: 'steering_wheel', view: 'tv', number: 82, mcsm_team: 'SUFNI TUNING', gt_team: 'MGTK', role: 'user', created_at: '2026-08-01T00:00:00Z' },
    { id: 'p3', psn_id: 'IGTSH_Saby', firstname: 'Saby', lastname: 'KOVÁCS', email: null, dr: 'S', sr: 'S', controlling: 'controller', view: 'vr', number: 7, mcsm_team: 'TARTALÉKPILÓTA', gt_team: null, role: 'admin', created_at: '2026-01-01T00:00:00Z' },
  ];
  const cups = [{ id: 'c1', name: '🏆MCSM30 • ELANTRA TCR [GR.4]', is_active: false, lobby_size: 16, image_url: '', created_at: '2026-08-01T00:00:00Z', description: '' }];
  const races = [{ id: 'q', cup_id: 'c1', type: 'PREQUALIFICATION', title: 'PREQUALI', location: 'MOUNT PANORAMA', start: '2026-09-11', start_time: '20:00:00' },
    { id: 'r1', cup_id: 'c1', type: 'NAGYFUTAM', title: 'SAINT CROIX B2', location: 'SAINT CTROIX B REVERSE', start: '2026-09-13', start_time: '19:00:00' }];
  const race_results = [{ race_id: 'q', profile_id: 'p2', position: 1, points: 0, time_result: '2:12.484', status: 'A lobby' }, { race_id: 'q', profile_id: 'p3', position: 2, points: 0, time_result: 'KIEMELT', status: 'KIEMELT' },
    { race_id: 'r1', profile_id: 'p2', position: 2, points: 600, fastest_lap: false }, { race_id: 'r1', profile_id: 'p3', position: 1, points: 676, fastest_lap: true }];
  const cup_applications = [{ cup_id: 'c1', profile_id: 'p2', created_at: '2026-08-02T00:00:00Z', mcsm_team: 'SUFNI TUNING', gt_team: 'MGTK' }, { cup_id: 'c1', profile_id: 'p3', created_at: '2026-08-03T00:00:00Z', mcsm_team: 'TARTALÉKPILÓTA', gt_team: '' }];
  const p = IM.transformExport({ profiles, cups, races, race_results, cup_applications });
  eq(p.users.map((u) => u.id), ['p1', 'p3'], 'duplicate folded into the capitalised one');
  eq(p.merged[0].kept, 'MGTK_HOPPÁ');
  eq(p.authUsers.map((a) => a.uid), ['p1']); eq(p.noEmail, ['IGTSH_Saby']);
  const u1 = p.users[0].data; eq([u1.lastName, u1.input, u1.view, u1.gtTeamId, u1.teamId], ['Pál', 'wheel', 'tv', 'MGTK', 'sufni-tuning']);
  const u3 = p.users[1].data; eq([u3.dr, u3.input, u3.view, u3.teamId, u3.roles], [null, 'pad', 'vr', null, { admin: true }]);
  eq(p.seasons[0].id, 'mcsm30'); eq(p.seasons[0].data.name, 'ELANTRA TCR [GR.4]');
  eq([p.seasons[0].data.rounds[0].trackId, p.seasons[0].data.rounds[0].layout], ['stcroix', 'B Reverse']);
  eq(p.pq[0].data.times, { p1: 132.484 }, 'PQ time re-keyed to the kept profile');
  eq(p.entries.map((e) => [e.uid, e.data.type, e.data.seeded]), [['p1', 'driver', false], ['p3', 'reserve', true]]);
  eq(p.rounds[0].data.legacy.rows.map((r) => [r.id, r.pos, r.points, r.fl]), [['p3', 1, 676, true], ['p1', 2, 600, false]]);
  eq(p.rounds[0].data.lobbies.A, ['p1', 'p3']);
  const ops = IM.planOps(p);
  const iLock = ops.findIndex((o) => o.path[0] === 'psnIds'), iUser = ops.findIndex((o) => o.path[0] === 'users');
  ok(iLock < iUser, 'PSN lock written before the profile');
  ok(IM.planOps(p, { claimed: new Set(['p1']) }).every((o) => !(o.path[0] === 'users' && o.path[1] === 'p1')), 'claimed profiles untouched');
});
await test('legacy rounds feed the standings', () => {
  const rd = { legacy: [{ id: 'x', pos: 1, points: 676 }, { id: 'y', pos: 2, points: 600 }] };
  const st = S.driverStandings([rd, rd], ['x', 'y']);
  eq(st.map((r) => [r.id, r.total, r.wins]), [['x', 1352, 2], ['y', 1200, 0]]);
});
await test('track matching against the GridStats list', async () => {
  const { matchTrack } = await import('../js/data/track-match.js');
  const cat = [{ name_short: 'Autodrome Lago Maggiore', full_name: 'Autodrome Lago Maggiore - East', trackphoto: 'p1', track_map: 'm1' }, { name_short: 'Autodrome Lago Maggiore', full_name: 'Autodrome Lago Maggiore - Full Course', trackphoto: 'p2', track_map: 'm2' }, { name_short: 'Dragon Trail', full_name: 'Dragon Trail - Gardens', trackphoto: 'p3', track_map: 'm3' }];
  eq(matchTrack({ track: 'Autodrome Lago Maggiore', layout: 'East' }, cat).map, 'm1');
  eq(matchTrack({ track: 'Dragon Trail', layout: 'Gardens' }, cat).photo, 'p3');
  eq(matchTrack({ track: 'Suzuka Circuit', layout: '' }, cat), null);
});
await test('roles: one level down', async () => {
  const b = createFakeBackend();
  await b.auth.signOut(); await b.auth.signIn('owner@mcsm.test', 'demo1234');
  let threw = null; try { await b.admin.call('ping', {}); } catch (e) { threw = e.code; } eq(threw, null, 'owner may call the function');
  await b.auth.signOut(); await b.auth.signIn('pilota@mcsm.test', 'demo1234');
  threw = null; try { await b.admin.call('ping', {}); } catch (e) { threw = e.code; } eq(threw, 'fn-forbidden');
});


await test('0.6.1: GridStats miles, GP layouts, location photo fallback', async () => {
  const { matchTrack } = await import('../js/data/track-match.js');
  const cat = [
    { name_short: 'Circuit de Spa-Francorchamps', full_name: 'Circuit de Spa-Francorchamps', trackphoto: 'spa.webp', track_map: 'spa.svg', track_length: 4.35, corner_count: 21 },
    { name_short: 'Circuit de Barcelona-Catalunya', full_name: 'Circuit de Barcelona-Catalunya - Rallycross Layout', trackphoto: 'bcn.webp', track_map: 'rx.svg', track_length: 0.7 },
    { name_short: 'Circuit de Barcelona-Catalunya', full_name: 'Circuit de Barcelona-Catalunya - GP Layout', trackphoto: 'bcn.webp', track_map: 'gp.svg', track_length: 2.89 },
    { name_short: 'Mount Panorama', full_name: 'Mount Panorama Motor Racing Circuit', trackphoto: 'bathurst.webp', track_map: 'b.svg', track_length: 3.86 },
  ];
  const spa = matchTrack({ track: 'Circuit de Spa-Francorchamps', layout: '' }, cat);
  eq([spa.map, spa.lengthKm], ['spa.svg', 7]);
  eq(matchTrack({ track: 'Circuit de Barcelona-Catalunya', layout: 'Grand Prix Layout' }, cat).map, 'gp.svg');
  const nordic = matchTrack({ track: 'Circuit de Barcelona-Catalunya', layout: 'National Layout' }, cat);
  eq([nordic.photo, nordic.map], ['bcn.webp', null], 'photo for the place, no map for an unknown layout');
  eq(matchTrack({ track: 'Mount Panorama', layout: '' }, cat).map, 'b.svg');
});
await test('0.6.1: import skips empty fields and links existing members', () => {
  const profiles = [{ id: 'old-me', psn_id: 'IGTSH_Reechey-', firstname: 'Richárd', lastname: 'HORVÁTH', email: 'me@x.hu', dr: 'A+', sr: 'S', controlling: null, view: null, number: 21, mcsm_team: '', gt_team: 'IGTSH', role: 'admin', created_at: '2026-01-01T00:00:00Z' },
    { id: 'old-x', psn_id: 'Ragnar_MEDVE', firstname: null, lastname: null, email: 'r@x.hu', dr: null, sr: null, controlling: null, view: null, number: null, mcsm_team: null, gt_team: null, role: 'user', created_at: '2026-01-01T00:00:00Z' }];
  const p = IM.transformExport({ profiles, cups: [], races: [], race_results: [], cup_applications: [] }, { existing: { 'igtsh_reechey-': 'new-uid' } });
  eq(p.linked.map((l) => [l.psn, l.to]), [['IGTSH_Reechey-', 'new-uid']]);
  eq(p.users.map((u) => u.id), ['old-x'], 'existing member not duplicated');
  eq(p.authUsers.map((u) => u.uid), ['old-x']);
  ok(!('input' in p.users[0].data) && !('dr' in p.users[0].data), 'no null fields written');
});

console.log(failed.length ? failed.map((f) => '✗ ' + f).join('\n') : '');
console.log(`${passed} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
