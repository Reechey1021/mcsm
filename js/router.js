// router.js
// Hash routes (#/pilotak/igtsh_dixen), guards (sign-in, admin), direction-aware
// view transitions and per-page scroll memory.
import { $, h } from './core/dom.js';
import { on, emit } from './core/bus.js';
import { reduced } from './core/motion.js';
import { closeAllSheets } from './ui/sheet.js';
import { session, signedIn, isAdmin, isStaff, isJudgeRole, profileComplete } from './services/session.js';
import { t } from './i18n/index.js';
import { loading } from './ui/parts.js';
import { profileBanner } from './screens/banners.js';
import { screenHome } from './screens/home.js';
import { screenSignIn, screenSignUp, screenReset } from './screens/auth.js';
import { screenWizard } from './screens/wizard.js';
import { screenMe } from './screens/me.js';
import { screenDrivers, screenDriver } from './screens/drivers.js';
import { screenTeams } from './screens/teams.js';
import { screenSoon, screenRules, screenNotFound } from './screens/static.js';
import { screenSeasons, screenSeason } from './screens/seasons.js';
import { screenSeasonWizard } from './screens/admin/season-wizard.js';
import { screenRound, screenPqEntry } from './screens/race.js';
import { screenResultsEntry } from './screens/results-entry.js';
import { screenStandings } from './screens/standings.js';
import { screenProtestForm, screenJudges, screenCase } from './screens/protests.js';
import { screenAdmin } from './screens/admin/index.js';
import { screenAdminPeople } from './screens/admin/people.js';
import { screenAdminTeams, screenAdminGt } from './screens/admin/teams.js';
import { screenAdminAudit } from './screens/admin/audit.js';

const ROUTES = [
  ['/', screenHome, { tab: 0 }],
  ['/szezonok', screenSeasons, { tab: 1 }],
  ['/szezonok/:id', screenSeason, { tab: 1 }],
  ['/szezonok/:id/fordulo/:n', screenRound, { tab: 1 }],
  ['/szezonok/:id/fordulo/:n/ovas', screenProtestForm, { tab: 1, auth: true }],
  ['/birosag', screenJudges, { tab: 4, auth: true, judge: true }],
  ['/birosag/:sid/:pid', screenCase, { tab: 4, auth: true, judge: true }],
  ['/szezonok/:id/:tab', screenSeason, { tab: 1 }],
  ['/eredmenyek', screenStandings, { tab: 2 }],
  ['/eredmenyek/:sid', screenStandings, { tab: 2 }],
  ['/pilotak', screenDrivers, { tab: 3 }],
  ['/pilotak/:psn', screenDriver, { tab: 3 }],
  ['/csapatok', screenTeams, { tab: 5 }],
  ['/szabalyzat', screenRules, {}],
  ['/sajat', screenMe, { tab: 4, auth: true, noBanner: true }],
  ['/profil', screenWizard, { tab: 4, auth: true, noBanner: true, keep: true }],
  ['/belepes', screenSignIn, { guest: true }],
  ['/regisztracio', screenSignUp, { guest: true }],
  ['/jelszo', screenReset, {}],
  ['/admin', screenAdmin, { tab: 4, auth: true, admin: true }],
  ['/admin/felhasznalok', screenAdminPeople, { tab: 4, auth: true, admin: true }],
  ['/admin/csapatok', screenAdminTeams, { tab: 4, auth: true, admin: true }],
  ['/admin/gt', screenAdminGt, { tab: 4, auth: true, admin: true }],
  ['/admin/naplo', screenAdminAudit, { tab: 4, auth: true, admin: true }],
  ['/admin/szezon/uj', screenSeasonWizard, { tab: 1, auth: true, admin: true }],
  ['/admin/pq/:sid/:pq', screenPqEntry, { tab: 1, auth: true, staff: true }],
  ['/admin/eredmeny/:sid/:n/:L/:S', screenResultsEntry, { tab: 1, auth: true, staff: true }],
  ['/admin/szezon/:id', screenSeasonWizard, { tab: 1, auth: true, admin: true }],
].map(([pattern, fn, opts]) => {
  const keys = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, k) => { keys.push(k); return '([^/]+)'; }) + '$');
  return { pattern, re, keys, fn, ...opts };
});

