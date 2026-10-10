// main.js
// Boot: theme and language first (no flash), then the backend, session, shell and router.
import { h } from './core/dom.js';
import { on } from './core/bus.js';
import { initPress } from './core/motion.js';
import { store } from './core/storage.js';
import { LANG, t } from './i18n/index.js';
import { createBackend } from './services/backend.js';
import { initSession, watchVerification } from './services/session.js';
import { buildShell, initShell, applyTheme, updateNav, setTeamsForShell } from './shell.js';
import { initRouter, currentRoute, rerender } from './router.js';
import { teamMap } from './core/data.js';
import { initNotes } from './services/notify.js';

// Guard: a conditional child that's empty (null/false) must never render as the word "null".
const nativeReplace = Element.prototype.replaceChildren;
Element.prototype.replaceChildren = function replaceChildren(...kids) { return nativeReplace.apply(this, kids.filter((k) => k != null && k !== false)); };

document.documentElement.lang = LANG;
applyTheme(store.get('theme', 'system'));

// Firebase email links arrive as ?mode=…&oobCode=…; send them to the action screen.
(function routeEmailAction() {
  const q = new URLSearchParams(location.search);
  if (q.get('mode') && q.get('oobCode') && !location.hash.startsWith('#/muvelet')) location.replace(location.pathname + location.search + '#/muvelet');
})();

async function boot() {
  let backend;
  try { backend = await createBackend(); }
  catch (e) {
    console.error("Firebase couldn't load", e);
    document.body.replaceChildren(h('main', { id: 'view' }, h('div', { class: 'empty', style: 'margin:40px 16px' }, h('b', { style: 'display:block;color:var(--ink);margin-bottom:6px' }, t('bootFailTitle')), t('bootFailText'),
      h('div', { style: 'margin-top:14px' }, h('button', { class: 'btn', type: 'button', onclick: () => location.reload() }, t('retry'))))));
    return;
  }
  buildShell();
  initShell();
  initSession(backend);
  watchVerification(backend);
  initRouter();
  initPress();
  initNotes();
  teamMap().then(setTeamsForShell).catch(() => {});
  on('relang', () => { buildShell(); rerender(); updateNav(currentRoute()); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => updateNav(currentRoute()));
}
boot();
