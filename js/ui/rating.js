// ui/rating.js
// The profile's rating panel: a rev-counter style DR gauge (needle sweeps up on load, class
// bands D–A+), the SR scale, and the GT7 career numbers from the GridStats sync.
import { h } from '../core/dom.js';
import { reduced, countUp, fmtInt, SPRING } from '../core/motion.js';
import { t, fmtDate } from '../i18n/index.js';

// Community-documented DR class boundaries (E = provisional, first five races).
export const DR_BOUNDS = [0, 4000, 10000, 30000, 50000, 100000];
export const DR_CLASSES = ['D', 'C', 'B', 'A', 'A+'];
const COLORS = ['#8A94B2', '#5B8DEF', '#38BDF8', '#A584FF', '#B6F03C'];
const SR_SCALE = ['E', 'D', 'C', 'B', 'A', 'S'];

// 0..1 along the dial: each class gets an equal slice, linear inside it.
export function drPosition(points, letter) {
  if (points != null && Number.isFinite(points)) {
    const p = Math.max(0, Math.min(points, DR_BOUNDS[5]));
    let i = 0; while (i < 4 && p >= DR_BOUNDS[i + 1]) i++;
    return (i + (p - DR_BOUNDS[i]) / (DR_BOUNDS[i + 1] - DR_BOUNDS[i])) / 5;
  }
  const i = DR_CLASSES.indexOf(letter);
  return i < 0 ? 0.02 : (i + 0.5) / 5;
}
export function nextClass(points) {
  if (points == null) return null;
  for (let i = 1; i < 5; i++) if (points < DR_BOUNDS[i]) return { cls: DR_CLASSES[i], need: DR_BOUNDS[i] - points };
  return null;
}

const CX = 130, CY = 124, R = 100, SWEEP = 220, START = 200;
const rad = (d) => (d * Math.PI) / 180;
const pt = (tt, r) => [CX + r * Math.cos(rad(START - SWEEP * tt)), CY - r * Math.sin(rad(START - SWEEP * tt))];
const arc = (t0, t1, r) => { const [x0, y0] = pt(t0, r), [x1, y1] = pt(t1, r); return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${(t1 - t0) * SWEEP > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
const svg = (tag, attrs, ...kids) => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, v); kids.forEach((k) => el.append(k)); return el; };

