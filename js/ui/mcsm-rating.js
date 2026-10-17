// ui/mcsm-rating.js
// The MCSM Rating card on driver profiles (a dial for the rating, small rings for each part),
// and the "how is it calculated" explainer. Unranked drivers (fewer than 5 rounds) see no numbers.
// Preview with sample numbers: add ?mrdemo to the address (or ?mrdemo=unranked).
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { seg } from './controls.js';
import { starsFor, starRow } from './stars.js';
import { openSheet } from './sheet.js';
import { t, LANG } from '../i18n/index.js';
import { publicRatings } from '../services/mcsm-rating.js';
import { RATING_CFG } from '../engine/rating.js';

const f1 = (v) => (v == null ? '–' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));
const signed = (v) => (v > 0.05 ? '+' : v < -0.05 ? '−' : '±') + f1(Math.abs(v));
const DEMO = { e: 1, r: 131.46, q: 128.2, s: 134.9, g: 129.3, n: 23, hi: 133.1, dl: 1.84, h: [['MCSM25–30', 127.9, 125.1, 130.2, 126.9], ['MCSM31 / 1', 129.2, 126.4, 131.8, 128.0], ['MCSM31 / 2', 128.6, 127.9, 130.1, 127.5], ['MCSM31 / 3', 129.62, 127.2, 132.6, 128.2], ['MCSM32 / 2', 131.46, 128.2, 134.9, 129.3]] };
const demoMode = () => { try { const q = new URLSearchParams(location.search); return q.has('mrdemo') ? (q.get('mrdemo') === 'unranked' ? 'unranked' : 'ranked') : null; } catch { return null; } };

