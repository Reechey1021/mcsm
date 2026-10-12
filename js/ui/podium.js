// ui/podium.js
// End-of-season podiums, one per lobby: three bars (2nd, 1st, 3rd) with photo, name, number, team.
// A driver belongs to the lobby they raced in in the final round.
import { h } from '../core/dom.js';
import { avatar, teamBadge } from './parts.js';
import { trophy } from './trophy.js';
import { t } from '../i18n/index.js';
import { loadRace } from '../core/race-data.js';
import { driverStandings } from '../engine/scoring.js';
import { lobbyOf } from '../model/race.js';
import { fullName } from '../model/profile.js';

export function seasonPodiums(season, tmap) {
  const box = h('section', { class: 'podiums' });
  loadRace(season.id).then((ctx) => {
    if (!ctx || !ctx.built.length) { box.remove(); return; }
    const last = ctx.built[ctx.built.length - 1];
    const table = driverStandings(ctx.built, ctx.ids, { table: ctx.points });
    const lobbies = ['A', 'B', 'C'].filter((L) => (last.lobbies[L] || []).length);
    const cards = lobbies.map((L) => {
      const top = table.filter((r) => lobbyOf(last.lobbies, r.id) === L).slice(0, 3);
      if (!top.length) return null;
      const step = (r, place) => {
        if (!r) return h('div', { class: 'pd-step p' + place });
        const p = ctx.person(r.id), tm = tmap[(ctx.snaps[r.id] || {}).teamId];
        return h('a', { class: 'pd-step p' + place, href: '#/pilotak/' + encodeURIComponent(p.psnLower || '') },
          h('div', { class: 'pd-who' }, avatar(p, tm, 'lg'), h('b', null, fullName(p)), h('span', { class: 'pd-sub' }, '#' + (p.raceNumber ?? ''), p.psn ? ' · ' + p.psn : ''),
            tm ? h('span', { class: 'pd-team' }, teamBadge(tm, 14), tm.name) : null),
          h('div', { class: 'pd-bar' }, trophy(place - 1, 22), h('b', { class: 'display' }, place), h('span', null, r.total, ' ', t('pointsShort'))));
      };
      return h('div', { class: 'panel pd-card' }, h('div', { class: 'pd-head' }, h('span', { class: 'lobby ' + L }, L), h('b', { class: 'display' }, t('lobbyX', { l: L }))),
        h('div', { class: 'pd-row' }, step(top[1], 2), step(top[0], 1), step(top[2], 3)));
    }).filter(Boolean);
    if (!cards.length) { box.remove(); return; }
    box.replaceChildren(h('h2', { class: 'display', style: 'font-size:28px;margin:0 0 10px' }, t('podiumTitle', { s: 'MCSM' + season.no })), h('div', { class: 'pd-grid' }, cards));
  }).catch(() => box.remove());
  return box;
}
