// model/import.js
// Turns the old site's export (Supabase tables as JSON) into MCSM documents. Pure: no I/O,
// so it can be previewed in the browser and tested. Re-running it gives the same IDs, so a
// second upload (e.g. with more emails) updates instead of duplicating.
//
// Old IDs are kept as user IDs: the Cloud Function then creates each sign-in account with
// that same ID, so profiles, entries and results line up with no remapping.
import { TRACKS } from '../data/tracks.js';
import { budapestToMs } from './time.js';
import { DEFAULT_TABLE } from '../engine/scoring.js';
import { isComplete } from './profile.js';

const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '');
export const norm = (s) => fold(s).toLowerCase().replace(/[^a-z0-9]+/g, '');
export const slug = (s) => fold(s).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const titleCase = (s) => String(s || '').trim().toLocaleLowerCase('hu').replace(/(^|[\s-])(\p{L})/gu, (m, a, b) => a + b.toLocaleUpperCase('hu'));
const stripEmoji = (s) => String(s || '').replace(/[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\uFE0F\u200D]/gu, '').trim();
const hue = (s) => { let x = 0; for (const c of String(s)) x = (x * 31 + c.charCodeAt(0)) | 0; return Math.abs(x) % 360; };

const NO_TEAM = new Set(['', 'NO TEAM', 'NINCS', 'TARTALEKPILOTA', 'TARTALÉKPILÓTA']);
const TEAM_ALIASES = { CHOSENONES: 'THE CHOSEN ONES' };
const DRS = ['S', 'A+', 'A', 'B', 'C', 'D', 'E'], SRS = ['S', 'A', 'B', 'C', 'D', 'E'];
export const LAP_RE = /^(\d{1,2}):(\d{2})[.,](\d{1,3})$/;
export const lapToSec = (s) => { const m = LAP_RE.exec(String(s || '').trim()); return m ? +m[1] * 60 + +m[2] + +('0.' + m[3]) : null; };

export function lobbyFromStatus(s) {
  const v = fold(s).toUpperCase().replace(/\s+/g, ' ').trim();
  if (v === 'KIEMELT') return 'A';
  const m = /^([ABC])\s*(LOBBY|KOBBY)?$/.exec(v);
  return m ? m[1] : null;
}

// Best GT7 track + layout for an old race's title/location ("GRAND VALLEY HIGHWAY-1").
const ALIASES = { stcroix: ['saint croix', 'sainte croix', 'st croix'], kyoto: ['kyoto'], dragon: ['dragon trail'], grandvalley: ['grand valley'], sardegna: ['sardegna', 'sardinia'], maggiore: ['lago maggiore'], nurburgring: ['nurburgring', 'nordschleife'], interlagos: ['interlagos'], spa: ['spa francorchamps', 'spa'], panorama: ['mount panorama', 'bathurst'], redbull: ['red bull ring'], catalunya: ['barcelona', 'catalunya'] };
export function matchTrack(...names) {
  let best = null;
  const reverse = names.some((x) => /reverse/i.test(x || ''));
  for (const raw of names) {
    const n = norm(raw);
    if (!n) continue;
    for (const tr of TRACKS) {
      const keys = [tr.name, tr.name.replace(/^(circuit de |autodrome |autodromo |autódromo de )/i, ''), tr.id, ...(ALIASES[tr.id] || [])].map(norm).filter((k) => k.length >= 3).sort((a, b) => b.length - a.length);
      const key = keys.find((k) => n.startsWith(k) || n.includes(k));
      if (!key) continue;
      let layout = tr.layouts[0], lscore = 0;
      for (const l of tr.layouts) { const ln = norm(l); if (ln.length >= 2 && n.includes(ln) && ln.length > lscore) { layout = l; lscore = ln.length; } }
      if (lscore === 0 && tr.layouts.some((l) => l.length === 1)) {
        const tail = n.slice(n.indexOf(key) + key.length).replace(/^.*?([abc])\d*$/, '$1');
        const one = tr.layouts.find((l) => l.toLowerCase() === tail);
        if (one) { layout = one; lscore = 1; }
        if ((reverse || /reverse/.test(n)) && one) { const rev = tr.layouts.find((l) => l.toLowerCase() === one.toLowerCase() + ' reverse'); if (rev) layout = rev; }
      }
      const score = key.length * 10 + lscore;
      if (!best || score > best.score) best = { score, trackId: tr.id, track: tr.name, layout, cc: tr.cc };
    }
    if (best) break;
  }
  if (best) { delete best.score; return best; }
  return { trackId: 'other', track: titleCase(names.find(Boolean) || ''), layout: '', cc: null };
}

