// screens/banners.js
// The strip above every page that nudges: finish your profile, confirm your email.
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { toast } from '../ui/sheet.js';
import { busy } from '../ui/controls.js';
import { t, fmtDate } from '../i18n/index.js';
import { backend, errorKey } from '../services/backend.js';
import { session, signedIn, profileComplete, suspended } from '../services/session.js';
import { stepsDone } from '../model/profile.js';

export function profileBanner() {
  if (!signedIn() || !session.profile) return null;
  if (suspended()) {
    return h('div', { class: 'banner warn', role: 'status' }, icon('alert'), h('div', { class: 'txt' }, h('b', null, t('suspendedTitle', { date: fmtDate(session.profile.suspendedUntil) })), session.profile.suspendNote || t('suspendedText')));
  }
  if (!profileComplete()) {
    const done = stepsDone(session.profile);
    return h('a', { class: 'banner tap', href: '#/profil' }, icon('user'),
      h('div', { class: 'txt' }, h('b', null, t('finishProfile')), t('finishProfileText', { n: done, total: 3 })), icon('chevR'));
  }
  if (session.user && !session.user.emailVerified) return verifyBanner();
  return null;
}

export function verifyBanner() {
  const resend = h('button', { class: 'btn small', type: 'button' }, t('resend'));
  resend.addEventListener('click', () => busy(resend, async () => {
    try { await backend.auth.sendVerification(); toast(t('verifySent'), 'mail'); } catch (e) { toast(t(errorKey(e)), 'alert'); }
  }));
  const check = h('button', { class: 'btn small', type: 'button' }, t('iVerified'));
  check.addEventListener('click', () => busy(check, async () => {
    const u = await backend.auth.reload();
    toast(u && u.emailVerified ? t('verifiedOk') : t('notVerifiedYet'), u && u.emailVerified ? 'check' : 'info');
  }));
  const dev = backend.kind === 'fake' ? h('button', { class: 'btn small', type: 'button', onclick: () => backend.auth.devVerify() }, t('devVerify')) : null;
  return h('div', { class: 'banner', role: 'status', style: 'flex-wrap:wrap' }, icon('mail'),
    h('div', { class: 'txt' }, h('b', null, t('verifyTitle')), t('verifyText', { email: session.user.email })),
    h('div', { style: 'display:flex;gap:6px;flex-wrap:wrap' }, resend, check, dev));
}
