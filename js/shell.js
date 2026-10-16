import { APP_VERSION } from './version.js';
// shell.js
// Header, desktop nav, mobile tab bar and the main menu sheet.
import { $, h, frag } from './core/dom.js';
import { on, emit } from './core/bus.js';
import { icon } from './core/icons.js';
import { moveThumb } from './core/motion.js';
import { store } from './core/storage.js';
import { openSheet, toast } from './ui/sheet.js';
import { seg } from './ui/controls.js';
import { avatar } from './ui/parts.js';
import { t, LANG, setLang } from './i18n/index.js';
import { backend } from './services/backend.js';
import { session, signedIn, isAdmin, isJudgeRole, canGrantRoles } from './services/session.js';
import { openNewsFeed, loadNews, unreadCount, openInstall, isInstalled } from './ui/news.js';
import { fullName } from './model/profile.js';
import { go, currentRoute } from './router.js';
import { notes, refreshNotes, markAllRead } from './services/notify.js';
import { relTime } from './i18n/index.js';

const TABS = [['/', 'navHome', 'home', 0], ['/szezonok', 'navSeasons', 'flag', 1], ['/eredmenyek', 'navResults', 'trophy', 2], ['/pilotak', 'navDrivers', 'users', 3], ['/sajat', 'navMe', 'user', 4]];
const TOPNAV = [['/', 'navHome', 0], ['/szezonok', 'navSeasons', 1], ['/eredmenyek', 'navResults', 2], ['/pilotak', 'navDrivers', 3], ['/csapatok', 'navTeams', 5]];
let els = {};

export function buildShell() {
  const topInd = h('span', { class: 'ind' });
  const topNav = h('nav', { class: 'top-nav', 'aria-label': t('mainNav') }, TOPNAV.map(([href, k, tab]) => h('a', { href: '#' + href, dataset: { tab } }, t(k))), topInd);
  const meBtn = h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('openMenu'), onclick: openMenu });
  const badge = h('span', { class: 'badge-dot', style: 'display:none' });
  const bell = h('button', { class: 'icon-btn bell-btn', type: 'button', 'aria-label': t('notifications'), onclick: openNotes, style: 'display:none' }, icon('bell'), badge);
  const newsDot = h('span', { class: 'badge-dot news-badge', style: 'display:none' });
  const newsBtn = h('button', { class: 'icon-btn news-btn', type: 'button', 'aria-label': t('news'), onclick: () => openNewsFeed() }, icon('news'), newsDot);
  const paintNews = () => loadNews().then((items) => { const n = unreadCount(items); newsDot.textContent = n > 9 ? '9+' : String(n); newsDot.style.display = n ? '' : 'none'; }).catch(() => {});
  on('news', paintNews); paintNews();
  const mode = backend && backend.kind === 'fake' ? h('button', { class: 'mode-pill tap', type: 'button', onclick: openMenu }, t('testMode')) : null;
  const header = h('header', { class: 'app-header' }, h('div', { class: 'in' },
    h('a', { class: 'logo', href: '#/', 'aria-label': t('homeLabel') }, h('img', { src: 'assets/logo.webp', alt: 'MCSM', width: '91', height: '34' })),
    topNav, h('div', { class: 'hdr-actions' }, mode, newsBtn, bell, meBtn)));
  const tabInd = h('span', { class: 'ind' });
  const tabbar = h('nav', { class: 'tabbar', 'aria-label': t('mainNav') }, h('div', { class: 'in' }, tabInd,
    TABS.map(([href, k, ic, tab]) => h('a', { href: '#' + href, dataset: { tab } }, icon(ic), h('span', null, t(k))))));
  const main = h('main', { id: 'view', tabindex: '-1' });
  document.body.replaceChildren(header, main, tabbar);
  els = { topNav, topInd, tabbar, tabInd, meBtn, bell, badge };
  refreshBell();
  refreshMe();
}

let teamsById = {};
export function setTeamsForShell(map) { teamsById = map || {}; refreshMe(); }
function refreshMe() {
  if (!els.meBtn) return;
  const p = session.profile;
  els.meBtn.replaceChildren(signedIn() && p && p.lastName ? avatar(p, teamsById[p.teamId], 'me-btn') : icon(signedIn() ? 'user' : 'logout'));
  if (!signedIn()) els.meBtn.replaceChildren(icon('user'));
}

function refreshBell() {
  if (!els.bell) return;
  els.bell.style.display = signedIn() ? '' : 'none';
  const n = notes.unread;
  els.badge.textContent = n > 9 ? '9+' : String(n);
  els.badge.style.display = n ? '' : 'none';
}
const NOTE_ICON = { lobbiesOut: 'grid', resultsOut: 'trophy', regOpen: 'flag', seasonAnnounced: 'flag', protestAgainst: 'alert', protestNew: 'shield', decision: 'shield', promoted: 'up', reservePending: 'users', teamApproved: 'check', teamDeclined: 'close', raceToday: 'clock', claimDispute: 'alert', roleGranted: 'shield', lobbyHost: 'users' };
function openNotes() {
  const list = h('div');
  const draw = () => list.replaceChildren(...(notes.items.length ? notes.items.map((n) => h('a', { class: 'notif' + ((n.synthetic || (n.at || 0) > ((session.profile || {}).notifReadAt || 0)) && n.by !== (session.user || {}).uid ? ' unread' : ''), href: n.link || '#/', onclick: () => { stopRedraw(); sh.close(true); } },
    h('span', { class: 'ic' }, icon(NOTE_ICON[n.type] || 'bell')),
    h('span', null, h('b', null, t('nt_' + n.type, n.params || {})), n.params && n.params.title ? h('span', null, n.params.title) : null, h('time', null, n.synthetic ? t('today') : relTime(n.at)))))
    : [h('div', { class: 'empty' }, t(notes.error ? 'loadFailed' : 'noNotifications'))]));
  draw();
  const stopRedraw = on('notes', draw);
  const markBtn = h('button', { class: 'btn small block', type: 'button' }, icon('check'), t('markAllRead'));
  markBtn.addEventListener('click', async () => { await markAllRead(); draw(); });
  const sh = openSheet({ title: t('notifications'), body: frag(h('div', { class: 'notif-top' }, markBtn), list), onClose: stopRedraw });
  refreshNotes().then(draw).catch(() => {});
}