const SVGNS = 'http://www.w3.org/2000/svg';
const svgEl = (tag, attrs) => { const e = document.createElementNS(SVGNS, tag); Object.entries(attrs).forEach(([k, v]) => e.setAttribute(k, v)); return e; };
const SWEEP = 270, START = 225;
const at = (cx, cy, r, tt) => { const a = ((START - SWEEP * tt) * Math.PI) / 180; return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
const arcPath = (cx, cy, r, t0, t1) => { const [x0, y0] = at(cx, cy, r, t0), [x1, y1] = at(cx, cy, r, t1); return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${(t1 - t0) * SWEEP > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`; };
// dial range for display only (the rating itself has no upper cap)
const toT = (v, lo = 50, hi = 200) => Math.max(0, Math.min(1, (v - lo) / (hi - lo)));

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
// Standing = where the value sits among every ranked driver (same component), as a percentile.
// share of ranked drivers who are better (the best driver is at 0, shown as "Top 1%")
// Stars by fixed rating bands (same for the overall rating and each part), judged on the value as
// displayed (one decimal): 140+ = 5; 130–139.9 = 4.5; ... 60–69.9 = 1; below 60 = 0.5.
export function starsForRating(v) {
  if (v == null) return null;
  const r = Math.round(v * 10) / 10;
  if (r >= 140) return 5;
  if (r < 60) return 0.5;
  return 1 + Math.floor((r - 60) / 10) * 0.5;
}
export function percentileOf(all, v) { if (v == null || !all.length) return null; const better = all.filter((x) => x > v + 1e-9).length; return (better / all.length) * 100; }
export function standingFor_old(pct) {
  if (pct == null) return null;
  if (pct < 10) return ['up', t('mrTopPct', { n: Math.max(1, Math.ceil(pct)) })];
  if (pct <= 25) return ['up', t('mrBand25')];
  if (pct <= 45) return ['up', t('mrBand45')];
  if (pct <= 55) return ['par', t('mrBand55')];
  return ['down', t('mrBand100')];
}

export function mcsmRatingCard(uid) {
  const card = h('section', { class: 'panel mr-card' });
  const help = h('button', { class: 'mr-help', type: 'button', 'aria-label': t('mrHow'), title: t('mrHow'), onclick: explainRating }, '?');
  const demo = demoMode();
  const load = demo ? Promise.resolve({ drivers: { [uid]: demo === 'ranked' ? DEMO : { e: 0, n: 3 } } }) : publicRatings();
  load.then((P) => {
    const x = (P.drivers || {})[uid];
    const ranked = !!(x && x.e);
    const pool = Object.values(P.drivers || {}).filter((d) => d.e);
    const standing = (k, v) => starsForRating(v);
    const head = h('div', { class: 'mr-head' }, h('span', { class: 'label' }, 'MCSM Rating'), demo ? h('span', { class: 'mr-demo' }, t('mrDemo')) : null, help);
    // main dial
    const st = ranked ? standing('r', x.r) : null;
    const main = h('div', { class: 'mr-mainwrap' },
      dial({ size: 200, r: 84, stroke: 14, value: ranked ? x.r : null, color: 'var(--accent)', marker: false }),
      h('div', { class: 'mr-center' },
        ranked ? h('b', { class: 'display mr-big' }, f1(x.r)) : h('b', { class: 'display mr-unranked' }, t('mrUnranked')),
        ranked && x.dl ? h('span', { class: 'mr-delta ' + (x.dl > 0 ? 'up' : 'down') }, signed(x.dl)) : null),
      );
    const status = h('div', { class: 'mr-status' }, ranked ? starRow(st, 'lg') : t('mrRoundsToRank', { n: x ? x.n : 0, total: RATING_CFG.provisionalRounds }));
    // the parts
    const part = (label, v, color, opts = {}) => {
      const s2 = opts.noStanding ? null : ranked ? standing(opts.k, v) : null;
      return h('div', { class: 'mr-part' },
        h('div', { class: 'mr-ring' }, dial({ size: 64, r: 26, stroke: 5, value: ranked ? v : null, color, marker: false, lo: opts.lo, hi: opts.hi }), h('b', null, ranked ? (opts.fmt || f1)(v) : '–')),
        h('span', { class: 'mr-pname', style: `color:${color}` }, label), ranked && s2 ? starRow(s2, 'sm') : h('span', { class: 'mr-pstat' }, t('mrHidden', { n: RATING_CFG.provisionalRounds })));
    };
    const parts = h('div', { class: 'mr-parts' },
      part(t('quali'), x && x.q, '#38BDF8', { k: 'q' }), part('Sprint', x && x.s, 'var(--accent)', { k: 's' }), part("Gran'Prix", x && x.g, '#A584FF', { k: 'g' }));
    const hist = ranked && (x.h || []).length > 1 ? h('button', { class: 'linkish', type: 'button', onclick: () => ratingHistory(x) }, icon('bolt'), t('mrHistory')) : null;
    const facts = ranked ? h('div', { class: 'mr-facts2' }, h('span', null, t('mrHighest'), h('b', null, f1(x.hi))), h('span', null, t('mrRoundsDone'), h('b', null, x.n)), hist) : null;
    card.replaceChildren(head, h('div', { class: 'mr-body' }, main, status, parts), facts);
  }).catch(() => card.remove());
  return card;
}

// The "?" explanation on the MCSM Rating card. Edit the text here: each entry is a heading (h),
// a paragraph (p) or the formula box (f). Hungarian is shown by default, English when chosen.
const EXPLAIN = {
  hu: [
    { p: 'Az MCSM Rating egy teljesítményalapú értékelési rendszer, amely megmutatja, hogyan teljesítesz a többi MCSM-pilótához képest. Minél jobb eredményeket érsz el, különösen erősebb ellenfelekkel szemben, annál magasabb lehet az értékelésed.' },
    { p: 'A rendszer kizárólag a kvalifikáción, a sprinten és a Gran Prix-n elért helyezéseidet veszi figyelembe.' },
    { f: 'MCSM Rating = 20% Kvalifikáció + 40% Sprint + 40% Gran Prix' },
    { h: 'Hogyan változik a Rating?' },
    { p: 'Minden forduló után összehasonlítjuk az eredményedet az ellenfeleidével, figyelembe véve az ő értékelésüket is.' },
    { p: 'Ha egy nálad erősebb pilótát győzöl le, többet nyerhetsz, míg egy gyengébb ellenfél legyőzése kevesebbet ér. Ugyanez fordítva is igaz: ha a vártnál gyengébben teljesítesz, csökkenhet az értékelésed.' },
    { p: 'A rendszer az A, B és C lobbik eredményeit is egymáshoz viszonyítja, így minden pilóta ugyanazon a skálán szerepel.' },
    { h: 'Az első 3 forduló – Kalibráció' },
    { p: 'Új pilótaként az első három teljesített fordulódban a Ratinged még rejtett.' },
    { p: 'A rendszer minden fordulóban megbecsüli, milyen erős teljesítményt nyújtottál az adott mezőnyben. Ezek az eredmények már a többi pilóta értékelésére is hatással vannak.' },
    { p: 'A harmadik fordulód után a három teljesítményed átlagából megkapod az első hivatalos MCSM Ratingedet. Ettől kezdve az értékelésed minden további forduló után a megszokott módon változik.' },
    { h: 'Előzmények és a skála' },
    { p: 'A korábbi pilóták kezdőértékelését az MCSM25–30 eredményei alapján számoltuk ki. Az MCSM31-től kezdve a Rating minden lezárt forduló után frissül. Ha nem versenyzel, az értékelésed nem változik.' },
    { h: 'Csillagok' },
    { stars: ['Csillagérték', 'Összpontszám'] },
    { note: 'Ugyanez a skála vonatkozik a Kvalifikáció, a Sprint és a Gran\'Prix értékére is.' },
  ],
  en: [
    { p: 'The MCSM Rating is a performance-based rating that shows how you perform compared with the other MCSM drivers. The better your results, especially against stronger opponents, the higher your rating can be.' },
    { p: 'It only takes your finishing positions in qualifying, the sprint and the Grand Prix into account.' },
    { f: 'MCSM Rating = 20% Qualifying + 40% Sprint + 40% Grand Prix' },
    { h: 'How does the rating change?' },
    { p: "After every round your result is compared with your opponents', taking their ratings into account too." },
    { p: 'Beating a stronger driver can gain you more, while beating a weaker one is worth less. It works the other way too: if you do worse than expected, your rating can drop.' },
    { p: 'Results from lobbies A, B and C are compared with each other, so every driver is on the same scale.' },
    { h: 'The first 3 rounds – calibration' },
    { p: 'As a new driver, your rating stays hidden for your first three completed rounds.' },
    { p: 'Each round, the system estimates how strong your performance was in that field. These results already count towards the other drivers\' ratings.' },
    { p: 'After your third round, the average of those three performances becomes your first official MCSM Rating. From then on it changes after every round as normal.' },
    { h: 'History and the scale' },
    { p: "Returning drivers' starting ratings were calculated from the MCSM25–30 results. From MCSM31 the rating updates after every finished round. If you don't race, your rating doesn't change." },
    { h: 'Stars' },
    { stars: ['Star rating', 'Rating'] },
    { note: "The same scale applies to the Qualifying, Sprint and Gran'Prix values." },
  ],
};

// The star bands as a small table: value, the stars themselves, and the rating needed.
function starTable([colStars, colRating]) {
  const bands = [[5, 140], [4.5, 130], [4, 120], [3.5, 110], [3, 100], [2.5, 90], [2, 80], [1.5, 70], [1, 60], [0.5, 50]];
  const cell = 'display:grid;grid-template-columns:40px 1fr auto;align-items:center;gap:12px;padding:8px 12px';
  return h('div', { style: 'border:1px solid var(--line);border-radius:12px;overflow:hidden;margin:6px 0 0' },
    h('div', { style: cell + ';background:var(--bg-3);font-size:11.5px;font-weight:850;letter-spacing:.06em;text-transform:uppercase;color:var(--ink-3)' }, h('span', { style: 'grid-column:1 / 3' }, colStars), h('span', null, colRating)),
    ...bands.map(([v, min], i) => h('div', { style: cell + (i ? ';border-top:1px solid var(--line)' : '') },
      h('b', { style: 'font-variant-numeric:tabular-nums' }, v.toFixed(1).replace('.', ',')),
      starRow(v, 'sm'),
      h('b', { style: 'font-variant-numeric:tabular-nums;color:var(--accent-text)' }, min + '+'))));
}

export function explainRating() {
  const blocks = EXPLAIN[LANG] || EXPLAIN.hu;
  openSheet({ title: t('mrHowTitle'), body: h('div', { class: 'md mr-explain' },
    blocks.map((b) => (b.h ? h('h3', null, b.h) : b.f ? h('div', { class: 'mr-formula' }, b.f) : b.stars ? starTable(b.stars) : b.note ? h('p', { style: 'font-size:13px;color:var(--ink-3);margin-top:8px' }, b.note) : h('p', null, b.p)))) });
}

// Rating history: one point per round raced as an established driver, newest last.
export function ratingHistory(x) {
  const all = (x.h || []).map((e) => (Array.isArray(e) ? e : [e.l, e.r, e.q, e.s, e.g]));
  let range = all.length > 10 ? 10 : 0;
  const box = h('div');
  const draw = () => {
    const pts = range ? all.slice(-range) : all;
    const vals = pts.flatMap((r) => [r[1], r[2], r[3], r[4]]);
    const lo = Math.floor(Math.min(...vals) - 2), hi = Math.ceil(Math.max(...vals) + 2);
    const W = 640, H = 260, L = 40, R = 12, T = 12, Bt = 54;
    const X = (i) => L + (pts.length < 2 ? (W - L - R) / 2 : (i / (pts.length - 1)) * (W - L - R));
    const Y = (v) => T + (1 - (v - lo) / Math.max(1, hi - lo)) * (H - T - Bt);
    const line = (k, color, width, dash = '') => `<polyline points="${pts.map((r, i) => `${X(i).toFixed(1)},${Y(r[k]).toFixed(1)}`).join(' ')}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linejoin="round" stroke-linecap="round" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
    const ticks = [lo, (lo + hi) / 2, hi].map((v) => `<text x="${L - 6}" y="${Y(v) + 4}" text-anchor="end" class="mh-tick">${Math.round(v)}</text><line x1="${L}" x2="${W - R}" y1="${Y(v)}" y2="${Y(v)}" class="mh-grid"/>`).join('');
    const labels = pts.map((r, i) => `<text x="${X(i)}" y="${H - Bt + 16}" text-anchor="end" transform="rotate(-35 ${X(i)} ${H - Bt + 16})" class="mh-tick">${r[0]}</text>`).join('');
    const dots = pts.map((r, i) => `<circle cx="${X(i)}" cy="${Y(r[1])}" r="3.5" fill="var(--accent)"><title>${r[0]}: ${f1(r[1])}</title></circle>`).join('');
    const svg = document.createElementNS(SVGNS, 'svg');
    svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'mh-chart');
    svg.innerHTML = ticks + line(2, '#38BDF8', 1.6, '4 4') + line(3, 'var(--accent)', 1.6, '4 4') + line(4, '#A584FF', 1.6, '4 4') + line(1, 'var(--ink)', 3) + dots + labels;
    box.replaceChildren(svg, h('div', { class: 'mh-legend' }, h('span', null, h('i', { style: 'background:var(--ink)' }), 'MCSM Rating'), h('span', null, h('i', { style: 'background:#38BDF8' }), t('quali')), h('span', null, h('i', { style: 'background:var(--accent)' }), 'Sprint'), h('span', null, h('i', { style: 'background:#A584FF' }), "Gran'Prix")),
      h('div', { class: 'mh-table' }, pts.slice().reverse().map((r, i, arr) => { const prev = arr[i + 1]; const d = prev ? r[1] - prev[1] : null; return h('div', null, h('span', null, r[0]), h('b', null, f1(r[1])), h('small', { class: d > 0 ? 'up' : d < 0 ? 'down' : '' }, d == null ? '' : signed(d))); })));
  };
  const opts = [5, 10, 15].filter((n) => n < all.length).map((n) => ({ value: n, label: t('mrLastN', { n }) }));
  const ctrl = seg([...opts, { value: 0, label: t('mrAllTime') }], range, (v) => { range = v; draw(); }, { scroll: true });
  draw();
  openSheet({ title: t('mrHistory'), body: h('div', null, h('div', { style: 'margin-bottom:10px' }, ctrl), box) });
}
// kept for older imports
export const mcsmRatingBox = mcsmRatingCard;