export function parse(hash) {
  const raw = (hash || '').replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const query = new URLSearchParams(qs || '');
  for (const r of ROUTES) {
    const m = path.match(r.re);
    if (m) return { route: r, path, query, params: Object.fromEntries(r.keys.map((k, i) => [k, decodeURIComponent(m[i + 1])])) };
  }
  return { route: { fn: screenNotFound }, path, query, params: {} };
}

const depth = (p) => p.split('/').filter(Boolean).length;
const scrollMem = {};
let current = null;
let cleanups = [];
export const onLeave = (fn) => cleanups.push(fn);
export const go = (path, replace) => { const target = '#' + path; if (replace) location.replace(target); else location.hash = target; };

function guard(r) {
  const { route, path } = r;
  if (!session.ready && (route.auth || route.guest)) return 'wait';
  if (route.auth && !signedIn()) { go('/belepes?next=' + encodeURIComponent(path), true); return 'redirect'; }
  if (route.guest && signedIn()) { go(r.query.get('next') || (profileComplete() ? '/sajat' : '/profil'), true); return 'redirect'; }
  if (route.admin && !isAdmin()) return 'forbidden';
  if (route.staff && !isStaff()) return 'forbidden';
  if (route.judge && !isJudgeRole()) return 'forbidden';
  return 'ok';
}

function render(r) {
  cleanups.splice(0).forEach((f) => { try { f(); } catch { /* ignore */ } });
  const view = $('#view');
  const g = guard(r);
  if (g === 'redirect') return false;
  let node;
  if (g === 'wait') node = loading();
  else if (g === 'forbidden') node = screenNotFound(t('forbidden'));
  else node = r.route.fn(r.params, r.query);
  const banner = g === 'ok' && !r.route.noBanner ? profileBanner() : null;
  view.replaceChildren(...[banner, node].filter(Boolean));
  emit('route', r);
  return true;
}

export function navigate() {
  const r = parse(location.hash);
  const prev = current;
  if (prev && prev.path === r.path && prev.query.toString() === r.query.toString()) return;
  current = r;
  let dir = 'fade';
  if (prev) {
    const a = r.route.tab, b = prev.route.tab;
    if (a != null && b != null && a !== b && depth(r.path) <= 1 && depth(prev.path) <= 1) dir = a > b ? 'fwd' : 'back';
    else { const dd = depth(r.path) - depth(prev.path); dir = dd > 0 ? 'fwd' : dd < 0 ? 'back' : 'fade'; }
    scrollMem[prev.path] = scrollY;
  }
  closeAllSheets();
  const doRender = () => { if (render(r)) window.scrollTo(0, dir === 'back' ? (scrollMem[r.path] || 0) : 0); };
  if (!prev || reduced() || !document.startViewTransition) {
    doRender();
    if (prev && !reduced()) $('#view').animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
    return;
  }
  document.documentElement.dataset.dir = dir;
  const vt = document.startViewTransition(doRender);
  vt.finished.finally(() => { delete document.documentElement.dataset.dir; });
}

export function rerender() { if (!current) return; const y = scrollY; render(current); window.scrollTo(0, y); }
export const currentRoute = () => current;

export function initRouter() {
  window.addEventListener('hashchange', navigate);
  // Re-render when who is signed in (or their roles) changes, not on every profile save.
  let sig = '';
  on('session', () => {
    const p = session.profile || {};
    const next = [session.ready, session.user && session.user.uid, session.user && session.user.emailVerified, JSON.stringify(p.roles || {}), profileComplete()].join('|');
    if (next === sig) return;
    const first = !sig; sig = next;
    if (first || !current) { current = null; navigate(); return; }
    const g = guard(current);
    if (g !== 'ok' || !current.route.keep) rerender();
  });
  on('rerender', rerender);
  navigate();
}