export function drGauge(p) {
  const pos = drPosition(p.drPoints, p.dr);
  const root = svg('svg', { viewBox: '0 0 260 196', class: 'gauge', role: 'img', 'aria-label': t('drGaugeLabel', { dr: p.dr || '–', pts: p.drPoints != null ? fmtInt(p.drPoints) : '–' }) });
  const fills = [];
  for (let i = 0; i < 5; i++) {
    const t0 = i / 5 + 0.004, t1 = (i + 1) / 5 - 0.004;
    root.append(svg('path', { d: arc(t0, t1, R), stroke: COLORS[i], 'stroke-opacity': '.18', 'stroke-width': '14', fill: 'none', 'stroke-linecap': 'butt' }));
    const f = Math.max(0, Math.min(1, (pos - i / 5) * 5));
    const fill = svg('path', { d: arc(t0, t1, R), stroke: COLORS[i], 'stroke-width': '14', fill: 'none', pathLength: '100', 'stroke-dasharray': '100 100', 'stroke-dashoffset': String(100 - f * 100) });
    fills.push({ el: fill, f, i }); root.append(fill);
  }
  ['0', '4K', '10K', '30K', '50K', '100K'].forEach((lbl, i) => {
    const [x0, y0] = pt(i / 5, R + 10), [x1, y1] = pt(i / 5, R + 17), [lx, ly] = pt(i / 5, R + 28);
    root.append(svg('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: 'currentColor', 'stroke-opacity': '.45', 'stroke-width': '2' }));
    root.append(svg('text', { x: lx, y: ly + 4, 'text-anchor': 'middle', class: 'g-tick' }, lbl));
  });
  for (let k = 1; k < 20; k++) { if (k % 4 === 0) continue; const [x0, y0] = pt(k / 20, R + 11), [x1, y1] = pt(k / 20, R + 14); root.append(svg('line', { x1: x0, y1: y0, x2: x1, y2: y1, stroke: 'currentColor', 'stroke-opacity': '.25', 'stroke-width': '1.5' })); }
  const [nx, ny] = pt(0, R - 6);
  const needle = svg('g', { class: 'g-needle' }, svg('line', { x1: CX, y1: CY, x2: nx, y2: ny, stroke: 'var(--red)', 'stroke-width': '4', 'stroke-linecap': 'round' }), svg('circle', { cx: CX, cy: CY, r: '10', fill: 'var(--bg-2)', stroke: 'var(--red)', 'stroke-width': '3' }));
  root.append(needle);
  const big = svg('text', { x: CX, y: CY - 32, 'text-anchor': 'middle', class: 'g-letter' }, p.dr || 'E');
  const ptsText = svg('text', { x: CX, y: CY + 38, 'text-anchor': 'middle', class: 'g-pts' }, p.drPoints != null ? '0' : '–');
  const ptsCap = svg('text', { x: CX, y: CY + 54, 'text-anchor': 'middle', class: 'g-tick' }, p.drPoints != null ? t('drPointsCap') : '');
  root.append(big, ptsText, ptsCap);
  const finalDeg = SWEEP * pos;
  const run = () => {
    if (reduced()) { needle.setAttribute('transform', `rotate(${finalDeg} ${CX} ${CY})`); if (p.drPoints != null) ptsText.textContent = fmtInt(p.drPoints); return; }
    needle.animate([{ transform: 'rotate(0deg)' }, { transform: `rotate(${Math.min(SWEEP, finalDeg + 14)}deg)`, offset: 0.62 }, { transform: `rotate(${finalDeg}deg)` }], { duration: 1300, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' });
    fills.forEach(({ el, f, i }) => { el.setAttribute('stroke-dashoffset', '100'); el.animate([{ strokeDashoffset: 100 }, { strokeDashoffset: 100 - f * 100 }], { duration: 300, delay: 80 + i * 170, easing: 'linear', fill: 'forwards' }); });
    if (p.drPoints != null) { const tmp = { set textContent(v) { ptsText.textContent = v; } }; countUp(tmp, 0, p.drPoints, 1100); }
  };
  needle.style.transformOrigin = `${CX}px ${CY}px`; needle.style.transformBox = 'view-box';
  requestAnimationFrame(() => requestAnimationFrame(run));
  return root;
}

export function ratingPanel(p) {
  const nxt = nextClass(p.drPoints);
  const note = p.drPoints == null ? t('drNoPoints') : nxt ? t('drNext', { cls: nxt.cls, n: fmtInt(nxt.need) }) : t('drTop');
  const gs = p.gtStats || null;
  const stat = (v, k) => h('div', null, h('div', { class: 'v display num' }, v == null ? '–' : fmtInt(v)), h('div', { class: 'k' }, k));
  return h('section', { class: 'rating-grid' },
    h('div', { class: 'panel gauge-card' }, h('div', { class: 'row-between' }, h('span', { class: 'label' }, 'Driver Rating'), h('span', { class: 'faint', style: 'font-size:12.5px' }, p.ratingsSyncedAt ? t('syncedAt', { date: fmtDate(p.ratingsSyncedAt) }) : t('notSyncedYet'))),
      drGauge(p), h('p', { class: 'gauge-note' }, note)),
    h('div', { class: 'stack', style: 'gap:12px' },
      h('div', { class: 'panel sr-card' }, h('span', { class: 'label' }, 'Sportsmanship Rating'),
        h('div', { class: 'sr-row' }, h('span', { class: 'sr-big display' }, p.sr || '–'),
          h('div', { class: 'sr-scale', role: 'img', 'aria-label': 'SR ' + (p.sr || '–') }, SR_SCALE.map((l) => h('span', { class: l === p.sr ? 'on' : SR_SCALE.indexOf(l) < SR_SCALE.indexOf(p.sr) ? 'past' : '' }, l))))),
      gs ? h('div', { class: 'panel', style: 'overflow:hidden' }, h('div', { class: 'label', style: 'padding:14px 16px 0' }, t('gt7Career') + (gs.country ? '  ' + gs.country : '')),
        h('div', { class: 'stat-row', style: 'border-top:0' }, stat(gs.races, t('statRaces')), stat(gs.wins, t('wins')), stat(gs.clean, t('statClean')))) : null));
}
