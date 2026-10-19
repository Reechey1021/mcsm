// ui/offline.js
// No connection (common at the track or in a car): a calm full-screen notice that waits and carries on
// by itself when the connection is back, instead of a broken page.
import { h } from '../core/dom.js';
import { t } from '../i18n/index.js';
import { emit } from '../core/bus.js';

let el = null;
const ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 8.8a15 15 0 0 1 4.6-2.9M10.7 5.1A15 15 0 0 1 22 8.8M5 12.6a10 10 0 0 1 3.3-2M15.8 10.7A10 10 0 0 1 19 12.6M8.5 16.2a5 5 0 0 1 7 0"/><circle cx="12" cy="19.5" r="1" fill="currentColor"/><path d="M3 3l18 18"/></svg>';

export function showOffline({ reloadWhenBack = false } = {}) {
  if (el) return;
  const ic = h('span', { class: 'off-ic' }); ic.innerHTML = ICON;
  el = h('div', { class: 'offline-ov', role: 'alert', 'aria-live': 'assertive' },
    h('div', { class: 'off-card' }, ic, h('b', null, t('offTitle')), h('p', null, t('offText')), h('span', { class: 'off-dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i'))));
  document.body.append(el);
  const back = () => {
    window.removeEventListener('online', back);
    if (reloadWhenBack) { location.reload(); return; }
    if (el) { el.remove(); el = null; }
    emit('rerender');
  };
  window.addEventListener('online', back);
}

export function initOffline() {
  window.addEventListener('offline', () => showOffline());
  if (!navigator.onLine) showOffline();
}
