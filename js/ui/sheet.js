// ui/sheet.js
// Bottom sheets (drag to dismiss, Escape, focus return) and toasts.
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { reduced, SPRING } from '../core/motion.js';
import { t } from '../i18n/index.js';

/* ===== Sheet ===== */
let openSheets = [];
export function openSheet({ title, body, onClose }) {
  const back = h('div', { class: 'backdrop' });
  const bodyEl = h('div', { class: 'sh-body' }, body);
  const head = h('div', { class: 'sh-head' }, h('h3', { class: 'display' }, title),
    h('button', { class: 'icon-btn', style: 'color:var(--ink)', 'aria-label': t('close'), onclick: () => close() }, icon('close')));
  const grab = h('div', { class: 'grab' }, h('i'));
  const sheet = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true', 'aria-label': title }, grab, head, bodyEl);
  document.body.append(back, sheet);
  const prevFocus = document.activeElement;
  const desktop = matchMedia('(min-width: 700px)').matches;
  const offY = () => desktop ? 40 : sheet.offsetHeight + 20;
  let closed = false;
  if (reduced()) { sheet.style.transform = 'none'; back.style.opacity = '1'; }
  else {
    back.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 220, fill: 'forwards' });
    sheet.animate([{ transform: `translateY(${offY()}px)`, opacity: desktop ? 0 : 1 }, { transform: 'translateY(0)', opacity: 1 }],
      { duration: SPRING.sheet.duration, easing: SPRING.sheet.easing, fill: 'forwards' });
  }
  sheet.style.transform = 'none'; back.style.opacity = '1';
  setTimeout(() => { const f = sheet.querySelector('button, input, a'); f && f.focus({ preventScroll: true }); }, 50);
  function close(silent) {
    if (closed) return; closed = true;
    openSheets = openSheets.filter((s) => s !== api);
    document.removeEventListener('keydown', onKey);
    const done = () => { back.remove(); sheet.remove(); prevFocus && prevFocus.focus && prevFocus.focus({ preventScroll: true }); onClose && !silent && onClose(); };
    if (reduced()) return done();
    const cur = getComputedStyle(sheet).transform;
    sheet.getAnimations().forEach((a) => a.cancel());
    back.getAnimations().forEach((a) => a.cancel());
    back.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, fill: 'forwards' });
    sheet.animate([{ transform: cur === 'none' ? 'translateY(0)' : cur }, { transform: `translateY(${offY()}px)`, opacity: desktop ? 0 : 1 }],
      { duration: 230, easing: 'cubic-bezier(.4,0,.8,.4)', fill: 'forwards' }).finished.then(done, done);
  }
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);
  back.addEventListener('click', () => close());
  // drag to dismiss
  let y0 = null, last = 0, lastT = 0, vel = 0;
  const startDrag = (e) => {
    if (e.button > 0) return;
    if (e.currentTarget === bodyEl && bodyEl.scrollTop > 0) return;
    y0 = e.clientY; last = 0; lastT = performance.now(); vel = 0;
    sheet.getAnimations().forEach((a) => { a.commitStyles && a.commitStyles(); a.cancel(); });
  };
  const moveDrag = (e) => {
    if (y0 == null) return;
    let dy = e.clientY - y0;
    if (e.currentTarget === bodyEl && dy < 0) { y0 = null; return; }
    if (dy < 0) dy = -Math.pow(-dy, 0.7);
    const now = performance.now(); vel = (dy - last) / Math.max(1, now - lastT); last = dy; lastT = now;
    sheet.style.transform = `translateY(${dy}px)`;
    back.style.opacity = String(Math.max(0, 1 - dy / 500));
  };
  const endDrag = () => {
    if (y0 == null) return; y0 = null;
    if (last > 110 || vel > 0.55) { close(); return; }
    const cur = sheet.style.transform; sheet.style.transform = 'none'; back.style.opacity = '1';
    if (!reduced()) sheet.animate([{ transform: cur }, { transform: 'translateY(0)' }], { duration: SPRING.sheet.duration, easing: SPRING.sheet.easing });
  };
  for (const el of [grab, head]) {
    el.addEventListener('pointerdown', (e) => { el.setPointerCapture(e.pointerId); startDrag(e); });
    el.addEventListener('pointermove', moveDrag); el.addEventListener('pointerup', endDrag); el.addEventListener('pointercancel', endDrag);
  }
  const api = { close, el: sheet, body: bodyEl };
  openSheets.push(api);
  return api;
}
export function closeAllSheets() { openSheets.slice().forEach((s) => s.close(true)); }

/* ===== Toast ===== */
let toastEl = null, toastTimer = null;
export function toast(msg, ic = 'check') {
  if (toastEl) { toastEl.remove(); clearTimeout(toastTimer); }
  toastEl = h('div', { class: 'toast', role: 'status' }, icon(ic), msg);
  document.body.append(toastEl);
  const el = toastEl;
  el.style.opacity = '1'; el.style.transform = 'translate(-50%,0)';
  if (!reduced()) el.animate([{ opacity: 0, transform: 'translate(-50%,24px) scale(.96)' }, { opacity: 1, transform: 'translate(-50%,0) scale(1)' }], { duration: SPRING.pop.duration, easing: SPRING.pop.easing });
  toastTimer = setTimeout(() => {
    const done = () => el.remove();
    if (reduced()) return done();
    el.animate([{ opacity: 1, transform: 'translate(-50%,0)' }, { opacity: 0, transform: 'translate(-50%,16px)' }], { duration: 200, fill: 'forwards' }).finished.then(done, done);
    if (toastEl === el) toastEl = null;
  }, 2400);
}

