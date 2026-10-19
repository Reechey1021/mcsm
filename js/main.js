// main.js
// Boot: theme and language first (no flash), then the backend, session, shell and router.
import { backend } from './services/backend.js';
import { h } from './core/dom.js';
import { on } from './core/bus.js';
import { initPress, initDetails } from './core/motion.js';
import { store } from './core/storage.js';
import { LANG, t } from './i18n/index.js';
import { createBackend } from './services/backend.js';
import { initSession, watchVerification, session } from './services/session.js';
const session_ready = () => session.ready && !!session.user;
import { buildShell, initShell, applyTheme, updateNav, setTeamsForShell } from './shell.js';
import { initRouter, currentRoute, rerender } from './router.js';
import { teamMap } from './core/data.js';
import { initNotes } from './services/notify.js';
import { initKeyboard } from './ui/keyboard.js';
import { listenForeground } from './services/push.js';

// Guard: a conditional child that's empty (null/false) must never render as the word "null".
const nativeReplace = Element.prototype.replaceChildren;
Element.prototype.replaceChildren = function replaceChildren(...kids) { return nativeReplace.apply(this, kids.filter((k) => k != null && k !== false)); };
const nativeAppend = Element.prototype.append, nativePrepend = Element.prototype.prepend;
Element.prototype.append = function append(...kids) { return nativeAppend.apply(this, kids.filter((k) => k != null && k !== false)); };
Element.prototype.prepend = function prepend(...kids) { return nativePrepend.apply(this, kids.filter((k) => k != null && k !== false)); };
const nativeFragAppend = DocumentFragment.prototype.append;
DocumentFragment.prototype.append = function append(...kids) { return nativeFragAppend.apply(this, kids.filter((k) => k != null && k !== false)); };

document.documentElement.lang = LANG;
applyTheme(store.get('theme', 'dark'));

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
    if (!navigator.onLine) { import('./ui/offline.js').then((m) => m.showOffline({ reloadWhenBack: true })); return; }
    document.body.replaceChildren(h('main', { id: 'view' }, h('div', { class: 'empty', style: 'margin:40px 16px' }, h('b', { style: 'display:block;color:var(--ink);margin-bottom:6px' }, t('bootFailTitle')), t('bootFailText'),
      h('div', { style: 'margin-top:14px' }, h('button', { class: 'btn', type: 'button', onclick: () => location.reload() }, t('retry'))))));
    return;
  }
  buildShell();
  import('./ui/offline.js').then((m) => m.initOffline()).catch(() => {});
  import('./ui/ptr.js').then((m) => m.initPullToRefresh()).catch(() => {});
  initShell();
  initSession(backend);
  watchVerification(backend);
  initRouter();
  initPress();
  initDetails();
  initNotes();
  initKeyboard();
  // The notification listener receives Firestore changes directly, regardless of push permission.
  // News carousel: once per visit, after the first screen and again right after signing in.
  let wasIn = null;
  // "Besorolva" (just ranked) comes before anything else; it also arrives live if published meanwhile
  const revealCheck = () => import('./ui/rank-reveal.js').then((m) => setTimeout(() => m.maybeShowRankReveal(), 500)).catch(() => {});
  on('session', () => { if (session.ready && (session.profile || /rankdemo|resultsdemo/.test(location.search + location.hash))) revealCheck(); });
  setTimeout(revealCheck, 1200);
  window.addEventListener('hashchange', () => { if (/rankdemo|resultsdemo/.test(location.hash)) revealCheck(); });
  on('session', () => { if (!session.ready) return; const nowIn = !!session.user; const force = wasIn === false && nowIn; wasIn = nowIn; if (!nowIn) return; setTimeout(() => import('./ui/news.js').then((m) => m.showWelcomeNews(force)), force ? 900 : 1600); });
  on('session', () => { if (session_ready()) listenForeground(); });
  // Admins: make sure the public copy of the function address exists (used for the Twitch live list).
  let epDone = false;
  on('session', () => { if (epDone || !session_ready() || !(session.profile && session.profile.roles && (session.profile.roles.admin === true || session.profile.roles.owner === true))) return; epDone = true; backend.content.get('endpoints').then((ep) => (ep && ep.fn ? null : backend.admin.functionsConfig().then((c) => (c && c.url && !String(c.url).startsWith('fake:') ? backend.content.save('endpoints', { fn: c.url }) : null)))).catch(() => {}); });
  // Admins number older protests once (#1, #2, …), like tickets.
  let numDone = false;
  on('session', () => { if (numDone || !session_ready() || !(session.profile && session.profile.roles && (session.profile.roles.admin === true || session.profile.roles.owner === true))) return; numDone = true; setTimeout(() => import('./services/protest-numbers.js').then((m) => m.ensureProtestNumbers()).catch(() => {}), 5000); });
  // Admins: make sure the "what's changed" document exists, so visitors can keep lists on their device.
  let verDone = false;
  on('session', () => { if (verDone || !session_ready() || !(session.profile && session.profile.roles && (session.profile.roles.admin === true || session.profile.roles.owner === true))) return; verDone = true; import('./core/persist.js').then((m) => m.versions().then((v) => { if (!v) m.bump(['seasons', 'teams', 'ratings', 'news']); })).catch(() => {}); });
  // Admins quietly keep finished seasons' summaries up to date.
  let sumDone = false;
  on('session', () => { if (sumDone || !session_ready() || !(session.profile && session.profile.roles && (session.profile.roles.admin === true || session.profile.roles.owner === true))) return; sumDone = true; setTimeout(() => import('./services/season-summary.js').then((m) => m.ensureSummaries()).catch(() => {}), 4000); });
  // Once a day, the first admin to open the site refreshes DR/SR quietly in the background.
  let autoDone = false;
  on('session', () => { if (!autoDone && session_ready() && session.profile && session.profile.roles && (session.profile.roles.admin === true || session.profile.roles.owner === true)) { autoDone = true; setTimeout(() => import('./services/ratings.js').then((m) => m.autoDailySync()), 8000); } });
  teamMap().then(setTeamsForShell).catch(() => {});
  on('relang', () => { buildShell(); rerender(); updateNav(currentRoute()); });
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => updateNav(currentRoute()));
}
boot();
