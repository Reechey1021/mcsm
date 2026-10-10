// services/session.js
// Who is signed in and what their profile says. Screens read `session`; the shell and
// router listen for the 'session' event on the bus.
import { emit } from '../core/bus.js';
import { isComplete } from '../model/profile.js';

export const session = { ready: false, user: null, profile: null };

export function initSession(backend) {
  let unwatch = null;
  backend.auth.onChange((user) => {
    session.user = user;
    if (unwatch) { unwatch(); unwatch = null; }
    if (!user) { session.profile = null; session.ready = true; emit('session'); return; }
    unwatch = backend.users.watch(user.uid, (p) => { session.profile = p || {}; session.ready = true; emit('session'); });
  });
}

export const roles = () => (session.profile && session.profile.roles) || {};
export const signedIn = () => !!session.user;
export const isOwner = () => !!roles().owner;
export const isAdmin = () => !!(roles().admin || roles().owner);
export const profileComplete = () => isComplete(session.profile);
export const suspended = () => !!(session.profile && session.profile.suspendedUntil && session.profile.suspendedUntil > Date.now());
export const isStaff = () => !!(roles().admin || roles().owner || roles().resultsEditor);
export const isJudgeRole = () => !!(roles().judge || roles().judgeChair || roles().admin || roles().owner);
