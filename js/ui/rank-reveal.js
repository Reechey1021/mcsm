// ui/rank-reveal.js
// Full-screen moments, shown once and always before anything else (the news carousel waits):
//  - "Besorolva!" when a driver has just become ranked (profile.rankReveal)
//  - the round recap "Eredményeid" when a round's results are final (profile.roundRecap; built in
//    model/recap.js): places, rating before → after (or first rating, or calibration progress),
//    championship movement.
// The notes are already on the loaded profile, so nothing extra is read. Closing clears the note.
// Previews (nothing saved): ?rankdemo  ?resultsdemo=up|down|ranked|calib
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../i18n/index.js';
import { session } from '../services/session.js';
import { backend } from '../services/backend.js';
import { reduced } from '../core/motion.js';
import { starRow } from './stars.js';
import { starsForRating } from './mcsm-rating.js';
import { trophy } from './trophy.js';

const EASE = 'cubic-bezier(.2,.8,.2,1)';
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
const param = (k) => { try { const q = new URLSearchParams(location.search); if (q.has(k)) return q.get(k) || '1'; const m = new RegExp('[?&]' + k + '(?:=([^&]*))?(?:&|$)').exec(location.hash); return m ? (m[1] || '1') : null; } catch { return null; } };

// ----- previews
const DEMO_CARDS = { q: { pos: 5 }, s: { pos: 8 }, g: { pos: 3 } };
const DEMOS = {
  rank: { kind: 'rank', r: 131.46, q: 128.2, s: 134.9, g: 129.3, rank: 4, total: 62 },
  up: { kind: 'recap', mode: 'rated', sid: 'mcsm31', no: 31, n: 2, lobby: 'A', cards: DEMO_CARDS, before: 129.1, after: 131.5, delta: 2.4, high: true, champ: { now: 5, prev: 7 } },
  down: { kind: 'recap', mode: 'rated', sid: 'mcsm31', no: 31, n: 2, lobby: 'B', cards: { q: { pos: 11 }, s: { st: 'DNF' }, g: { pos: 9 } }, before: 112.6, after: 111.3, delta: -1.3, high: false, champ: { now: 12, prev: 11 } },
  ranked: { kind: 'recap', mode: 'ranked', sid: 'mcsm31', no: 31, n: 3, lobby: 'B', cards: { q: { pos: 4 }, s: { pos: 6 }, g: { pos: 2 } }, after: 118.4, rank: 23, total: 61, champ: { now: 14, prev: 17 } },
  calib: { kind: 'recap', mode: 'calib', sid: 'mcsm31', no: 31, n: 2, lobby: 'C', cards: { q: { pos: 7 }, s: { pos: 5 }, g: { pos: 4 } }, done: 2, total: 3, champ: { now: 31, prev: 31 } },
};
const FIN = (pos, extra = {}) => ({ kind: 'recap', mode: 'rated', sid: 'mcsm31', no: 31, n: 3, lobby: pos <= 3 ? 'A' : 'B', cards: { q: { pos: Math.max(1, pos - 1) }, s: { pos }, g: { pos } },
  before: 129.1, after: 131.5, delta: 2.4, high: pos === 1, champ: { now: pos, prev: pos + 1 },
  finale: { pos, field: 47, points: [0, 1897, 1840, 1801][pos] || 1214, wins: [0, 4, 2, 1][pos] || 0, podiums: [0, 6, 5, 3][pos] || 1, rating: { end: 131.5, change: pos <= 3 ? 6.4 : -1.8 }, team: { name: 'SUPERSONIC', pos: pos <= 3 ? 1 : 6 }, gt: pos === 2 ? { tag: 'MGTK', pos: 1 } : null, ...extra } });
DEMOS.champion = FIN(1); DEMOS.silver = FIN(2); DEMOS.bronze = FIN(3); DEMOS.final = FIN(12);
function demoView() {
  if (param('rankdemo')) return DEMOS.rank;
  const r = param('resultsdemo');
  return r ? DEMOS[r] || DEMOS.up : null;
}

