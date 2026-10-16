// ui/rank-reveal.js
// "Besorolva": shown once to a driver who has just become ranked (after their 3rd calibration round).
// The publish step leaves profile.rankReveal = { r, q, s, g, rank, total, label }; the profile is
// already loaded, so showing it costs no reads. Closing it clears the note. It always comes first:
// the news carousel waits until it's closed. Preview: ?rankdemo
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../i18n/index.js';
import { session } from '../services/session.js';
import { backend } from '../services/backend.js';
import { reduced } from '../core/motion.js';
import { starRow } from './stars.js';
import { starsForRating } from './mcsm-rating.js';

const DEMO = { r: 131.46, q: 128.2, s: 134.9, g: 129.3, rank: 4, total: 62, label: 'MCSM31 / 3' };
const demo = () => { try { return new URLSearchParams(location.search).has('rankdemo'); } catch { return false; } };
const f1 = (v) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
const EASE = 'cubic-bezier(.2,.8,.2,1)';

let shown = false, open = false;
let settle = null;
const settled = { promise: Promise.resolve() };

// Something to show for this visit? (a note on the profile, or the preview address)
const pending = () => !shown && (demo() || !!(session.profile && session.profile.rankReveal && session.user));

// The news carousel calls this first, so the reveal is always on top and never fights with it.
export function revealSettled() {
  if (open || pending()) {
    if (!settle) settled.promise = new Promise((res) => { settle = res; });
    return settled.promise;
  }
  return Promise.resolve();
}

export function maybeShowRankReveal() {
  if (!pending() || open) return;
  const note = demo() ? DEMO : session.profile.rankReveal;
  if (!note || typeof note.r !== 'number') return;
  shown = true; open = true;
  revealSettled();
  show(note, !demo());
}

