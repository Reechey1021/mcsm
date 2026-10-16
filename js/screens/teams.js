// screens/teams.js
// Teams: the list (logos, members, titles) and a page per team with its honours and drivers.
import { loadRace } from '../core/race-data.js';
import { publicDriverDirectory, seasons as loadSeasons, entries as loadEntries } from '../core/data.js';
import { publicRatings } from '../services/mcsm-rating.js';
import { h, frag } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { pageTitle, skelRows, empty, backLink, avatar, ratingEl, teamBadge, medalRow, secHead } from '../ui/parts.js';
import { t } from '../i18n/index.js';
import { users, teams, invalidate } from '../core/data.js';
import { fullName, isComplete } from '../model/profile.js';
import { honours } from '../services/honours.js';
import { medalsForTeam } from '../model/honours.js';
import { isAdmin } from '../services/session.js';
import { editTeam } from './admin/teams.js';
import { emit } from '../core/bus.js';
import { trophyCount } from '../ui/trophy.js';

// Public driver list: the shared JSON when it's available (no Firestore reads), else the profiles.
const people = () => publicDriverDirectory().catch(() => users());
// Average MCSM Rating of a team's current ranked drivers.
function teamAverage(mem, P) {
  const vals = mem.map((u) => (P.drivers || {})[u.uid]).filter((x) => x && x.e).map((x) => x.r);
  return vals.length ? { avg: vals.reduce((a, b) => a + b, 0) / vals.length, n: vals.length } : null;
}
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
// Drivers who raced for this team in earlier seasons (from the season entries), minus current ones.
async function pastDrivers(teamId, currentUids) {
  const all = (await loadSeasons()).filter((s) => !['draft', 'announced'].includes(s.state)).sort((a, b) => b.no - a.no);
  const byUid = {};
  for (const s of all) {
    const es = ['finished', 'archived'].includes(s.state) ? await loadRace(s.id, { includeUsers: false }).then((c) => (c ? c.entries : [])).catch(() => []) : await loadEntries(s.id).catch(() => []);
    es.filter((e) => e.snapshot && e.snapshot.teamId === teamId && !currentUids.has(e.uid)).forEach((e) => {
      const x = byUid[e.uid] || (byUid[e.uid] = { uid: e.uid, snap: e.snapshot, seasons: [] });
      x.seasons.push(s.no);
    });
  }
  return Object.values(byUid).sort((a, b) => b.seasons[0] - a.seasons[0] || fullName(a.snap).localeCompare(fullName(b.snap), 'hu'));
}

export function screenTeams() {
  const grid = h('div', { class: 'team-grid' }, ...Array.from({ length: 6 }, () => h('div', { class: 'skel', style: 'height:80px' })));
  Promise.all([teams(), people(), honours().catch(() => null), publicRatings()]).then(([tms, us, H, P]) => {
    const members = (id) => us.filter((u) => u.teamId === id && isComplete(u));
    const shown = tms.filter((x) => x.status !== 'retired').map((tm) => ({ tm, m: H ? medalsForTeam(H.teams, tm) : null }))
      .sort((a, b) => ((b.m && b.m.medals[0]) || 0) - ((a.m && a.m.medals[0]) || 0) || a.tm.name.localeCompare(b.tm.name, 'hu'));
    grid.replaceChildren(...(shown.length ? shown.map(({ tm, m }) => h('a', { class: 'panel team-card', href: '#/csapatok/' + tm.id }, teamBadge(tm, 44),
      h('span', { class: 'nm' }, h('b', null, tm.name), h('span', null, members(tm.id).map((u) => (u.lastName || '').toLocaleUpperCase('hu')).join(', ') || t('noMembers')), (() => { const a = teamAverage(members(tm.id), P); return a ? h('span', { class: 'team-avg' }, t('teamAvgShort', { r: f1(a.avg) })) : null; })()), m && m.medals[0] ? h('span', { class: 'sort-fig' }, trophyCount(m.medals[0], 0, 16)) : null)) : [empty(t('noTeams'))]));
  }).catch(() => grid.replaceChildren(empty(t('loadFailed'))));
  return frag(pageTitle(t('teams'), t('teamsSub')), grid);
}

