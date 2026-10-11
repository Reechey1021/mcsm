// screens/hall.js
// Dicsőségfal: every season's podium (drivers and teams; MGTK folded away), newest first,
// with the all-time medal tables on top.
import { h, frag } from '../core/dom.js';
import { skelRows, empty, teamBadge } from '../ui/parts.js';
import { t } from '../i18n/index.js';
import { users as loadUsers, teams as loadTeams } from '../core/data.js';
import { honours } from '../services/honours.js';
import { samePerson, sameTeam, medalsForUser } from '../model/honours.js';
import { fullName } from '../model/profile.js';
import { trophy, trophyCount } from '../ui/trophy.js';

const cnt = (m) => h('span', { class: 'cnt' }, trophyCount(m[0], 0), trophyCount(m[1], 1), trophyCount(m[2], 2));

export function hallView() {
  const box = h('div', null, skelRows(4, 140));
  Promise.all([honours(), loadUsers(), loadTeams()]).then(([H, us, tms]) => {
    const userFor = (d) => (d && (d.uid ? us.find((u) => u.uid === d.uid) : us.find((u) => samePerson({ name: `${u.lastName || ''} ${u.firstName || ''}`, psn: u.psn }, d)))) || null;
    const teamFor = (name) => (name ? tms.find((x) => sameTeam(x.name, name)) || null : null);
    const pod = (d, i) => {
      if (!d) return h('div', { class: 'pod' }, h('span', { class: 'e' }, trophy(i, 16)), h('span', { class: 'n faint' }, '–'));
      const u = userFor(d);
      const label = u ? fullName(u) : d.name || d.psn;
      return h('div', { class: 'pod' }, h('span', { class: 'e' }, trophy(i, 16)), u ? h('a', { href: '#/pilotak/' + encodeURIComponent(u.psnLower) }, label) : h('span', { class: 'n' }, label), h('small', null, d.psn ? ' ' + d.psn : ''));
    };
    const teamPod = (name, i) => {
      const tm = teamFor(name);
      return h('div', { class: 'pod' }, h('span', { class: 'e' }, trophy(i, 16)), tm ? teamBadge(tm, 18) : null, tm ? h('a', { href: '#/csapatok/' + tm.id }, tm.name) : h('span', { class: 'n' + (name ? '' : ' faint') }, name || '–'));
    };
    // all-time tables (top 8)
    const peopleRows = H.people.slice(0, 8).map((p) => { const u = userFor(p); return h('div', { class: 'mt-row' }, u ? h('a', { class: 'nm', href: '#/pilotak/' + encodeURIComponent(u.psnLower) }, u ? fullName(u) : p.name) : h('span', { class: 'nm' }, p.name || p.psn), cnt(p.medals)); });
    const teamRows = H.teams.slice(0, 8).map((tm) => { const real = teamFor(tm.name); return h('div', { class: 'mt-row' }, real ? teamBadge(real, 18) : null, real ? h('a', { class: 'nm', href: '#/csapatok/' + real.id }, real.name) : h('span', { class: 'nm' }, tm.name), cnt(tm.medals)); });
    box.replaceChildren(
      h('section', { class: 'grid-2', style: 'margin-bottom:18px' },
        h('div', null, h('h2', { class: 'display', style: 'font-size:24px;margin:0 0 8px' }, t('hofDrivers')), h('div', { class: 'medal-table' }, peopleRows)),
        h('div', null, h('h2', { class: 'display', style: 'font-size:24px;margin:0 0 8px' }, t('hofTeams')), h('div', { class: 'medal-table' }, teamRows))),
      h('div', { class: 'hof' }, H.seasons.map((s) => h('article', { class: 'panel hof-card' },
        h('div', { class: 'hof-head' }, h('b', { class: 'display' }, 'MCSM' + s.no), h('span', null, [s.date, s.title].filter(Boolean).join(' · '))),
        h('div', { class: 'hof-cols' },
          h('div', { class: 'hof-col' }, h('div', { class: 'label' }, t('champDrivers')), (s.drivers || []).map(pod)),
          h('div', { class: 'hof-col' }, h('div', { class: 'label' }, t('champTeams')), (s.teams || []).some(Boolean) ? s.teams.map(teamPod) : h('p', { class: 'note', style: 'margin:0' }, t('hofNoTeams')))),
        (s.mgtk || []).some(Boolean) ? h('details', null, h('summary', null, t('hofMgtk')), h('div', { style: 'margin-top:6px' }, s.mgtk.map(pod))) : null))));
    void medalsForUser;
  }).catch(() => box.replaceChildren(empty(t('loadFailed'))));
  return box;
}