// ----- queue and ordering
let open = false, demoShown = false;
const seen = { recap: false, rank: false };
let settle = null;
const settled = { promise: Promise.resolve() };
const prof = () => (session.user && session.profile) || {};
const pending = () => (demoView() && !demoShown) || (prof().roundRecap && !seen.recap) || (prof().rankReveal && !seen.rank);

// The news carousel waits for this, so these screens always come first.
export function revealSettled() {
  if (open || pending()) { if (!settle) settled.promise = new Promise((res) => { settle = res; }); return settled.promise; }
  return Promise.resolve();
}
const release = () => { if (!open && !pending() && settle) { const s = settle; settle = null; s(); } };

export function maybeShowRankReveal() {
  if (open) return;
  let view = null, field = null;
  const d = demoView();
  if (d && !demoShown) { demoShown = true; view = d; }
  else if (prof().roundRecap && !seen.recap) { seen.recap = true; view = { kind: 'recap', ...prof().roundRecap }; field = 'roundRecap'; }
  else if (prof().rankReveal && !seen.rank) { seen.rank = true; view = { kind: 'rank', ...prof().rankReveal }; field = 'rankReveal'; }
  if (!view) { release(); return; }
  if (view.kind === 'recap' && view.mode === 'ranked') seen.rank = true;   // the recap already is the "Besorolva!" moment
  open = true; revealSettled();
  show(view, () => {
    if (field && session.user) {
      const clear = { [field]: null };
      if (view.kind === 'recap' && view.mode === 'ranked' && prof().rankReveal) clear.rankReveal = null;
      backend.users.save(session.user.uid, clear).catch(() => {});
    }
    open = false;
    setTimeout(() => { maybeShowRankReveal(); release(); }, 120);
  });
}

// Replay from the round page (nothing is saved or cleared).
export function playRecap(note) { if (!open && note) { open = true; show({ kind: 'recap', ...note }, () => { open = false; release(); }); } }