// existing: { psnLower: uid } of people who already have a profile on the new site. Their old
// history is attached to that profile instead of creating a second one.
// existingProfiles: { uid: profile } for those members, used for their entry snapshots.
export function transformExport(files, { existing = {}, existingProfiles = {} } = {}) {
  const warnings = [];
  const profiles = files.profiles || [], cups = files.cups || [], races = files.races || [], results = files.race_results || [], apps = files.cup_applications || [];

  // --- duplicate PSN IDs: keep the fully capitalised one (or the oldest), fold the rest into it
  const byPsn = {};
  profiles.forEach((p) => { const k = (p.psn_id || '').trim().toLowerCase(); if (k) (byPsn[k] = byPsn[k] || []).push(p); });
  const remap = {}; const merged = [];
  Object.values(byPsn).filter((g) => g.length > 1).forEach((g) => {
    const keep = g.find((p) => p.psn_id === p.psn_id.toUpperCase()) || g.slice().sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))[0];
    g.filter((p) => p !== keep).forEach((p) => { remap[p.id] = keep.id; merged.push({ kept: keep.psn_id, dropped: p.psn_id, keptId: keep.id, droppedId: p.id, droppedHadEmail: !!p.email }); });
  });
  // Already on the new site (same PSN ID): keep their new account, move the history onto it.
  const linked = [];
  profiles.forEach((p) => { const k = (p.psn_id || '').trim().toLowerCase(); const uid = k && existing[k]; if (uid && !remap[p.id]) { remap[p.id] = uid; linked.push({ psn: p.psn_id, from: p.id, to: uid }); } });
  Object.keys(remap).forEach((k) => { if (remap[remap[k]]) remap[k] = remap[remap[k]]; });
  const pid = (id) => remap[id] || id;
  // The old site's own system account isn't a driver.
  const live = profiles.filter((p) => !remap[p.id] && !/^superuser/i.test(p.psn_id || ''));

  // --- teams
  const teamName = (n) => { const v = String(n || '').trim().toUpperCase(); if (NO_TEAM.has(fold(v)) || NO_TEAM.has(v)) return null; return TEAM_ALIASES[v.replace(/\s+/g, '')] || TEAM_ALIASES[v] || v; };
  const teams = {};
  const teamIdOf = (n) => { const name = teamName(n); if (!name) return null; const id = slug(name); if (!teams[id]) { const hh = hue(name); teams[id] = { id, name, status: 'free', c1: `hsl(${hh} 78% 56%)`, c2: `hsl(${(hh + 160) % 360} 70% 62%)` }; } return id; };
  const gtTeams = {};
  const gtIdOf = (n) => { const name = String(n || '').trim().toUpperCase(); if (!name) return null; const tag = name.split(/\s+/)[0].replace(/[^A-Z0-9_-]/g, '').slice(0, 12); if (!tag) return null; if (!gtTeams[tag]) gtTeams[tag] = { id: tag, tag, name }; return tag; };

  // --- users
  const users = [], authUsers = [], noEmail = [];
  live.forEach((p) => {
    const dr = DRS.includes(String(p.dr || '').toUpperCase()) ? String(p.dr).toUpperCase() : null;
    const sr = SRS.includes(String(p.sr || '').toUpperCase()) ? String(p.sr).toUpperCase() : null;
    if (p.dr && !dr) warnings.push({ key: 'impWarnDr', psn: p.psn_id, value: p.dr });
    const psn = (p.psn_id || '').trim();
    const data = {
      firstName: titleCase(p.firstname), lastName: titleCase(p.lastname), psn: psn || null, psnLower: psn ? psn.toLowerCase() : null,
      input: p.controlling === 'controller' ? 'pad' : p.controlling === 'steering_wheel' ? 'wheel' : null,
      view: ['tv', 'vr', 'monitor'].includes(p.view) ? p.view : null,
      raceNumber: Number.isInteger(p.number) && p.number >= 1 && p.number <= 999 ? p.number : null,
      dr, sr, gtTeamId: gtIdOf(p.gt_team), teamId: teamIdOf(p.mcsm_team), lang: 'hu',
      imported: true, legacyId: p.id, createdAt: Date.parse(p.created_at) || Date.now(), updatedAt: Date.now(),
      ...(p.role === 'admin' ? { roles: { admin: true } } : {}),
    };
    data.complete = isComplete(data);
    Object.keys(data).forEach((k) => { if (data[k] == null) delete data[k]; });
    if (!data.complete) warnings.push({ key: 'impWarnIncomplete', psn: psn || p.id });
    users.push({ id: p.id, data, email: (p.email || '').trim().toLowerCase() || null });
    if (p.email) authUsers.push({ uid: p.id, email: p.email.trim().toLowerCase(), displayName: `${data.lastName} ${data.firstName}`.trim() });
    else noEmail.push(psn || p.id);
  });
  const userById = Object.fromEntries(users.map((u) => [u.id, u]));
  Object.entries(existingProfiles).forEach(([uid, prof]) => { if (!userById[uid]) userById[uid] = { id: uid, data: prof, existing: true }; });

  // --- seasons
  const seasons = [], entries = [], rounds = [], pq = [];
  cups.forEach((c) => {
    const m = /MCSM\s*(\d+)/i.exec(c.name || '');
    if (!m) { warnings.push({ key: 'impWarnCup', name: c.name }); return; }
    const no = Number(m[1]), sid = 'mcsm' + no;
    const name = stripEmoji(c.name).replace(/MCSM\s*\d+\s*[:•\-–]?\s*/i, '').trim();
    const cr = races.filter((r) => r.cup_id === c.id).sort((a, b) => String(a.start).localeCompare(String(b.start)));
    const when = (r) => budapestToMs(`${r.start}T${String(r.start_time || '19:00').slice(0, 5)}`);
    const main = cr.filter((r) => r.type !== 'PREQUALIFICATION');
    const pqRace = cr.find((r) => r.type === 'PREQUALIFICATION');
    const seasonRounds = main.map((r, i) => ({ n: i + 1, date: when(r), ...matchTrack(r.title, r.location), car: '', legacyId: r.id }));
    seasons.push({ id: sid, data: {
      id: sid, no, name, description: (c.description || '').trim(), coverUrl: c.image_url || '', state: c.is_active ? 'running' : 'finished', featured: !!c.is_active,
      format: 'oneMake', car: '', cars: [], rounds: seasonRounds, pq: pqRace ? [{ id: 'pq1', name: 'PQ', date: when(pqRace) }] : [],
      regOpensAt: null, regClosesAt: null, cap: 48, waitlist: true, lobbySize: c.lobby_size || 16, promote: 2, championUid: null,
      points: JSON.parse(JSON.stringify(DEFAULT_TABLE)), championships: { teams: true, gt: ['MGTK'] }, imported: true, legacyId: c.id,
      createdAt: Date.parse(c.created_at) || Date.now(),
    } });
    // PQ times and round-1 lobbies
    const seeded = new Set(); const lob = { A: [], B: [], C: [] }; const times = {};
    if (pqRace) {
      results.filter((x) => x.race_id === pqRace.id).sort((a, b) => (a.position || 999) - (b.position || 999)).forEach((x) => {
        const uid = pid(x.profile_id);
        if (fold(x.status).toUpperCase() === 'KIEMELT' || fold(x.time_result).toUpperCase() === 'KIEMELT') seeded.add(uid);
        const t = lapToSec(x.time_result); if (t != null) times[uid] = t;
        const L = lobbyFromStatus(x.status); if (L && !lob[L].includes(uid)) lob[L].push(uid);
      });
      pq.push({ sid, id: 'pq1', data: { times } });
    }
    // entries
    const seen = new Set();
    apps.filter((a) => a.cup_id === c.id).sort((a, b) => String(a.created_at).localeCompare(String(b.created_at))).forEach((a, i) => {
      const uid = pid(a.profile_id); if (seen.has(uid)) return; seen.add(uid);
      const u = userById[uid]; if (!u) { warnings.push({ key: 'impWarnEntry', id: a.profile_id }); return; }
      const reserve = fold(String(a.mcsm_team || '').toUpperCase()) === 'TARTALEKPILOTA';
      const d = u.data;
      const snap = { firstName: d.firstName ?? null, lastName: d.lastName ?? null, psn: d.psn ?? null, psnLower: d.psnLower ?? null, raceNumber: d.raceNumber ?? null, dr: d.dr ?? null, sr: d.sr ?? null, teamId: teamIdOf(a.mcsm_team) ?? d.teamId ?? null, gtTeamId: gtIdOf(a.gt_team) ?? d.gtTeamId ?? null, input: d.input ?? null };
      const at = Date.parse(a.created_at) || i;
      entries.push({ sid, uid, data: { uid, type: reserve ? 'reserve' : 'driver', status: 'entered', order: at, approved: true, seeded: seeded.has(uid), snapshot: snap, availability: [], absences: [], note: '', createdAt: at } });
    });
    // rounds: old results are round totals, kept as such ("legacy")
    main.forEach((r, i) => {
      const rows = [];
      const taken = new Map();
      results.filter((x) => x.race_id === r.id).forEach((x) => {
        const uid = pid(x.profile_id);
        const row = { id: uid, pos: x.position || 999, points: x.points || 0, fl: !!x.fastest_lap, status: fold(x.status).toUpperCase() === 'DNS' ? 'DNS' : 'OK' };
        const prev = taken.get(uid);
        if (prev) { warnings.push({ key: 'impWarnClash', id: uid, n: i + 1, sid }); if (row.pos < prev.pos) Object.assign(prev, row); return; }
        taken.set(uid, row); rows.push(row);
      });
      rows.sort((a, b) => a.pos - b.pos);
      const hasResults = rows.length > 0;
      rounds.push({ sid, n: i + 1, data: { n: i + 1, lobbies: i === 0 ? lob : { A: [], B: [], C: [] }, lobbiesPublished: i === 0 && lob.A.length > 0, resultsState: hasResults ? (c.is_active ? 'provisional' : 'final') : 'none', ...(hasResults ? { legacy: { rows } } : {}) } });
    });
  });

  return { users, authUsers, noEmail, merged, linked, teams: Object.values(teams), gtTeams: Object.values(gtTeams), seasons, entries, rounds, pq, warnings };
}