function arcPath(cx, cy, r, t0, t1) {
  const at = (tt) => { const a = ((225 - 270 * tt) * Math.PI) / 180; return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
  const [x0, y0] = at(t0), [x1, y1] = at(t1);
  return `M${x0.toFixed(2)} ${y0.toFixed(2)} A${r} ${r} 0 ${(t1 - t0) * 270 > 180 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`;
}

function show(note, real) {
  const still = reduced();
  const NS = 'http://www.w3.org/2000/svg';
  const dial = document.createElementNS(NS, 'svg');
  dial.setAttribute('viewBox', '0 0 200 200'); dial.setAttribute('class', 'rr-dial'); dial.setAttribute('aria-hidden', 'true');
  const tt = Math.max(0.01, Math.min(1, (note.r - 50) / 150));
  dial.innerHTML = `<path d="${arcPath(100, 100, 84, 0, 1)}" fill="none" stroke="var(--mr-track, rgba(255,255,255,.1))" stroke-width="14" stroke-linecap="round"/>`
    + `<path class="rr-arc" d="${arcPath(100, 100, 84, 0, tt)}" fill="none" stroke="var(--accent)" stroke-width="14" stroke-linecap="round" pathLength="100" stroke-dasharray="100 100" stroke-dashoffset="${still ? 0 : 100}"/>`;
  const num = h('b', { class: 'display rr-num' }, still ? f1(note.r) : '50,0');
  const stars = starRow(starsForRating(note.r), 'lg');
  const part = (k, v) => h('span', { class: 'rr-part' }, h('small', null, k), h('b', null, f1(v)));
  const parts = h('div', { class: 'rr-parts' }, part(t('quali'), note.q), part('Sprint', note.s), part("Gran'Prix", note.g));
  const rank = h('div', { class: 'rr-rank' }, h('b', { class: 'display' }, '#' + note.rank), h('span', null, t('rrOfTotal', { n: note.total })));
  const go = h('button', { class: 'btn primary block', type: 'button', 'data-haptic': '' }, t('rrContinue'));
  const profile = h('a', { class: 'btn block', href: '#/sajat' }, icon('user'), t('rrProfile'));
  const card = h('div', { class: 'rr-card', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('rrTitle') },
    h('div', { class: 'rr-kicker' }, 'MCSM RATING'),
    h('h2', { class: 'display rr-title' }, t('rrTitle')),
    h('p', { class: 'rr-sub' }, t('rrSub')),
    h('div', { class: 'rr-dialwrap' }, dial, h('div', { class: 'rr-center' }, num)),
    h('div', { class: 'rr-stars' }, stars),
    parts, rank,
    h('div', { class: 'rr-actions' }, go, profile));
  const overlay = h('div', { class: 'rr-overlay' }, card);
  document.body.append(overlay);
  const html = document.documentElement, prevOverflow = html.style.overflow;
  html.style.overflow = 'hidden';

  // the sequence (all transform/opacity; a tap fast-forwards to the end)
  const anims = [];
  const run = (el, kf, opts) => { if (still) return; const a = el.animate(kf, { fill: 'both', easing: EASE, ...opts }); anims.push(a); return a; };
  const rise = (el, delay, dur = 420) => run(el, [{ opacity: 0, transform: 'translateY(12px)' }, { opacity: 1, transform: 'none' }], { duration: dur, delay });
  let raf = 0, finished = still;
  const finish = () => {
    if (finished) return; finished = true;
    anims.forEach((a) => { try { a.finish(); } catch { /* */ } });
    cancelAnimationFrame(raf); num.textContent = f1(note.r);
    dial.querySelector('.rr-arc').setAttribute('stroke-dashoffset', '0');
  };
  if (!still) {
    run(overlay, [{ opacity: 0 }, { opacity: 1 }], { duration: 280 });
    run(card, [{ opacity: 0, transform: 'translateY(16px) scale(.97)' }, { opacity: 1, transform: 'none' }], { duration: 460 });
    rise(card.querySelector('.rr-kicker'), 120);
    run(card.querySelector('.rr-title'), [{ opacity: 0, transform: 'translateY(18px) scale(.94)', letterSpacing: '.18em' }, { opacity: 1, transform: 'none', letterSpacing: '.01em' }], { duration: 640, delay: 180 });
    rise(card.querySelector('.rr-sub'), 360);
    rise(card.querySelector('.rr-dialwrap'), 420, 380);
    // the dial sweeps and the number counts up together
    const arc = dial.querySelector('.rr-arc');
    run(arc, [{ strokeDashoffset: 100 }, { strokeDashoffset: 0 }], { duration: 1300, delay: 560, easing: 'cubic-bezier(.25,.8,.25,1)' });
    const t0 = performance.now() + 560;
    const tick = (now) => {
      const k = Math.max(0, Math.min(1, (now - t0) / 1300));
      const e = 1 - Math.pow(1 - k, 3);
      num.textContent = f1(50 + (note.r - 50) * e);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    [...stars.children].forEach((st, i) => run(st, [{ opacity: 0, transform: 'scale(.4) rotate(-20deg)' }, { opacity: 1, transform: 'none' }], { duration: 380, delay: 1850 + i * 90, easing: 'cubic-bezier(.34,1.56,.64,1)' }));
    [...parts.children].forEach((p, i) => rise(p, 2300 + i * 70, 360));
    rise(rank, 2550, 460);
    rise(card.querySelector('.rr-actions'), 2850, 360);
  }
  card.addEventListener('pointerdown', (e) => { if (!finished && !e.target.closest('a, button')) finish(); });

  const close = (thenHref) => {
    finish();
    html.style.overflow = prevOverflow;
    const end = () => { overlay.remove(); open = false; if (settle) { const s = settle; settle = null; s(); } if (thenHref) location.hash = thenHref; };
    if (still) end(); else { const a = overlay.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 220, easing: 'ease', fill: 'forwards' }); a.onfinish = end; }
    // clear the note so it shows once (the preview never writes)
    if (real && session.user) backend.users.save(session.user.uid, { rankReveal: null }).catch(() => {});
  };
  go.addEventListener('click', () => close());
  profile.addEventListener('click', (e) => { e.preventDefault(); close('#/sajat'); });
  document.addEventListener('keydown', function esc(e) { if (e.key === 'Escape' && overlay.isConnected) { document.removeEventListener('keydown', esc); close(); } });
  setTimeout(() => go.focus({ preventScroll: true }), still ? 0 : 2900);
}