// ----- drawing
const NS = 'http://www.w3.org/2000/svg';
const toT = (v) => Math.max(0.004, Math.min(1, (v - 50) / 150));
function arcPath(cx, cy, r, t0, t1) {
  const at = (tt) => { const a = ((225 - 270 * tt) * Math.PI) / 180; return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
  const [x0, y0] = at(t0), [x1, y1] = at(t1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${(t1 - t0) * 270 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}
const svg = () => { const s = document.createElementNS(NS, 'svg'); s.setAttribute('viewBox', '0 0 200 200'); s.setAttribute('class', 'rr-dial'); s.setAttribute('aria-hidden', 'true'); return s; };
const TRACK = (s) => s.insertAdjacentHTML('beforeend', `<path d="${arcPath(100, 100, 84, 0, 1)}" fill="none" stroke="var(--mr-track, rgba(255,255,255,.1))" stroke-width="14" stroke-linecap="round"/>`);

const cardTxt = (c) => (!c ? '–' : c.pos ? 'P' + c.pos : c.st);
function champLine(c) {
  if (!c || !c.now) return null;
  const d = c.prev ? c.prev - c.now : 0;
  if (!c.prev) return h('div', { class: 'rr-champ' }, t('rcChampNow', { p: c.now }));
  if (d > 0) return h('div', { class: 'rr-champ up' }, h('b', null, '▲ ' + d), ' ', t('rcChampUp', { p: c.now }));
  if (d < 0) return h('div', { class: 'rr-champ down' }, h('b', null, '▼ ' + -d), ' ', t('rcChampDown', { p: c.now }));
  return h('div', { class: 'rr-champ' }, t('rcChampSame', { p: c.now }));
}

function show(v, onClosed) {
  const still = reduced();
  const anims = [];
  const run = (el, kf, opts) => { if (still || !el) return null; const a = el.animate(kf, { fill: 'both', easing: EASE, ...opts }); anims.push(a); return a; };
  const rise = (el, delay, dur = 420) => run(el, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: dur, delay });
  let raf = 0;
  const counters = [];
  const count = (el, from, to, delay, dur, fmt) => {
    if (still) { el.textContent = fmt(to); return; }
    el.textContent = fmt(from);
    const t0 = performance.now() + delay;
    const tick = (now) => { const k = Math.max(0, Math.min(1, (now - t0) / dur)); el.textContent = fmt(from + (to - from) * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    counters.push(() => { el.textContent = fmt(to); });
  };

  const recap = v.kind === 'recap';
  const mode = recap ? v.mode : 'rank';
  const ranked = mode === 'rank' || mode === 'ranked';
  // header
  const kicker = recap ? `MCSM${v.no} · ${t('roundN', { n: v.n }).toUpperCase()}` + (v.lobby ? ' · ' + t('lobbyX', { l: v.lobby }).toUpperCase() : '') : 'MCSM RATING';
  const title = ranked ? t('rrTitle') : t('rcTitle');
  const sub = mode === 'rank' ? t('rrSub') : mode === 'ranked' ? t('rcSubRanked', { no: v.no, n: v.n }) : t('rcSub', { no: v.no, n: v.n });
  // centre: rating dial / calibration ring / nothing
  let centre = null, below = [];
  const dialWrap = (s, inner) => h('div', { class: 'rr-dialwrap' }, s, h('div', { class: 'rr-center' }, inner));
  if (mode === 'rank' || mode === 'ranked' || mode === 'rated') {
    const s = svg(); TRACK(s);
    const after = mode === 'rank' ? v.r : v.after;
    const from = mode === 'rated' ? v.before : 50;
    const hi = Math.max(toT(from), toT(after));
    s.insertAdjacentHTML('beforeend', `<path class="rr-arc" d="${arcPath(100, 100, 84, 0, hi)}" fill="none" stroke="var(--accent)" stroke-width="14" stroke-linecap="round" pathLength="100" stroke-dasharray="100 100" stroke-dashoffset="${100 * (1 - toT(after) / hi)}"/>`);
    const num = h('b', { class: 'display rr-num' }, f1(after));
    centre = dialWrap(s, num);
    const arc = s.querySelector('.rr-arc');
    run(arc, [{ strokeDashoffset: 100 * (1 - toT(from) / hi) }, { strokeDashoffset: 100 * (1 - toT(after) / hi) }], { duration: 1300, delay: 560, easing: 'cubic-bezier(.25,.8,.25,1)' });
    count(num, from, after, 560, 1300, f1);
    const stars = h('div', { class: 'rr-stars' }, starRow(starsForRating(after), 'lg'));
    below.push(stars);
    [...stars.firstChild.children].forEach((st, i) => run(st, [{ opacity: 0, transform: 'scale(.4) rotate(-20deg)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 1850 + i * 90, easing: 'cubic-bezier(.34,1.56,.64,1)' }));
    if (mode === 'rated') {
      const up = v.delta >= 0;
      const chips = h('div', { class: 'rr-chips' }, h('span', { class: 'rr-delta ' + (up ? 'up' : 'down') }, (up ? '▲ +' : '▼ −') + f1(Math.abs(v.delta))), v.high ? h('span', { class: 'rr-high' }, t('rcHigh')) : null);
      below.push(chips);
      [...chips.children].forEach((c, i) => run(c, [{ opacity: 0, transform: 'scale(.6)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 1900 + i * 140, easing: 'cubic-bezier(.34,1.56,.64,1)' }));
    }
  } else if (mode === 'calib') {
    const s = svg();
    const total = v.total || 3, done = Math.max(1, Math.min(total, v.done || 1));
    const gap = 0.035, segs = [];
    for (let i = 0; i < total; i++) {
      const a = i / total + (i ? gap / 2 : 0), b = (i + 1) / total - (i < total - 1 ? gap / 2 : 0);
      s.insertAdjacentHTML('beforeend', `<path d="${arcPath(100, 100, 84, a, b)}" fill="none" stroke="var(--mr-track, rgba(255,255,255,.1))" stroke-width="14" stroke-linecap="round"/>`);
      if (i < done) { s.insertAdjacentHTML('beforeend', `<path class="rr-seg" d="${arcPath(100, 100, 84, a, b)}" fill="none" stroke="var(--calib, #38BDF8)" stroke-width="14" stroke-linecap="round" pathLength="100" stroke-dasharray="100 100" stroke-dashoffset="0"/>`); segs.push(s.lastChild); }
    }
    const big = h('b', { class: 'display rr-num rr-calnum' }, `${done}/${total}`);
    centre = dialWrap(s, h('div', { class: 'rr-calc' }, big, h('small', null, t('rcCalib'))));
    // earlier rounds already filled; this round's segment fills now
    const last = segs[segs.length - 1];
    run(last, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 900, delay: 700, easing: 'cubic-bezier(.25,.8,.25,1)' });
    run(big, [{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'none' }], { duration: 420, delay: 1350, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    below.push(h('p', { class: 'rr-calnote' }, t('rcCalibNote', { n: total - done })));
  }
  // places (recaps) / rating parts (rank reveal)
  const card = (k, val) => h('span', { class: 'rr-part' }, h('small', null, k), h('b', null, val));
  const parts = recap
    ? h('div', { class: 'rr-parts rr-places' }, card(t('quali'), cardTxt(v.cards && v.cards.q)), card('Sprint', cardTxt(v.cards && v.cards.s)), card("Gran'Prix", cardTxt(v.cards && v.cards.g)))
    : h('div', { class: 'rr-parts' }, card(t('quali'), f1(v.q)), card('Sprint', f1(v.s)), card("Gran'Prix", f1(v.g)));
  const bottomLine = ranked ? h('div', { class: 'rr-rank' }, h('b', { class: 'display' }, '#' + v.rank), h('span', null, t('rrOfTotal', { n: v.total }))) : champLine(v.champ);
  // buttons
  const go = recap && v.finale ? h('button', { class: 'btn primary block', type: 'button', 'data-haptic': '' }, t('rcContinue'))
    : recap ? h('a', { class: 'btn primary block', href: `#/szezonok/${v.sid}/fordulo/${v.n}`, 'data-haptic': '' }, t('rcFull')) : h('button', { class: 'btn primary block', type: 'button', 'data-haptic': '' }, t('rrContinue'));
  const second = recap ? h('button', { class: 'btn block', type: 'button' }, t('close')) : h('a', { class: 'btn block', href: '#/sajat' }, icon('user'), t('rrProfile'));
  const cardEl = h('div', { class: 'rr-card' + (recap ? ' rr-recap' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'rr-kicker' }, kicker),
    h('h2', { class: 'display rr-title' }, title),
    h('p', { class: 'rr-sub' }, sub),
    recap ? parts : null,
    centre, ...below,
    recap ? null : parts,
    bottomLine,
    h('div', { class: 'rr-actions' }, go, second));
  const overlay = h('div', { class: 'rr-overlay' }, cardEl);
  document.body.append(overlay);
  const html = document.documentElement, prevOverflow = html.style.overflow;
  html.style.overflow = 'hidden';
  // sequence
  run(overlay, [{ opacity: 0 }, { opacity: 1 }], { duration: 280 });
  run(cardEl, [{ opacity: 0, transform: 'translateY(16px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 460 });
  rise(cardEl.querySelector('.rr-kicker'), 120);
  run(cardEl.querySelector('.rr-title'), [{ opacity: 0, transform: 'translateY(18px) scale(.94)', letterSpacing: '.18em' }, { opacity: 1, transform: 'none', letterSpacing: '.01em' }], { duration: 640, delay: 180 });
  rise(cardEl.querySelector('.rr-sub'), 360);
  if (recap) [...parts.children].forEach((p, i) => rise(p, 420 + i * 80, 380));
  rise(centre, recap ? 520 : 420, 380);
  if (!recap) [...parts.children].forEach((p, i) => rise(p, 2300 + i * 70, 360));
  rise(bottomLine, recap ? 2350 : 2550, 460);
  rise(cardEl.querySelector('.rr-actions'), recap ? 2650 : 2850, 360);
  let finished = still;
  const finish = () => { if (finished) return; finished = true; anims.forEach((a) => { try { a.finish(); } catch { /* */ } }); cancelAnimationFrame(raf); counters.forEach((f) => f()); };
  cardEl.addEventListener('pointerdown', (e) => { if (!finished && !e.target.closest('a, button')) finish(); });

  const close = (thenHref, then) => {
    finish();
    html.style.overflow = prevOverflow;
    const end = () => { overlay.remove(); if (then) { then(); return; } onClosed(); if (thenHref) location.hash = thenHref; };
    if (still) end(); else { const a = overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease', fill: 'forwards' }); a.onfinish = end; }
  };
  go.addEventListener('click', (e) => {
    if (recap && v.finale) { close(null, () => showFinale({ sid: v.sid, no: v.no, ...v.finale }, onClosed)); return; }
    if (go.tagName === 'A') { e.preventDefault(); close(go.getAttribute('href')); } else close();
  });
  second.addEventListener('click', (e) => { if (second.tagName === 'A') { e.preventDefault(); close(second.getAttribute('href')); } else close(); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape' && overlay.isConnected) { document.removeEventListener('keydown', esc); close(); } });
  setTimeout(() => go.focus({ preventScroll: true }), still ? 0 : 2900);
}

// ----- the season card: shown after the last round's recap
const METAL = ['#F2C14E', '#C9D2E3', '#D4884A'];
function showFinale(v, onClosed) {
  const still = reduced();
  const anims = [];
  const run = (el, kf, opts) => { if (still || !el) return null; const a = el.animate(kf, { fill: 'both', easing: EASE, ...opts }); anims.push(a); return a; };
  const rise = (el, delay, dur = 420) => run(el, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: dur, delay });
  const medal = v.pos <= 3 ? v.pos - 1 : -1;
  const title = medal === 0 ? t('fnChampion') : medal === 1 ? t('fnSilver') : medal === 2 ? t('fnBronze') : t('fnTitle');
  const sub = medal === 0 ? t('fnSubChamp', { no: v.no }) : t('fnSub', { no: v.no, p: v.pos });
  // the hero: a trophy for the podium, a big position for everyone else
  let hero, burst = null, num = null;
  if (medal >= 0) {
    const tr = h('span', { class: 'fn-trophy m' + medal }, trophy(medal, 88));
    if (medal === 0 && !still) {
      burst = h('span', { class: 'fn-burst', 'aria-hidden': 'true' }, ...Array.from({ length: 22 }, (_, i) => h('i', { style: `--a:${(i * 360) / 22}deg;--d:${70 + (i % 4) * 16}px;--s:${0.5 + (i % 3) * 0.3};background:${i % 3 ? '#F2C14E' : '#FFF1B8'}` })));
    }
    hero = h('div', { class: 'fn-hero' }, h('span', { class: 'fn-ring m' + medal, 'aria-hidden': 'true' }), burst, tr);
  } else {
    num = h('b', { class: 'display fn-pos' }, 'P' + (still ? v.pos : v.field));
    hero = h('div', { class: 'fn-hero' }, num);
  }
  const tile = (k, val, cls = '') => h('span', { class: 'rr-part fn-stat ' + cls }, h('small', null, k), h('b', null, val));
  const rating = v.rating && v.rating.change != null ? tile(t('fnRating'), (v.rating.change >= 0 ? '▲ +' : '▼ −') + f1(Math.abs(v.rating.change)), v.rating.change >= 0 ? 'up' : 'down')
    : v.calib ? tile(t('fnRating'), `${v.calib.done}/${v.calib.total}`) : tile(t('fnRating'), v.rating ? f1(v.rating.end) : '–');
  const stats = h('div', { class: 'rr-parts fn-stats' },
    tile(t('fnPoints'), String(v.points)), tile(t('fnWinsPodiums'), `${v.wins} · ${v.podiums}`), rating,
    tile(v.team ? v.team.name : t('fnTeam'), v.team ? v.team.pos + '.' : '–'));
  const extra = v.gt ? h('div', { class: 'rr-champ' }, t('fnGt', { tag: v.gt.tag, p: v.gt.pos })) : null;
  const go = h('a', { class: 'btn primary block', href: `#/eredmenyek/${v.sid}`, 'data-haptic': '' }, t('fnStandings'));
  const close = h('button', { class: 'btn block', type: 'button' }, t('close'));
  const titleEl = h('h2', { class: 'display rr-title fn-title' + (medal >= 0 ? ' metal m' + medal : '') }, title);
  const card = h('div', { class: 'rr-card rr-recap fn-card' + (medal === 0 ? ' fn-champ' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'rr-kicker' }, `MCSM${v.no} · ${t('fnKicker')}`), hero, titleEl, h('p', { class: 'rr-sub' }, sub), stats, extra, h('div', { class: 'rr-actions' }, go, close));
  const overlay = h('div', { class: 'rr-overlay' }, card);
  document.body.append(overlay);
  const html = document.documentElement, prevOverflow = html.style.overflow;
  html.style.overflow = 'hidden';
  run(card, [{ opacity: 0, transform: 'translateY(16px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 420 });
  rise(card.querySelector('.rr-kicker'), 100);
  let raf = 0;
  if (medal >= 0) {
    run(hero.querySelector('.fn-trophy'), [{ opacity: 0, transform: 'scale(.3) rotate(-14deg)' }, { opacity: 1, transform: 'scale(1.08) rotate(3deg)', offset: .7 }, { opacity: 1, transform: 'none' }], { duration: 760, delay: 260, easing: 'cubic-bezier(.34,1.56,.64,1)' });
    run(hero.querySelector('.fn-ring'), [{ opacity: .9, transform: 'scale(.4)' }, { opacity: 0, transform: 'scale(1.7)' }], { duration: 900, delay: 620, easing: 'cubic-bezier(.2,.8,.2,1)' });
    if (burst) [...burst.children].forEach((d, i) => run(d, [{ opacity: 1, transform: 'rotate(var(--a)) translateX(0) scale(var(--s))' }, { opacity: 0, transform: 'rotate(var(--a)) translateX(var(--d)) scale(.2)' }], { duration: 950 + (i % 5) * 70, delay: 640, easing: 'cubic-bezier(.15,.75,.3,1)' }));
  } else if (!still) {
    // the position rolls down from the back of the field
    const t0 = performance.now() + 300;
    const tick = (now) => { const k = Math.max(0, Math.min(1, (now - t0) / 1300)); num.textContent = 'P' + Math.round(v.field + (v.pos - v.field) * (1 - Math.pow(1 - k, 3))); if (k < 1) raf = requestAnimationFrame(tick); };
    raf = requestAnimationFrame(tick);
    run(num, [{ opacity: 0, transform: 'scale(.8)' }, { opacity: 1, transform: 'none' }], { duration: 400, delay: 250 });
  }
  run(titleEl, [{ opacity: 0, transform: 'translateY(14px) scale(.95)' }, { opacity: 1, transform: 'none' }], { duration: 560, delay: medal >= 0 ? 700 : 1000 });
  rise(card.querySelector('.rr-sub'), medal >= 0 ? 860 : 1150);
  [...stats.children].forEach((s, i) => rise(s, 1250 + i * 80, 380));
  rise(extra, 1600);
  rise(card.querySelector('.rr-actions'), 1800, 360);
  let finished = still;
  const finish = () => { if (finished) return; finished = true; anims.forEach((a) => { try { a.finish(); } catch { /* */ } }); cancelAnimationFrame(raf); if (num) num.textContent = 'P' + v.pos; };
  card.addEventListener('pointerdown', (e) => { if (!finished && !e.target.closest('a, button')) finish(); });
  const done = (href) => {
    finish(); html.style.overflow = prevOverflow;
    const end = () => { overlay.remove(); onClosed(); if (href) location.hash = href; };
    if (still) end(); else { const a = overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease', fill: 'forwards' }); a.onfinish = end; }
  };
  go.addEventListener('click', (e) => { e.preventDefault(); done(go.getAttribute('href')); });
  close.addEventListener('click', () => done());
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape' && overlay.isConnected) { document.removeEventListener('keydown', esc); done(); } });
  setTimeout(() => go.focus({ preventScroll: true }), still ? 0 : 1900);
}
