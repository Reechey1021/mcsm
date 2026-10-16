// screens/hall.js
// Dicsőségfal: every season's podium (drivers and teams; MGTK folded away), newest first,
// with the all-time medal tables on top.
import { icon } from '../core/icons.js';
import { h, frag } from '../core/dom.js';
import { skelRows, empty, teamBadge } from '../ui/parts.js';
import { t } from '../i18n/index.js';
import { users as loadUsers, teams as loadTeams } from '../core/data.js';
import { honours } from '../services/honours.js';
import { samePerson, sameTeam, medalsForUser, bestUser } from '../model/honours.js';
import { fullName } from '../model/profile.js';
import { trophy, trophyCount } from '../ui/trophy.js';

const cnt = (m, o = {}) => h('span', { class: 'cnt' }, trophyCount(m[0], 0, 16, o), trophyCount(m[1], 1, 16, o), trophyCount(m[2], 2, 16, o));

// A medal table: all title winners (at least 8 rows), the rest folded away under "Továbbiak (n)".
function medalList(list, row) {
  const winners = list.filter((x) => x.medals[0] > 0).length;
  const shown = Math.max(8, winners);
  const top = list.slice(0, shown), rest = list.slice(shown);
  return h('div', null, h('div', { class: 'medal-table' }, top.map(row)),
    rest.length ? h('details', { class: 'lobby-sec mt-more' }, h('summary', null, t('hofMore', { n: rest.length }), icon('down', 'chev')), h('div', { class: 'medal-table', style: 'margin-top:6px' }, rest.map(row))) : null);
}

export function hallView() {
  const box = h('div', null, skelRows(4, 140));
  Promise.all([honours(), loadUsers(), loadTeams()]).then(([H, us, tms]) => {
    const userFor = (d) => (d ? bestUser(d, us) : null);
    const teamFor = (name) => (name ? tms.find((x) => sameTeam(x.name, name)) || null : null);
    const pod = (d, i, outline = false) => {
      if (!d) return h('div', { class: 'pod' }, h('span', { class: 'e' }, trophy(i, 16, { outline })), h('span', { class: 'n faint' }, '–'));
      const u = userFor(d);
      const label = u ? fullName(u) : d.name || d.psn;
      return h('div', { class: 'pod' }, h('span', { class: 'e' }, trophy(i, 16, { outline })), u ? h('a', { href: '#/pilotak/' + encodeURIComponent(u.psnLower) }, label) : h('span', { class: 'n' }, label), h('small', null, d.psn ? ' ' + d.psn : ''));
    };
    const teamPod = (name, i) => {
      const tm = teamFor(name);
      return h('div', { class: 'pod' }, h('span', { class: 'e' }, trophy(i, 16)), tm ? teamBadge(tm, 18) : null, tm ? h('a', { href: '#/csapatok/' + tm.id }, tm.name) : h('span', { class: 'n' + (name ? '' : ' faint') }, name || '–'));
    };
    // all-time tables (top 8)
    const peopleRows = medalList(H.people, (p) => { const u = userFor(p); return h('div', { class: 'mt-row' }, u ? h('a', { class: 'nm', href: '#/pilotak/' + encodeURIComponent(u.psnLower) }, u ? fullName(u) : p.name) : h('span', { class: 'nm' }, p.name || p.psn), cnt(p.medals)); });
    const mgtkRows = medalList((H.mgtk || []), (p) => { const u = userFor(p); return h('div', { class: 'mt-row' }, u ? h('a', { class: 'nm', href: '#/pilotak/' + encodeURIComponent(u.psnLower) }, u ? fullName(u) : p.name) : h('span', { class: 'nm' }, p.name || p.psn), cnt(p.medals, { outline: true })); });
    const teamRows = medalList(H.teams, (tm) => { const real = teamFor(tm.name); return h('div', { class: 'mt-row' }, real ? teamBadge(real, 18) : null, real ? h('a', { class: 'nm', href: '#/csapatok/' + real.id }, real.name) : h('span', { class: 'nm' }, tm.name), cnt(tm.medals)); });
    box.replaceChildren(
      h('section', { class: 'hof-tables', style: 'margin-bottom:18px' },
        h('div', null, h('h2', { class: 'display', style: 'font-size:24px;margin:0 0 8px' }, t('hofDrivers')), peopleRows),
        h('div', null, h('h2', { class: 'display', style: 'font-size:24px;margin:0 0 8px' }, t('hofTeams')), teamRows),
        h('div', null, h('h2', { class: 'display', style: 'font-size:24px;margin:0 0 8px' }, t('hofMgtkTable')), mgtkRows)),
      h('div', { class: 'hof' }, H.seasons.map((s) => h('article', { class: 'panel hof-card' },
        h('div', { class: 'hof-head' }, h('b', { class: 'display' }, 'MCSM' + s.no), h('span', null, [s.date, s.title].filter(Boolean).join(' · '))),
        h('div', { class: 'hof-cols' },
          h('div', { class: 'hof-col' }, h('div', { class: 'label' }, t('champDrivers')), (s.drivers || []).map((d, i) => pod(d, i))),
          h('div', { class: 'hof-col' }, h('div', { class: 'label' }, t('champTeams')), (s.teams || []).some(Boolean) ? s.teams.map(teamPod) : h('p', { class: 'note', style: 'margin:0' }, t('hofNoTeams')))),
        (s.mgtk || []).some(Boolean) ? h('details', null, h('summary', null, t('hofMgtk')), h('div', { style: 'margin-top:6px' }, s.mgtk.map((d, i) => pod(d, i, true)))) : null))));
    void medalsForUser;
  }).catch(() => box.replaceChildren(empty(t('loadFailed'))));
  return box;
}
