// core/motion.js
// The motion system: press feedback with spring release, FLIP reordering, count-ups,
// sliding indicators and haptics. Everything respects prefers-reduced-motion.
import { $$ } from './dom.js';

/* ===== Motion ===== */
export const RM = matchMedia('(prefers-reduced-motion: reduce)');
export const reduced = () => RM.matches;
export const LINEAR_OK = typeof CSS !== 'undefined' && CSS.supports && CSS.supports('animation-timing-function', 'linear(0, 0.5, 1)');
export function spring(stiffness, damping, fallback) {
  let x = 0, v = 0, t = 0; const dt = 1 / 120, pts = [0];
  for (let i = 0; i < 720; i++) {
    const f = -stiffness * (x - 1) - damping * v; v += f * dt; x += v * dt; t += dt;
    if (i % 2 === 1) pts.push(+x.toFixed(4));
    if (Math.abs(x - 1) < 0.0008 && Math.abs(v) < 0.02) break;
  }
  pts.push(1);
  return { easing: LINEAR_OK ? `linear(${pts.join(',')})` : fallback, duration: Math.round(t * 1000) };
}
export const SPRING = {
  press: spring(700, 26, 'cubic-bezier(.3,1.6,.5,1)'),
  move: spring(380, 30, 'cubic-bezier(.2,1,.3,1)'),
  pop: spring(420, 20, 'cubic-bezier(.3,1.5,.5,1)'),
  sheet: spring(300, 30, 'cubic-bezier(.2,1,.3,1)'),
};
export function haptic(ms = 8) { try { if (!reduced() && navigator.vibrate) navigator.vibrate(ms); } catch { /* unsupported */ } }

export const PRESS_SEL = '.btn, .team-opt, .row-card, .tile, .switch, .tap, .chip, .seg button, .icon-btn, .trow, .drv-card, .round-item, .tabbar a, .menu-item, .notif, .pchip, .season-card, .order .acts button, .grid-slot';
export const PRESS_SOFT = '.team-opt, .row-card, .tile, .trow, .drv-card, .round-item, .season-card, .notif, .menu-item, .grid-slot';
export function initPress() {
  let active = null;
  document.addEventListener('pointerdown', (e) => {
    if (e.button > 0) return;
    const el = e.target.closest(PRESS_SEL);
    if (!el || el.disabled) return;
    active = el;
    if (el.matches('[data-haptic], .btn.primary, .tabbar a, .chip, .seg button, .pchip')) haptic(7);
    if (reduced()) return;
    const to = el.matches(PRESS_SOFT) ? 0.985 : (el.offsetWidth < 70 ? 0.88 : 0.955);
    el._pa && el._pa.cancel();
    el._pa = el.animate([{ scale: '1' }, { scale: String(to) }], { duration: 100, easing: 'cubic-bezier(.3,.7,.4,1)', fill: 'forwards' });
  }, { passive: true });
  const release = () => {
    if (!active) return;
    const el = active; active = null;
    if (reduced() || !el._pa) return;
    let from = getComputedStyle(el).scale; if (!from || from === 'none') from = '1';
    el._pa.cancel();
    el._pa = el.animate([{ scale: from }, { scale: '1' }], { duration: SPRING.press.duration, easing: SPRING.press.easing });
  };
  document.addEventListener('pointerup', release, { passive: true });
  document.addEventListener('pointercancel', release, { passive: true });
  window.addEventListener('blur', release);
}

