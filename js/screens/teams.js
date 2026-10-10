// screens/teams.js
// Public MCSM team catalogue.
import { h, frag } from '../core/dom.js';
import { pageTitle, skelRows, empty } from '../ui/parts.js';
import { t } from '../i18n/index.js';
import { users, teams } from '../core/data.js';
import { fullName, isComplete } from '../model/profile.js';

export function screenTeams() {
  const grid = h('div', { class: 'drv-grid' }, skelRows(6, 96));
  Promise.all([teams(), users()]).then(([tms, us]) => {
    const members = (id) => us.filter((u) => u.teamId === id && isComplete(u));
    const shown = tms.filter((x) => x.status !== 'retired');
    grid.replaceChildren(...(shown.length ? shown.map((tm) => h('div', { class: 'panel', style: 'padding:14px 14px 14px 20px;overflow:hidden;position:relative' },
      h('div', { style: `position:absolute;left:0;top:0;bottom:0;width:6px;background:${tm.c1}` }),
      h('div', { class: 'row-between' }, h('b', { style: 'font-size:16px' }, tm.name), h('span', { class: 'status' }, tm.status === 'free' ? t('teamFree') : t('teamPerm'))),
      h('div', { class: 'faint', style: 'font-size:13.5px;margin-top:6px' }, members(tm.id).map(fullName).join(', ') || t('noMembers')))) : [empty(t('noTeams'))]));
  }).catch(() => grid.replaceChildren(empty(t('loadFailed'))));
  return frag(pageTitle(t('teams'), t('teamsSub')), grid);
}