export function screenTeam({ id }) {
  const root = h('div', null, skelRows(3, 120));
  const load = () => Promise.all([teams(), people(), honours().catch(() => null), publicRatings()]).then(([tms, us, H, P]) => {
    const tm = tms.find((x) => x.id === id);
    if (!tm) { root.replaceChildren(empty(t('notFound'))); return; }
    const mem = us.filter((u) => u.teamId === id && isComplete(u));
    const m = H ? medalsForTeam(H.teams, tm) : null;
    const edit = isAdmin() ? h('button', { class: 'btn small', type: 'button', style: 'margin:-4px 0 6px', onclick: () => editTeam(tm, () => { invalidate('teams'); emit('rerender'); }) }, icon('edit'), t('edit')) : null;
    root.replaceChildren(
      h('section', { class: 'team-hero', vars: { '--t1': tm.c1 || 'transparent' } },
        h('span', { class: 'logo-big', style: tm.logoUrl ? `background-image:url("${tm.logoUrl}")` : `background:${tm.c1 || 'rgba(255,255,255,.08)'}` }),
        h('div', { style: 'min-width:0' }, h('h1', { class: 'display' }, tm.name), h('div', { style: 'opacity:.75;font-size:14px;margin-top:6px' }, tm.status === 'perm' ? t('teamPerm') : t('teamFree')))),
      edit,
      (() => { const a = teamAverage(mem, P); return a ? h('div', { class: 'panel pad team-avg-box' }, h('span', { class: 'label' }, t('teamAvgTitle')), h('b', { class: 'display' }, f1(a.avg)), h('span', { class: 'faint' }, t('teamAvgOf', { n: a.n }))) : null; })(),
      secHead(t('teamTitles')), m ? medalRow(m, { seasons: true }) : h('p', { class: 'note', style: 'margin:0' }, t('noTitlesYet')),
      secHead(t('teamDrivers')), mem.length ? h('div', { class: 'stack', style: 'gap:8px' }, mem.map((u) => h('a', { class: 'drv-card', href: '#/pilotak/' + encodeURIComponent(u.psnLower) }, avatar(u, tm), h('span', { class: 'nm' }, h('b', null, fullName(u)), h('span', null, h('span', { class: 'rnum' }, '#' + (u.raceNumber ?? '')), ' · ', u.psn)), ratingEl(u)))) : empty(t('noMembers')));
    const past = h('details', { class: 'lobby-sec past-drivers', style: 'margin-top:18px' }, h('summary', null, t('pastDrivers'), icon('down', 'chev')), h('div', { class: 'stack', style: 'gap:6px;padding:6px 0 4px' }, skelRows(2, 50)));
    root.append(past);
    pastDrivers(id, new Set(mem.map((u) => u.uid))).then((rows) => {
      if (!rows.length) { past.remove(); return; }
      const byUid = Object.fromEntries(us.map((u) => [u.uid, u]));
      past.querySelector('summary').firstChild.textContent = t('pastDriversN', { n: rows.length });
      past.lastChild.replaceChildren(...rows.map((r) => { const u = byUid[r.uid]; const who = u || r.snap; return h(u ? 'a' : 'div', { class: 'drv-card', href: u ? '#/pilotak/' + encodeURIComponent(u.psnLower) : undefined }, avatar({ ...r.snap, gt7Avatar: u && u.gt7Avatar }, null),
        h('span', { class: 'nm' }, h('b', null, fullName(who)), h('span', null, (who.psn || '') + ' · ' + r.seasons.map((n) => 'MCSM' + n).join(', ')))); }));
    }).catch(() => past.remove());

  }).catch(() => root.replaceChildren(empty(t('loadFailed'))));
  load();
  return frag(backLink(t('teams'), '#/csapatok'), root);
}
