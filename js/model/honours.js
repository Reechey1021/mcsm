// model/honours.js
// Championship podiums (overall drivers, teams, MGTK) per season, and who won what.
// Old seasons come from the hall-of-fame sheet, where drivers are written as "PSN - Name" with
// spelling and PSN changes over the years, so people are matched by name (accent- and
// typo-tolerant), then by the PSN ID without its team prefix.
const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const words = (s) => fold(s).split(/[^a-z0-9]+/).filter((w) => w.length > 1);
export const compact = (s) => fold(s).replace(/[^a-z0-9]+/g, '');

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 2) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}
const wordMatch = (a, b) => a === b || (a.length >= 5 && b.length >= 5 && lev(a, b) <= 1);
// "Torda Hornyák" = "Hornyàk Torda", "Hájos Christoper" = "Hàjos Christopher"
export function sameName(a, b) {
  const x = words(a), y = words(b);
  if (x.length < 2 || y.length < 2) return false;
  return x.every((w) => y.some((v) => wordMatch(w, v))) && y.every((w) => x.some((v) => wordMatch(w, v)));
}
// "MGTK_Baboca96" -> "baboca96", "IGTSH_Saby" -> "saby"
export const psnCore = (psn) => { const p = String(psn || '').trim(); const m = /^([A-Z0-9]{2,6})_(.+)$/.exec(p); return fold(m ? m[2] : p); };
export function samePerson(a, b) {
  if (a.uid && b.uid) return a.uid === b.uid;
  if (a.name && b.name && sameName(a.name, b.name)) return true;
  const ca = psnCore(a.psn), cb = psnCore(b.psn);
  return !!ca && ca.length >= 4 && (ca === cb || ca.replace(/\d+$/, '') === cb.replace(/\d+$/, ''));
}
export function sameTeam(a, b) {
  const x = compact(a).replace(/^igtsh/, ''), y = compact(b).replace(/^igtsh/, '');
  if (!x || !y) return false;
  return x === y || (Math.min(x.length, y.length) >= 7 && lev(x, y) <= 2);
}

// seasons: [{ no, date, title, drivers:[{psn,name,uid?}x3], teams:[name|null x3], mgtk:[...] }]
// Groups everyone who ever reached a podium into people with medal counts.
export function driverMedals(seasons) {
  const people = [];
  seasons.forEach((s) => (s.drivers || []).forEach((d, i) => {
    if (!d) return;
    let p = people.find((x) => samePerson(x, d));
    if (!p) { p = { name: d.name, psn: d.psn, uid: d.uid || null, medals: [0, 0, 0], seasons: [[], [], []] }; people.push(p); }
    if (d.uid) p.uid = d.uid;
    if (s.no >= (p.lastNo || 0)) { p.psn = d.psn || p.psn; p.name = d.name || p.name; p.lastNo = s.no; }
    p.medals[i]++; p.seasons[i].push(s.no);
  }));
  return people.sort((a, b) => b.medals[0] - a.medals[0] || b.medals[1] - a.medals[1] || b.medals[2] - a.medals[2]);
}
export function teamMedals(seasons) {
  const teams = [];
  seasons.forEach((s) => (s.teams || []).forEach((name, i) => {
    if (!name) return;
    let tm = teams.find((x) => sameTeam(x.name, name));
    if (!tm) { tm = { name, medals: [0, 0, 0], seasons: [[], [], []] }; teams.push(tm); }
    tm.medals[i]++; tm.seasons[i].push(s.no);
  }));
  return teams.sort((a, b) => b.medals[0] - a.medals[0] || b.medals[1] - a.medals[1] || b.medals[2] - a.medals[2]);
}
// A site user's medals: match by uid (new seasons), name, or PSN core.
export function medalsForUser(people, u) {
  if (!u) return null;
  const me = { uid: u.uid, name: `${u.lastName || ''} ${u.firstName || ''}`.trim(), psn: u.psn };
  const hits = people.filter((p) => (p.uid && p.uid === u.uid) || samePerson({ name: p.name, psn: p.psn }, { name: me.name, psn: me.psn }));
  if (!hits.length) return null;
  const out = { medals: [0, 0, 0], seasons: [[], [], []] };
  hits.forEach((p) => [0, 1, 2].forEach((i) => { out.medals[i] += p.medals[i]; out.seasons[i].push(...p.seasons[i]); }));
  out.seasons.forEach((a) => a.sort((x, y) => x - y));
  return out;
}
export const medalsForTeam = (teams, team) => (team ? teams.find((x) => sameTeam(x.name, team.name)) || null : null);
