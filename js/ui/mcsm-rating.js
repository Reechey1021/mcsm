// ui/mcsm-rating.js
// The MCSM Rating card on driver profiles (a dial for the rating, small rings for each part),
// and the "how is it calculated" explainer. Unranked drivers (fewer than 5 rounds) see no numbers.
// Preview with sample numbers: add ?mrdemo to the address (or ?mrdemo=unranked).
import { h } from '../core/dom.js';
import { openSheet } from './sheet.js';
import { t } from '../i18n/index.js';
import { publicRatings } from '../services/mcsm-rating.js';
import { RATING_CFG } from '../engine/rating.js';

const f1 = (v) => (v == null ? '–' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));
const signed = (v) => (v > 0.05 ? '+' : v < -0.05 ? '−' : '±') + f1(Math.abs(v));
const DEMO = { e: 1, r: 131.46, q: 128.2, rr: 134.9, d: 101.3, n: 7, rel: 92.9, hi: 133.1, dl: 1.84, pf: 142.7 };
const demoMode = () => { try { const q = new URLSearchParams(location.search); return q.has('mrdemo') ? (q.get('mrdemo') === 'unranked' ? 'unranked' : 'ranked') : null; } catch { return null; } };

const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
const SWEEP = 270, START = 225;
const at = (cx, cy, r, tt) => { const a = ((START - SWEEP * tt) * Math.PI) / 180; return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
const arcPath = (cx, cy, r, t0, t1) => { const [x0, y0] = at(cx, cy, r, t0), [x1, y1] = at(cx, cy, r, t1); return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${(t1 - t0) * SWEEP > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
const toT = (v, lo = RATING_CFG.min, hi = RATING_CFG.max) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

// One dial: track, value arc (animated), and the league-average marker at 100.
function dial({ size, r, stroke, value, color, marker = true, lo, hi }) {
  const c = size / 2;
  const s = svgEl('svg', { viewBox: `0 0 ${size} ${size}`, class: 'mr-dial', 'aria-hidden': 'true' });
  s.append(svgEl('path', { d: arcPath(c, c, r, 0, 1), fill: 'none', stroke: 'var(--mr-track)', 'stroke-width': stroke, 'stroke-linecap': 'round' }));
  if (value != null) {
    const p = svgEl('path', { d: arcPath(c, c, r, 0, Math.max(0.005, toT(value, lo, hi))), fill: 'none', stroke: color, 'stroke-width': stroke, 'stroke-linecap': 'round', pathLength: 100, 'stroke-dasharray': '100 100', 'stroke-dashoffset': 0 });
    s.append(p);
    requestAnimationFrame(() => p.animate && p.animate([{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 900, easing: 'cubic-bezier(.2,.8,.2,1)' }));
    if (marker) {
      const tm = toT(100, lo, hi), [x0, y0] = at(c, c, r - stroke * 0.9, tm), [x1, y1] = at(c, c, r + stroke * 0.9, tm);
      s.append(svgEl('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: 'var(--ink)', 'stroke-width': Math.max(2, stroke / 3.5), 'stroke-linecap': 'round' }));
    }
  }
  return s;
}
const standing = (v) => (v == null ? null : v >= 105 ? ['up', t('mrAbove')] : v <= 95 ? ['down', t('mrBelow')] : ['par', t('mrPar')]);

export function mcsmRatingCard(uid) {
  const card = h('section', { class: 'panel mr-card' });
  const help = h('button', { class: 'mr-help', type: 'button', 'aria-label': t('mrHow'), title: t('mrHow'), onclick: explainRating }, '?');
  const demo = demoMode();
  const load = demo ? Promise.resolve({ drivers: { [uid]: demo === 'ranked' ? DEMO : { e: 0, n: 3 } } }) : publicRatings();
  load.then((P) => {
    const x = (P.drivers || {})[uid];
    const ranked = !!(x && x.e);
    const head = h('div', { class: 'mr-head' }, h('span', { class: 'label' }, 'MCSM Rating'), demo ? h('span', { class: 'mr-demo' }, t('mrDemo')) : null, help);
    // main dial
    const st = ranked ? standing(x.r) : null;
    const main = h('div', { class: 'mr-mainwrap' },
      ranked ? (() => { const [ax, ay] = at(100, 100, 103, toT(100)); return h('span', { class: 'mr-avg', style: `left:${(ax / 2).toFixed(1)}%;top:${(ay / 2).toFixed(1)}%` }, '100,0'); })() : null,
      dial({ size: 200, r: 82, stroke: 13, value: ranked ? x.r : null, color: 'var(--accent)' }),
      h('div', { class: 'mr-center' },
        ranked ? h('b', { class: 'display mr-big' }, f1(x.r)) : h('b', { class: 'display mr-unranked' }, t('mrUnranked')),
        ranked && x.dl ? h('span', { class: 'mr-delta ' + (x.dl > 0 ? 'up' : 'down') }, signed(x.dl)) : null),
      h('div', { class: 'mr-status ' + (st ? st[0] : 'par') }, ranked ? `${st[0] === 'up' ? '▲' : st[0] === 'down' ? '▼' : '–'} ${st[1]}` : t('mrRoundsToRank', { n: x ? x.n : 0, total: RATING_CFG.provisionalRounds })));
    // the parts
    const part = (label, v, color, opts = {}) => {
      const s2 = opts.noStanding ? null : ranked ? standing(v) : null;
      return h('div', { class: 'mr-part' },
        h('div', { class: 'mr-ring' }, dial({ size: 64, r: 26, stroke: 5, value: ranked ? v : null, color, marker: !opts.noMarker, lo: opts.lo, hi: opts.hi }), h('b', null, ranked ? (opts.fmt || f1)(v) : '–')),
        h('div', { class: 'mr-ptext' }, h('span', { class: 'mr-pname', style: `color:${color}` }, label), h('span', { class: 'mr-pstat ' + (s2 ? s2[0] : '') }, ranked ? (s2 ? `${s2[0] === 'up' ? '▲' : s2[0] === 'down' ? '▼' : '–'} ${s2[1]}` : opts.sub || '') : t('mrHidden'))));
    };
    const parts = h('div', { class: 'mr-parts' },
      part(t('mrPaceShort'), x && x.q, '#38BDF8'), part(t('mrRaceShort'), x && x.rr, 'var(--accent)'), part(t('mrDisciplineShort'), x && x.d, '#A584FF'),
      part(t('mrReliability'), x && x.rel, '#F2C14E', { noMarker: true, noStanding: true, lo: 0, hi: 100, fmt: (v) => (v == null ? '–' : Math.round(v) + '%'), sub: t('mrRelSub') }));
    const facts = ranked ? h('div', { class: 'mr-facts2' }, h('span', null, t('mrHighest'), h('b', null, f1(x.hi))), h('span', null, t('mrLastPerf'), h('b', null, f1(x.pf))), h('span', null, t('mrRoundsDone'), h('b', null, x.n))) : null;
    card.replaceChildren(head, h('div', { class: 'mr-body' }, main, parts), facts);
  }).catch(() => card.remove());
  return card;
}

export function explainRating() {
  const c = RATING_CFG;
  const p = (k, v) => h('p', null, t(k, v));
  openSheet({ title: t('mrHowTitle'), body: h('div', { class: 'md mr-explain' },
    p('mrX1'), h('div', { class: 'mr-formula' }, 'MCSM Rating = 0,25 × Pace + 0,65 × Race + 0,10 × Discipline'),
    h('h3', null, t('mrPace')), p('mrX2', { k: c.kQ }),
    h('h3', null, t('mrRace')), p('mrX3', { s: Math.round(c.sprintShare * 100), m: Math.round(c.mainShare * 100) }),
    h('h3', null, t('mrDiscipline')), p('mrX4', { p: c.penalty }),
    h('h3', null, t('mrHowFair')), p('mrX5', { min: c.min, max: c.max, ce: c.capEstablished, cp: c.capProvisional }),
    h('h3', null, t('mrUnranked')), p('mrX6', { n: c.provisionalRounds }),
    h('h3', null, t('mrReliability')), p('mrX7')) });
}
// kept for older imports
export const mcsmRatingBox = mcsmRatingCard;
