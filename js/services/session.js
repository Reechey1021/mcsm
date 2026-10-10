// services/session.js
// Who is signed in and what their profile says. Screens read `session`; the shell and
// router listen for the 'session' event on the bus.
import { emit } from '../core/bus.js';
import { isComplete } from '../model/profile.js';

export const session = { ready: false, user: null, profile: null };

export function initSession(backend) {
  let unwatch = null;
  backend.auth.onChange((user) => {
    // Same person, refreshed (e.g. email just confirmed): update without re-subscribing.
    if (user && session.user && user.uid === session.user.uid) { session.user = user; emit('session'); return; }
    session.user = user;
    if (unwatch) { unwatch(); unwatch = null; }
    if (!user) { session.profile = null; session.ready = true; emit('session'); return; }
    unwatch = backend.users.watch(user.uid, (p) => { session.profile = p || {}; session.ready = true; emit('session'); });
  });
}

// Confirmed the email in another tab or on the phone? Notice when they come back.
export function watchVerification(backend) {
  const check = () => { if (document.visibilityState === 'visible' && session.user && !session.user.emailVerified) backend.auth.reload().catch(() => {}); };
  document.addEventListener('visibilitychange', check);
  window.addEventListener('focus', check);
}

export const roles = () => (session.profile && session.profile.roles) || {};
export const signedIn = () => !!session.user;
// Strict: a role counts only if it's the boolean true, exactly like the security rules.
const on = (k) => roles()[k] === true;
export const isOwner = () => on('owner');
export const isAdmin = () => on('admin') || on('owner');
export const profileComplete = () => isComplete(session.profile);
export const suspended = () => !!(session.profile && session.profile.suspendedUntil && session.profile.suspendedUntil > Date.now());
export const isStaff = () => isAdmin() || on('resultsEditor');
export const isJudgeRole = () => isAdmin() || on('judge') || on('judgeChair');
// Who may hand out which roles: always one level below your own.
export function grantableRoles() {
  if (on('owner')) return ['admin', 'judgeChair', 'judge', 'resultsEditor'];
  if (on('admin')) return ['judgeChair', 'judge', 'resultsEditor'];
  if (on('judgeChair')) return ['judge'];
  return [];
}
export const canGrantRoles = () => grantableRoles().length > 0;