/* FLIP: animate keyed children from old to new positions */
export function flip(container, mutate, opts = {}) {
  const sel = opts.selector || '[data-key]';
  const before = new Map();
  if (!reduced()) $$(sel, container).forEach((el) => before.set(el.dataset.key, el.getBoundingClientRect()));
  mutate();
  if (reduced()) return;
  const vh = innerHeight;
  $$(sel, container).forEach((el, i) => {
    const b = before.get(el.dataset.key);
    const a = el.getBoundingClientRect();
    if (a.bottom < -200 || a.top > vh + 200) return; // offscreen: skip work
    if (!b) {
      if (opts.enter === false) return;
      el.animate([{ opacity: 0, transform: 'translateY(10px) scale(.98)' }, { opacity: 1, transform: 'none' }],
        { duration: 280, delay: Math.min(i * (opts.stagger || 0), 280), easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' });
      return;
    }
    const dx = b.left - a.left, dy = b.top - a.top;
    if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) return;
    const sp = opts.spring || SPRING.move;
    el.style.zIndex = dy > 0 ? '2' : '1';
    const anim = el.animate([{ transform: `translate(${dx}px,${dy}px)` }, { transform: 'none' }],
      { duration: sp.duration + (opts.extra || 0), easing: sp.easing, delay: opts.stagger ? Math.min(i * opts.stagger, 260) : 0, fill: 'backwards' });
    anim.finished.then(() => { el.style.zIndex = ''; }, () => {});
  });
}

export function countUp(el, from, to, dur = 650) {
  if (reduced() || from === to) { el.textContent = fmtInt(to); return; }
  const t0 = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - t0) / dur), e = 1 - Math.pow(1 - p, 3);
    el.textContent = fmtInt(Math.round(from + (to - from) * e));
    if (p < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}
export function fmtInt(n) { return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, '\u202f'); }

/* sliding indicator for segmented controls and nav */
export function moveThumb(container, btn, thumb, opts = {}) {
  if (!btn || !thumb) return;
  const w = opts.width || btn.offsetWidth;
  const x = btn.offsetLeft + (opts.width ? (btn.offsetWidth - w) / 2 : 0);
  if (opts.instant || reduced()) { thumb.style.transition = 'none'; requestAnimationFrame(() => { thumb.style.transition = ''; }); }
  thumb.style.width = w + 'px';
  thumb.style.transform = `translateX(${x}px)`;
}


/* ---------- v1 polish ---------- */
const EASE = 'cubic-bezier(.2,.8,.2,1)';

// Collapsible sections (<details>) open and close smoothly instead of snapping.
// Height animates on the details element; content fades in. Opt out with data-noanim.
export function initDetails() {
  document.addEventListener('click', (e) => {
    const sum = e.target.closest('summary');
    const d = sum && sum.parentElement;
    if (!d || d.tagName !== 'DETAILS' || sum !== d.querySelector(':scope > summary') || d.hasAttribute('data-noanim') || reduced()) return;
    if (e.target.closest('a, button, input, select, textarea') && e.target.closest('a, button, input, select, textarea') !== sum) return;
    e.preventDefault();
    if (d._anim) { d._anim.cancel(); d._anim = null; }
    const closing = d.open;
    const from = d.getBoundingClientRect().height;
    d.open = !closing;
    const to = d.getBoundingClientRect().height;
    if (closing) d.open = true;   // keep content visible while it folds away
    d.style.overflow = 'hidden';
    const dur = Math.min(340, Math.max(200, Math.abs(to - from) * 0.6));
    const a = d.animate([{ height: from + 'px' }, { height: to + 'px' }], { duration: dur, easing: EASE });
    d._anim = a;
    if (!closing) {
      [...d.children].filter((c) => c !== sum).forEach((c) => c.animate([{ opacity: 0, transform: 'translateY(-4px)' }, { opacity: 1, transform: 'none' }], { duration: dur, easing: EASE }));
    }
    const done = () => { if (d._anim !== a) return; d._anim = null; d.style.overflow = ''; if (closing) d.open = false; };
    a.onfinish = done; a.oncancel = () => { d.style.overflow = ''; };
  });
}

// First paint of a list: children rise in with a short stagger (only the first dozen are delayed).
export function reveal(container, { max = 12, step = 22 } = {}) {
  if (!container || reduced()) return container;
  [...container.children].forEach((c, i) => { if (c.nodeType === 1) c.style.setProperty('--ri', String(Math.min(i, max))); });
  container.style.setProperty('--rstep', step + 'ms');
  container.classList.remove('reveal'); void container.offsetWidth;
  container.classList.add('reveal');
  clearTimeout(container._rv);
  container._rv = setTimeout(() => container.classList.remove('reveal'), 420 + max * step);
  return container;
}

// Swapped-in content (a tab or view change) eases in rather than snapping.
export function swapIn(el, dir = 0) {
  if (!el || reduced()) return;
  el.animate([{ opacity: 0, transform: dir ? `translateX(${dir * 18}px)` : 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: EASE });
}
