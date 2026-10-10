// screens/admin/index.js
// Admin home: counts and the way into each admin area.
import { h, frag } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { countUp } from '../../core/motion.js';
import { pageTitle } from '../../ui/parts.js';
import { t } from '../../i18n/index.js';
import { users, teams, invalidate } from '../../core/data.js';
import { isComplete } from '../../model/profile.js';
import { isOwner } from '../../services/session.js';

export function screenAdmin() {
  invalidate('users');
  const n = () => h('span', { class: 'n display num' }, '–');
  const cells = { people: n(), incomplete: n(), teams: n(), requests: n() };
  const tile = (ic, k, href, num) => h('a', { class: 'tile', href }, icon(ic), h('b', null, t(k)), num);
  Promise.all([users(), teams()]).then(([us, tms]) => {
    const set = (el, v) => countUp(el, 0, v, 700);
    set(cells.people, us.length); set(cells.incomplete, us.filter((u) => !isComplete(u)).length);
    set(cells.teams, tms.length); set(cells.requests, us.filter((u) => u.teamRequest).length);
  });
  return frag(pageTitle(t('admin'), t('adminSub')),
    h('div', { class: 'tiles' },
      tile('users', 'adminPeople', '#/admin/felhasznalok', cells.people),
      tile('alert', 'adminIncomplete', '#/admin/felhasznalok?szuro=hianyos', cells.incomplete),
      tile('flag', 'adminTeams', '#/admin/csapatok', cells.teams),
      tile('clock', 'adminRequests', '#/admin/csapatok', cells.requests)),
    h('div', { class: 'stack', style: 'gap:8px;margin-top:16px' },
      h('a', { class: 'round-item', href: '#/admin/gt' }, icon('grid', 'chev'), h('span', { class: 't' }, h('b', null, t('adminGt')), h('span', { class: 'sub' }, t('adminGtSub'))), icon('chevR', 'chev')),
      h('a', { class: 'round-item', href: '#/szabalyzat/szerkesztes' }, icon('book', 'chev'), h('span', { class: 't' }, h('b', null, t('editRules')), h('span', { class: 'sub' }, t('rulesAdminSub'))), icon('chevR', 'chev')),
      h('a', { class: 'round-item', href: '#/admin/naplo' }, icon('history', 'chev'), h('span', { class: 't' }, h('b', null, t('adminAudit')), h('span', { class: 'sub' }, t('adminAuditSub'))), icon('chevR', 'chev'))),
    h('details', { class: 'adv' }, h('summary', null, icon('cog'), t('advanced'), icon('down', 'chev')),
      h('div', { class: 'stack', style: 'gap:8px;margin-top:10px' },
      h('a', { class: 'round-item', href: '#/admin/szerepkorok' }, icon('shield', 'chev'), h('span', { class: 't' }, h('b', null, t('rolesTitle')), h('span', { class: 'sub' }, t('rolesSub'))), icon('chevR', 'chev')),
      isOwner() ? h('a', { class: 'round-item', href: '#/admin/import' }, icon('refresh', 'chev'), h('span', { class: 't' }, h('b', null, t('impTitle')), h('span', { class: 'sub' }, t('impAdminSub'))), icon('chevR', 'chev')) : null,
      h('a', { class: 'round-item', href: '#/admin/gt7' }, icon('car', 'chev'), h('span', { class: 't' }, h('b', null, t('gsTitle')), h('span', { class: 'sub' }, t('gsAdminSub'))), icon('chevR', 'chev')),
        h('a', { class: 'round-item', href: '#/admin/beallitasok' }, icon('bell', 'chev'), h('span', { class: 't' }, h('b', null, t('settingsTitle')), h('span', { class: 'sub' }, t('settingsSub'))), icon('chevR', 'chev')))));
}