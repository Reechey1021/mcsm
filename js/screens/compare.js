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
import { seg } from '../ui/controls.js';

const f1 = (v) => (v == null ? '–' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));
const SR_RANK = { S: 6, A: 5, B: 4, C: 3, D: 2, E: 1 };

export function screenCompare({ a, b }) {
  const box = h('div', null, skelRows(4, 70));
  Promise.all([users(), teamMap(), honours().catch(() => null), publicRatings()]).then(([us, tm, H, P]) => {
    const A = us.find((u) => u.psnLower === a.toLowerCase()), B = us.find((u) => u.psnLower === b.toLowerCase());
    if (!A || !B) { box.replaceChildren(empty(t('notFound'))); return; }
    const mr = (u) => { const x = (P.drivers || {})[u.uid]; return x && x.e ? x : null; };
    const med = (u) => (H ? medalsForUser(H.people, u, us) : null) || { medals: [0, 0, 0] };
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
      compareHistory(A, B, ma, mb),
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

// Both drivers' MCSM Rating over time on one chart: the first a solid line, the second dashed.
// Only rounds each of them raced as a ranked driver; ranges: last 5 / 10 / all.
const keyOf = (l) => { const m = /MCSM(\d+)\s*\/\s*(\d+)/.exec(String(l)); return m ? +m[1] * 1000 + +m[2] : /MCSM25/.test(String(l)) ? 0 : null; };
const pts = (x) => (x && x.e ? (x.h || []).map((e) => (Array.isArray(e) ? { l: e[0], r: e[1] } : e)).filter((e) => keyOf(e.l) != null) : []);
function compareHistory(A, B, ma, mb) {
  const pa = pts(ma), pb = pts(mb);
  if (pa.length + pb.length < 2) return null;
  const box = h('section', { class: 'panel cmp-hist' });
  const all = [...new Map([...pa, ...pb].map((e) => [keyOf(e.l), e.l])).entries()].sort((a, b) => a[0] - b[0]);
  const ranges = [5, 10].filter((n) => n < all.length);
  let range = ranges.includes(10) ? 10 : 0;
  const NS = 'http://www.w3.org/2000/svg';
  const draw = () => {
    const xs = range ? all.slice(-range) : all;
    const idx = new Map(xs.map(([k], i) => [k, i]));
    const sa = pa.filter((e) => idx.has(keyOf(e.l))), sb = pb.filter((e) => idx.has(keyOf(e.l)));
    const vals = [...sa, ...sb].map((e) => e.r);
    const lo = Math.floor(Math.min(...vals) - 2), hi = Math.ceil(Math.max(...vals) + 2);
    const W = 640, H = 240, L = 40, R = 12, T = 12, Bt = 54;
    const X = (k) => L + (xs.length < 2 ? (W - L - R) / 2 : (idx.get(k) / (xs.length - 1)) * (W - L - R));
    const Y = (v) => T + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - T - Bt);
    const line = (ser, color, dash) => (ser.length > 1 ? `<polyline points="${ser.map((e) => `${X(keyOf(e.l)).toFixed(1)},${Y(e.r).toFixed(1)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="2.6" stroke-linejoin="round" stroke-linecap="round" ${dash ? 'stroke-dasharray="7 6"' : ''}/>` : '')
      + ser.map((e) => `<circle cx="${X(keyOf(e.l))}" cy="${Y(e.r)}" r="3.4" fill="${dash ? 'var(--bg-2)' : color}" stroke="${color}" stroke-width="2"><title>${e.l}: ${String((Math.round(e.r * 10) / 10).toFixed(1)).replace('.', ',')}</title></circle>`).join('');
    const ticks = [lo, (lo + hi) / 2, hi].map((v) => `<text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" class="mh-tick">${Math.round(v)}</text><line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="mh-grid"/>`).join('');
    const labels = xs.map(([k, l]) => `<text x="${X(k)}" y="${H - Bt + 16}" text-anchor="end" transform="rotate(-35 ${X(k)} ${H - Bt + 16})" class="mh-tick">${l}</text>`).join('');
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'mh-chart');
    svg.innerHTML = ticks + line(sb, '#38BDF8', true) + line(sa, 'var(--accent)', false) + labels;
    chart.replaceChildren(svg);
  };
  const chart = h('div');
  const legend = h('div', { class: 'mh-legend' },
    ma ? h('span', null, h('i', { class: 'lg-solid' }), fullName(A)) : null,
    mb ? h('span', null, h('i', { class: 'lg-dash' }), fullName(B)) : null);
  const note = !ma || !mb ? h('p', { class: 'note', style: 'margin:6px 0 0' }, t('cmpUnrankedNote', { name: fullName(!ma ? A : B) })) : null;
  const ctrl = ranges.length ? seg([...ranges.map((n) => ({ value: n, label: t('mrLastN', { n }) })), { value: 0, label: t('mrAllTime') }], range, (v) => { range = v; draw(); }, { scroll: true }) : null;
  box.append(h('div', { class: 'cmp-sec' }, t('cmpHistory')), ctrl ? h('div', { style: 'margin:4px 0 8px' }, ctrl) : null, legend, chart, note);
  draw();
  return box;
}
