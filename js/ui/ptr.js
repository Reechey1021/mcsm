// ui/ptr.js
// Pull to refresh, in the installed app only (browsers have their own). Pull down from the top:
// a ring fills as you pull; let go before it's full and nothing happens; let go when it's full and
// the ring turns into three bouncing dots while the current page reloads its data.
import { h } from '../core/dom.js';
import { invalidate } from '../core/cache.js';
import { emit } from '../core/bus.js';
import { isInstalled } from './news.js';

const TH = 78;   // pull distance (after resistance) needed to refresh
export function initPullToRefresh() {
  if (!isInstalled() || !('ontouchstart' in window)) return;
  document.documentElement.style.overscrollBehaviorY = 'contain';
  const ring = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  ring.setAttribute('viewBox', '0 0 36 36'); ring.setAttribute('class', 'ptr-ring');
  ring.innerHTML = '<circle cx="18" cy="18" r="14" fill="none" stroke="var(--line-2)" stroke-width="3"/><circle class="ptr-fill" cx="18" cy="18" r="14" fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" pathLength="100" stroke-dasharray="100 100" stroke-dashoffset="100" transform="rotate(-90 18 18)"/>';
  const ind = h('div', { class: 'ptr', 'aria-hidden': 'true' }, ring, h('span', { class: 'ptr-dots' }, h('i'), h('i'), h('i')));
  document.body.append(ind);
  const fill = ring.querySelector('.ptr-fill');
  let startY = null, pull = 0, active = false, busy = false;
  const blocked = () => busy || window.scrollY > 0 || document.documentElement.style.overflow === 'hidden' || document.querySelector('.sheet, .rr-overlay, .nc-overlay, .offline-ov');
  const draw = () => {
    const k = Math.min(1, pull / TH);
    ind.style.transform = `translate(-50%, ${Math.round(Math.min(pull, TH * 1.2) - 46)}px)`;
    ind.style.opacity = String(Math.min(1, k * 1.4));
    fill.setAttribute('stroke-dashoffset', String(100 - k * 100));
    ind.classList.toggle('ready', k >= 1);
  };
  const reset = () => {
    ind.style.transition = 'transform .28s cubic-bezier(.2,.8,.2,1), opacity .2s ease';
    pull = 0; active = false; draw();
    setTimeout(() => { ind.style.transition = ''; ind.classList.remove('loading', 'ready'); }, 300);
  };
  window.addEventListener('touchstart', (e) => { startY = e.touches.length === 1 && !blocked() ? e.touches[0].clientY : null; pull = 0; active = false; }, { passive: true });
  window.addEventListener('touchmove', (e) => {
    if (startY == null) return;
    const dy = e.touches[0].clientY - startY;
    if (dy <= 0 || window.scrollY > 0) { if (active) reset(); startY = null; return; }
    active = true;
    pull = dy * 0.5;                                  // resistance: you pull twice as far as it moves
    if (e.cancelable) e.preventDefault();             // stop the page bouncing while pulling
    draw();
  }, { passive: false });
  const end = () => {
    if (!active) { startY = null; return; }
    startY = null;
    if (pull < TH) { reset(); return; }
    busy = true;
    ind.classList.add('loading');
    ind.style.transition = 'transform .2s ease';
    ind.style.transform = 'translate(-50%, 18px)';
    invalidate();
    emit('rerender');
    setTimeout(() => { busy = false; reset(); }, 900);
  };
  window.addEventListener('touchend', end, { passive: true });
  window.addEventListener('touchcancel', end, { passive: true });
}
