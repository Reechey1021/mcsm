// screens/compare.js
// Two drivers side by side: MCSM Rating and its parts, titles, DR/SR, GT7 numbers, team.
// The better value in each row is highlighted. Unranked ratings stay hidden.
import { h, frag } from '../core/dom.js';
import { avatar, backLink, skelRows, empty, teamBadge } from '../ui/parts.js';
import { t } from '../i18n/index.js';
import { users, teamMap } from '../core/data.js';
import { fullName, DR_RANK } from '../model/profile.js';
import { honours } from '../services/honours.js';
import { medalsForUser } from '../model/honours.js';
import { publicRatings } from '../services/mcsm-rating.js';

const f1 = (v) => (v == null ? '–' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));
const SR_RANK = { S: 6, A: 5, B: 4, C: 3, D: 2, E: 1 };

export function screenCompare({ a, b }) {
  const box = h('div', null, skelRows(4, 70));
  Promise.all([users(), teamMap(), honours().catch(() => null), publicRatings()]).then(([us, tm, H, P]) => {
    const A = us.find((u) => u.psnLower === a.toLowerCase()), Bd = us.find((u) => u.psnLower === b.toLowerCase());
    if (!A || !Bd) { box.replaceChildren(empty(t('notFound'))); return; }
    const mr = (u) => { const x = (P.drivers || {})[u.uid]; return x && x.e ? x : null; };
    const med = (u) => (H ? medalsForUser(H.people, u) : null) || { medals: [0, 0, 0] };
    const rows = [
      ['MCSM Rating', (u) => (mr(u) ? mr(u).r : null), f1, true, (u) => (mr(u) ? null : t('mrUnranked'))],
      [t('quali'), (u) => (mr(u) ? mr(u).q : null), f1, true],
      ['Sprint', (u) => (mr(u) ? mr(u).s : null), f1, true],
      ["Gran'Prix", (u) => (mr(u) ? mr(u).g : null), f1, true],
      [t('medalGold'), (u) => med(u).medals[0], String, true],
      [t('medalSilver'), (u) => med(u).medals[1], String, true],
      [t('medalBronze'), (u) => med(u).medals[2], String, true],
      ['DR', (u) => DR_RANK[u.dr] || 0, (v, u) => u.dr || '–', true],
      ['SR', (u) => SR_RANK[u.sr] || 0, (v, u) => u.sr || '–', true],
      [t('cmpGtRaces'), (u) => (u.gtStats ? u.gtStats.races : null), (v) => (v == null ? '–' : String(v)), true],
      [t('cmpGtWins'), (u) => (u.gtStats ? u.gtStats.wins : null), (v) => (v == null ? '–' : String(v)), true],
    ];
    const head = (u) => h('a', { class: 'cmp-who', href: '#/pilotak/' + encodeURIComponent(u.psnLower) }, avatar(u, tm[u.teamId], 'lg'), h('b', null, fullName(u)), h('span', null, '#' + (u.raceNumber ?? ''), ' · ', u.psn),
      tm[u.teamId] ? h('span', { class: 'pd-team' }, teamBadge(tm[u.teamId], 14), tm[u.teamId].name) : null);
    box.replaceChildren(h('div', { class: 'cmp-head' }, head(A), h('span', { class: 'cmp-vs display' }, 'VS'), head(Bd)),
      h('div', { class: 'panel cmp-table' }, rows.map(([label, get, fmt, higher, alt]) => {
        const va = get(A), vb = get(Bd);
        const win = va == null || vb == null || va === vb ? 0 : (va > vb) === higher ? 1 : 2;
        const cell = (u, v, side) => h('span', { class: 'cmp-v' + (win === side ? ' win' : '') }, alt && alt(u) ? alt(u) : fmt(v, u));
        return h('div', { class: 'cmp-row' }, cell(A, va, 1), h('span', { class: 'cmp-k' }, label), cell(Bd, vb, 2));
      })));
  }).catch(() => box.replaceChildren(empty(t('loadFailed'))));
  return frag(backLink(t('drivers'), '#/pilotak'), h('h1', { class: 'display page-title' }, t('compareTitle')), box);
}
