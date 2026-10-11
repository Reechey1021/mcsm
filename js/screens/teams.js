// screens/teams.js
// Teams: the list (logos, members, titles) and a page per team with its honours and drivers.
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

export function screenTeams() {
  const grid = h('div', { class: 'team-grid' }, skelRows(6, 80));
  Promise.all([teams(), users(), honours().catch(() => null)]).then(([tms, us, H]) => {
    const members = (id) => us.filter((u) => u.teamId === id && isComplete(u));
    const shown = tms.filter((x) => x.status !== 'retired').map((tm) => ({ tm, m: H ? medalsForTeam(H.teams, tm) : null }))
      .sort((a, b) => ((b.m && b.m.medals[0]) || 0) - ((a.m && a.m.medals[0]) || 0) || a.tm.name.localeCompare(b.tm.name, 'hu'));
    grid.replaceChildren(...(shown.length ? shown.map(({ tm, m }) => h('a', { class: 'panel team-card', href: '#/csapatok/' + tm.id }, teamBadge(tm, 44),
      h('span', { class: 'nm' }, h('b', null, tm.name, m && m.medals[0] ? trophyCount(m.medals[0], 0, 15) : null), h('span', null, members(tm.id).map((u) => (u.lastName || '').toLocaleUpperCase('hu')).join(', ') || t('noMembers'))))) : [empty(t('noTeams'))]));
  }).catch(() => grid.replaceChildren(empty(t('loadFailed'))));
  return frag(pageTitle(t('teams'), t('teamsSub')), grid);
}

export function screenTeam({ id }) {
  const root = h('div', null, skelRows(3, 120));
  const load = () => Promise.all([teams(), users(), honours().catch(() => null)]).then(([tms, us, H]) => {
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
      secHead(t('teamTitles')), m ? medalRow(m, { seasons: true }) : h('p', { class: 'note', style: 'margin:0' }, t('noTitlesYet')),
      secHead(t('teamDrivers')), mem.length ? h('div', { class: 'stack', style: 'gap:8px' }, mem.map((u) => h('a', { class: 'drv-card', href: '#/pilotak/' + encodeURIComponent(u.psnLower) }, avatar(u, tm), h('span', { class: 'nm' }, h('b', null, fullName(u)), h('span', null, h('span', { class: 'rnum' }, '#' + (u.raceNumber ?? '')), ' · ', u.psn)), ratingEl(u)))) : empty(t('noMembers')));
  }).catch(() => root.replaceChildren(empty(t('loadFailed'))));
  load();
  return frag(backLink(t('teams'), '#/csapatok'), root);
}