// Firestore writes for a plan. existing: ids of profiles already claimed (left untouched).
export function planOps(plan, { claimed = new Set() } = {}) {
  const ops = [];
  plan.gtTeams.forEach((g) => ops.push({ path: ['gtTeams', g.id], data: g }));
  plan.teams.forEach((tm) => ops.push({ path: ['teams', tm.id], data: { ...tm, createdAt: Date.now() }, merge: true }));
  plan.users.forEach((u) => {
    if (claimed.has(u.id)) return;
    // The PSN lock goes first: the rules check it exists when the profile is written.
    if (u.data.psnLower) ops.push({ path: ['psnIds', u.data.psnLower], data: { uid: u.id } });
    ops.push({ path: ['users', u.id], data: u.data, merge: true });
    if (u.email) ops.push({ path: ['users', u.id, 'private', 'account'], data: { email: u.email } });
  });
  plan.seasons.forEach((s) => ops.push({ path: ['seasons', s.id], data: s.data }));
  plan.entries.forEach((e) => ops.push({ path: ['seasons', e.sid, 'entries', e.uid], data: e.data }));
  plan.rounds.forEach((r) => ops.push({ path: ['seasons', r.sid, 'rounds', String(r.n)], data: r.data }));
  plan.pq.forEach((p) => ops.push({ path: ['seasons', p.sid, 'pq', p.id], data: p.data }));
  return ops;
}
