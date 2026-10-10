// screens/action.js
// Where the links in Firebase's emails land (verify email, reset password), so people end up
// back on the site with a clear result instead of on a generic Google page.
import { h, frag } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { haptic } from '../core/motion.js';
import { field, passwordInput, busy } from '../ui/controls.js';
import { loading, formError } from '../ui/parts.js';
import { t } from '../i18n/index.js';
import { backend, errorKey } from '../services/backend.js';
import { session, signedIn } from '../services/session.js';

const card = (...kids) => h('div', { class: 'narrow' }, h('section', { class: 'panel auth-card', style: 'text-align:center;display:grid;gap:12px;justify-items:center' }, ...kids));
const bigIcon = (name, ok) => { const ic = icon(name); ic.style.width = '34px'; ic.style.height = '34px'; return h('span', { style: `display:grid;place-items:center;width:64px;height:64px;border-radius:20px;background:${ok ? 'var(--accent)' : 'var(--red-soft)'};color:${ok ? 'var(--accent-ink)' : 'var(--red)'}` }, ic); };

function cleanUrl() {
  const q = new URLSearchParams(location.search);
  ['mode', 'oobCode', 'apiKey', 'lang', 'continueUrl', 'tenantId'].forEach((k) => q.delete(k));
  const rest = q.toString();
  history.replaceState(null, '', location.pathname + (rest ? '?' + rest : '') + location.hash);
}

export function screenAction() {
  const q = new URLSearchParams(location.search);
  const mode = q.get('mode'), code = q.get('oobCode');
  const root = h('div', null, loading());
  if (!mode || !code) { root.replaceChildren(failCard('errActionCode')); return root; }
  if (mode === 'verifyEmail') {
    backend.auth.applyCode(code).then(() => {
      cleanUrl(); haptic(15);
      root.replaceChildren(card(bigIcon('check', true), h('h1', { class: 'display', style: 'font-size:34px' }, t('emailVerifiedTitle')),
        h('p', { class: 'muted', style: 'margin:0' }, t('emailVerifiedText')),
        h('a', { class: 'btn primary', href: signedIn() ? (session.profile && session.profile.complete ? '#/' : '#/profil') : '#/belepes', 'data-haptic': '' }, t('continueToSite'), icon('chevR'))));
    }).catch((e) => { cleanUrl(); root.replaceChildren(failCard(errorKey(e))); });
    return root;
  }
  if (mode === 'resetPassword') {
    backend.auth.checkResetCode(code).then((email) => {
      const pw = passwordInput({ autocomplete: 'new-password' });
      const f = field(t('newPassword'), pw, { hint: t('passwordHint') });
      const err = h('div');
      const save = h('button', { class: 'btn primary block', type: 'submit', 'data-haptic': '' }, t('setPassword'));
      const form = h('form', { class: 'form', novalidate: true, style: 'text-align:left;width:100%' }, err, f.row, save);
      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        if (pw.input.value.length < 8) { f.setError(t('errWeakPassword')); return; }
        busy(save, async () => {
          try {
            await backend.auth.confirmReset(code, pw.input.value); cleanUrl(); haptic(15);
            try { await backend.auth.signIn(email, pw.input.value); location.hash = '#/udv'; return; } catch { /* fall back to the message */ }
            root.replaceChildren(card(bigIcon('check', true), h('h1', { class: 'display', style: 'font-size:34px' }, t('passwordSetTitle')), h('p', { class: 'muted', style: 'margin:0' }, t('passwordSetText')), h('a', { class: 'btn primary', href: '#/belepes' }, t('signIn'))));
          } catch (e) { err.replaceChildren(formError(t(errorKey(e)))); }
        });
      });
      root.replaceChildren(card(bigIcon('lock', true), h('h1', { class: 'display', style: 'font-size:34px' }, t('resetTitle')), h('p', { class: 'muted', style: 'margin:0' }, t('resetFor', { email })), form));
    }).catch((e) => { cleanUrl(); root.replaceChildren(failCard(errorKey(e))); });
    return root;
  }
  cleanUrl();
  root.replaceChildren(failCard('errActionCode'));
  return root;
}

function failCard(key) {
  return card(bigIcon('alert', false), h('h1', { class: 'display', style: 'font-size:30px' }, t('linkProblemTitle')), h('p', { class: 'muted', style: 'margin:0' }, t(key)),
    h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;justify-content:center' }, signedIn() ? h('a', { class: 'btn primary', href: '#/sajat' }, t('myPage')) : h('a', { class: 'btn primary', href: '#/belepes' }, t('signIn')), h('a', { class: 'btn', href: '#/jelszo' }, t('forgotPassword'))));
}
