// screens/compare.js
// Two drivers side by side, equal columns. MCSM Rating with all four values and the gap (▼ −2,6) on
// the lower side; the better value in each row is in the accent colour. Unranked stays hidden.
import { h, frag } from '../core/dom.js';
import { avatar, backLink, skelRows, empty, teamBadge } from '../ui/parts.js';
import { t } from '../i18n/index.js';
import { users, teamMap } from '../core/data.js';
import { fullName } from '../model/profile.js';
import { fmtInt } from '../core/motion.js';
import { honours } from '../services/honours.js';
import { medalsForUser } from '../model/honours.js';
import { publicRatings } from '../services/mcsm-rating.js';
import { trophy } from '../ui/trophy.js';

const f1 = (v) => (v == null ? '–' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));
const SR_RANK = { S: 6, A: 5, B: 4, C: 3, D: 2, E: 1 };

export function screenCompare({ a, b }) {
  const box = h('div', null, skelRows(4, 70));
  Promise.all([users(), teamMap(), honours().catch(() => null), publicRatings()]).then(([us, tm, H, P]) => {
    const A = us.find((u) => u.psnLower === a.toLowerCase()), B = us.find((u) => u.psnLower === b.toLowerCase());
    if (!A || !B) { box.replaceChildren(empty(t('notFound'))); return; }
    const mr = (u) => { const x = (P.drivers || {})[u.uid]; return x && x.e ? x : null; };
    const med = (u) => (H ? medalsForUser(H.people, u) : null) || { medals: [0, 0, 0] };
    const head = (u) => h('a', { class: 'cmp-who', href: '#/pilotak/' + encodeURIComponent(u.psnLower) }, avatar(u, tm[u.teamId], 'lg'), h('b', null, fullName(u)),
      h('span', null, '#' + (u.raceNumber ?? ''), ' · ', u.psn), tm[u.teamId] ? h('span', { class: 'pd-team' }, teamBadge(tm[u.teamId], 14), tm[u.teamId].name) : h('span', null, ' '));
    // one row: value A | label | value B. diff: show "▼ −x" under the lower one (numbers only)
    const row = (label, va, vb, { fmt = String, diff = false, big = false, hidden } = {}) => {
      const win = va == null || vb == null || va === vb ? 0 : va > vb ? 1 : 2;
      const cell = (v, side) => {
        if (hidden && hidden(side)) return h('span', { class: 'cmp-v dim' }, t('mrUnranked'));
        const gap = diff && win && win !== side ? h('small', { class: 'cmp-gap' }, '▼ −' + f1(Math.abs(va - vb))) : null;
        return h('span', { class: 'cmp-v' + (win === side ? ' win' : '') + (big ? ' big' : '') }, h('b', null, v == null ? '–' : fmt(v)), gap);
      };
      return h('div', { class: 'cmp-row' + (big ? ' big' : '') }, cell(va, 1), h('span', { class: 'cmp-k' }, label), cell(vb, 2));
    };
    const ma = mr(A), mb = mr(B);
    const unranked = (side) => !(side === 1 ? ma : mb);
    const both = ma && mb;
    const rating = (k) => [ma ? ma[k] : null, mb ? mb[k] : null];
    const rr = (label, k, big) => { const [x, y] = rating(k); return row(label, both ? x : ma ? x : null, both ? y : mb ? y : null, { fmt: f1, diff: !!both, big, hidden: unranked }); };
    const dra = A.drPoints ?? null, drb = B.drPoints ?? null;
    box.replaceChildren(
      h('div', { class: 'cmp-head' }, head(A), h('span', { class: 'cmp-vs display' }, 'VS'), head(B)),
      h('section', { class: 'panel cmp-table cmp-mr' }, h('div', { class: 'cmp-sec' }, 'MCSM Rating'),
        rr('MCSM Rating', 'r', true), rr(t('quali'), 'q'), rr('Sprint', 's'), rr("Gran'Prix", 'g')),
      h('section', { class: 'panel cmp-table' }, h('div', { class: 'cmp-sec' }, t('cmpTitles')),
        row(h('span', { class: 'cmp-tk' }, trophy(0, 14), t('medalGold')), med(A).medals[0], med(B).medals[0]),
        row(h('span', { class: 'cmp-tk' }, trophy(1, 14), t('medalSilver')), med(A).medals[1], med(B).medals[1]),
        row(h('span', { class: 'cmp-tk' }, trophy(2, 14), t('medalBronze')), med(A).medals[2], med(B).medals[2])),
      h('section', { class: 'panel cmp-table' }, h('div', { class: 'cmp-sec' }, 'GT7'),
        (() => { const val = (u, v) => (u.dr === 'S' ? 1e9 : v); const r = row(t('cmpDrPoints'), val(A, dra), val(B, drb), { fmt: fmtInt }); if (A.dr === 'S') r.children[0].querySelector('b').textContent = t('drStar'); if (B.dr === 'S') r.children[2].querySelector('b').textContent = t('drStar'); return r; })(),
        (() => { const sa = SR_RANK[A.sr] || null, sb = SR_RANK[B.sr] || null; const r = row('SR', sa, sb); r.children[0].querySelector('b').textContent = A.sr || '–'; r.children[2].querySelector('b').textContent = B.sr || '–'; return r; })(),
        row(t('cmpGtRaces'), A.gtStats ? A.gtStats.races : null, B.gtStats ? B.gtStats.races : null),
        row(t('cmpGtWins'), A.gtStats ? A.gtStats.wins : null, B.gtStats ? B.gtStats.wins : null)));
  }).catch(() => box.replaceChildren(empty(t('loadFailed'))));
  return frag(backLink(t('drivers'), '#/pilotak'), h('h1', { class: 'display page-title' }, t('compareTitle')), box);
}
