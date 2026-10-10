// screens/welcome.js
// First sign-in after activating an imported account: "is this you?" with the profile we
// brought over, then on to finishing the profile if anything is missing.
import { h, frag } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { busy } from '../ui/controls.js';
import { loading, formError } from '../ui/parts.js';
import { toast } from '../ui/sheet.js';
import { t } from '../i18n/index.js';
import { backend, errorKey } from '../services/backend.js';
import { session } from '../services/session.js';
import { teamMap } from '../core/data.js';
import { isComplete } from '../model/profile.js';
import { profileHead } from './me.js';
import { notifyUsers, adminUids } from '../services/notify.js';
import { go } from '../router.js';

export function screenWelcome() {
  const root = h('div', { class: 'narrow', style: 'max-width:640px' }, loading());
  teamMap().then((tm) => {
    const p = session.profile || {};
    if (!p.imported) { go('/sajat', true); return; }
    const yes = h('button', { class: 'btn primary block', type: 'button', 'data-haptic': '' }, icon('check'), t('welcomeYes'));
    const no = h('button', { class: 'btn block', type: 'button' }, t('welcomeNo'));
    const err = h('div');
    yes.addEventListener('click', () => busy(yes, async () => {
      try { await backend.users.save(session.user.uid, { claimedAt: Date.now() }); toast(t('welcomeDone')); go(isComplete(p) ? '/sajat' : '/profil'); }
      catch (e) { err.replaceChildren(formError(t(errorKey(e)))); }
    }));
    no.addEventListener('click', () => busy(no, async () => {
      const admins = await adminUids().catch(() => []);
      await notifyUsers(admins, 'claimDispute', { psn: p.psn || '' }, '#/admin/felhasznalok');
      await backend.auth.signOut(); toast(t('welcomeReported'), 'info'); go('/');
    }));
    root.replaceChildren(h('h1', { class: 'display page-title' }, t('welcomeTitle')), h('p', { class: 'page-sub' }, t('welcomeSub')),
      profileHead(p, tm[p.teamId]), err, h('div', { class: 'stack', style: 'gap:10px;margin-top:16px' }, yes, no), h('p', { class: 'note' }, isComplete(p) ? t('welcomeComplete') : t('welcomeIncomplete')));
  });
  return root;
}