export function updateNav(r) {
  if (!els.topNav) return;
  const tab = r && r.route ? r.route.tab : null;
  let topA = null, tabA = null;
  els.topNav.querySelectorAll('a').forEach((a) => { const onn = +a.dataset.tab === tab; a.toggleAttribute('aria-current', false); if (onn) { a.setAttribute('aria-current', 'page'); topA = a; } });
  els.tabbar.querySelectorAll('a').forEach((a) => { const onn = +a.dataset.tab === tab; a.removeAttribute('aria-current'); if (onn) { a.setAttribute('aria-current', 'page'); tabA = a; } });
  const first = !updateNav.done; updateNav.done = true;
  els.topInd.style.opacity = topA ? '1' : '0';
  els.tabInd.style.opacity = tabA ? '1' : '0';
  if (topA) moveThumb(els.topNav, topA, els.topInd, { instant: first });
  if (tabA) moveThumb(els.tabbar, tabA, els.tabInd, { width: 56, instant: first });
}

export function applyTheme(v) {
  if (!v || v === 'system') delete document.documentElement.dataset.theme; else document.documentElement.dataset.theme = v;
}

export function openMenu() {
  const p = session.profile || {};
  const mi = (ic, label, href) => h('a', { class: 'menu-item', href: '#' + href, onclick: () => sh.close(true) }, icon(ic), label, icon('chevR', 'chev'));
  const block = (label, el) => h('div', { style: 'margin:16px 0 4px' }, h('div', { class: 'label', style: 'margin-bottom:8px' }, label), el);
  const langSeg = seg([{ value: 'hu', label: 'Magyar' }, { value: 'en', label: 'English' }], LANG, (v) => { setLang(v); sh.close(true); emit('relang'); });
  const themeSeg = seg([{ value: 'system', label: t('themeSystem') }, { value: 'dark', label: t('themeDark') }, { value: 'light', label: t('themeLight') }], store.get('theme', 'dark'), (v) => { store.set('theme', v); applyTheme(v); });
  const items = signedIn()
    ? [mi('user', t('myPage'), '/sajat'), isAdmin() ? mi('shield', t('admin'), '/admin') : null, isJudgeRole() ? mi('flag', t('judgesArea'), '/birosag') : null, !isAdmin() && canGrantRoles() ? mi('users', t('rolesTitle'), '/admin/szerepkorok') : null, mi('users', t('teams'), '/csapatok'), mi('book', t('rules'), '/szabalyzat')]
    : [mi('user', t('signIn'), '/belepes'), mi('plus', t('signUp'), '/regisztracio'), mi('users', t('teams'), '/csapatok'), mi('book', t('rules'), '/szabalyzat')];
  let dev = null;
  if (backend.kind === 'fake') {
    const quick = backend.dev.accounts().filter((a) => a.email.endsWith('@mcsm.test')).map((a) => h('button', { class: 'btn small', type: 'button', onclick: async () => { sh.close(true); await backend.auth.signOut(); await backend.auth.signIn(a.email, 'demo1234'); toast(t('signedInAs', { who: a.email })); } }, a.email.split('@')[0]));
    dev = h('div', { class: 'callout', style: 'margin-bottom:6px;display:block' },
      h('b', null, t('testModeTitle')), h('p', { style: 'margin:4px 0 10px;font-size:13.5px' }, t('testModeText')),
      h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, quick,
        h('button', { class: 'btn small', type: 'button', onclick: () => { backend.dev.reset(); try { sessionStorage.clear(); } catch { /* */ } location.reload(); } }, icon('refresh'), t('resetTest'))));
  }
  const signOut = signedIn() ? h('button', { class: 'menu-item', type: 'button', onclick: async () => { sh.close(true); await backend.auth.signOut(); toast(t('signedOut')); go('/'); } }, icon('logout'), t('signOut')) : null;
  const install = isInstalled() ? null : h('button', { class: 'menu-item install-item', type: 'button', onclick: () => { sh.close(true); openInstall(); } }, icon('download'), h('span', null, t('installTitle'), h('small', null, t('installHint'))), icon('chevR', 'chev'));
  const sh = openSheet({ title: signedIn() && p.lastName ? fullName(p) : t('menu'), body: frag(dev, items, install, signOut, block(t('language'), langSeg), block(t('theme'), themeSeg), h('p', { class: 'app-version' }, 'MCSM ' + APP_VERSION)) });
}

export function initShell() {
  on('session', refreshMe);
  on('session', refreshBell);
  on('notes', refreshBell);
  on('route', updateNav);
  window.addEventListener('resize', () => updateNav(currentRoute()), { passive: true });
}
