// screens/auth.js
// Sign in, sign up, forgotten password. Email + password only.
import { h, frag } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { haptic } from '../core/motion.js';
import { field, passwordInput, busy } from '../ui/controls.js';
import { formError } from '../ui/parts.js';
import { toast } from '../ui/sheet.js';
import { t } from '../i18n/index.js';
import { backend, errorKey } from '../services/backend.js';
import { go } from '../router.js';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
function shake(el) { haptic(25); el.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(-3px)' }, { transform: 'translateX(0)' }], { duration: 320, easing: 'ease-out' }); }

function card(title, sub, form, alt) {
  return h('div', { class: 'narrow' }, h('section', { class: 'panel auth-card' }, h('h1', { class: 'display' }, title), sub ? h('p', { class: 'muted', style: 'margin:0 0 18px' }, sub) : null, form), alt ? h('p', { class: 'auth-alt' }, alt) : null);
}

export function screenSignIn(_p, query) {
  const email = field(t('email'), h('input', { class: 'input', type: 'email', autocomplete: 'email', inputmode: 'email', required: true }));
  const pw = passwordInput({ autocomplete: 'current-password', required: true });
  const pwf = field(t('password'), pw);
  const errBox = h('div');
  const submit = h('button', { class: 'btn primary block', type: 'submit', 'data-haptic': '' }, t('signIn'));
  const form = h('form', { class: 'form', novalidate: true }, errBox, email.row, pwf.row,
    h('a', { href: '#/jelszo', style: 'color:var(--accent-text);font-weight:650;font-size:14px;justify-self:start' }, t('forgotPassword')), submit);
  if (backend.kind === 'fake') form.append(h('p', { class: 'note', style: 'margin:0' }, t('testAccountsHint')));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errBox.replaceChildren();
    const em = email.input.value.trim();
    email.setError(EMAIL_RE.test(em) ? '' : t('errEmail'));
    pwf.setError(pw.input.value ? '' : t('errRequired'));
    if (!EMAIL_RE.test(em) || !pw.input.value) { shake(submit); return; }
    busy(submit, async () => {
      try { await backend.auth.signIn(em, pw.input.value); go(query.get('next') || '/sajat', true); }
      catch (err) { errBox.replaceChildren(formError(t(errorKey(err)))); shake(submit); }
    });
  });
  const returning = h('a', { class: 'callout tap', href: '#/aktivalas', style: 'margin-bottom:16px;display:flex;text-decoration:none;color:inherit' }, icon('refresh'), h('span', { style: 'flex:1' }, h('b', { style: 'display:block' }, t('returningTitle')), t('returningText')), icon('chevR'));
  return h('div', null, h('div', { class: 'narrow' }, returning), card(t('signInTitle'), t('signInSub'), form, frag(t('noAccount'), ' ', h('a', { href: '#/regisztracio' }, t('signUp')))));
}

export function screenSignUp() {
  const email = field(t('email'), h('input', { class: 'input', type: 'email', autocomplete: 'email', inputmode: 'email', required: true }));
  const pw = passwordInput({ autocomplete: 'new-password', required: true });
  const pwf = field(t('password'), pw, { hint: t('passwordHint') });
  const consent = h('input', { type: 'checkbox', id: 'consent', style: 'width:20px;height:20px;accent-color:var(--accent);flex:0 0 auto;margin-top:2px' });
  const consentRow = h('label', { for: 'consent', style: 'display:flex;gap:10px;align-items:flex-start;font-size:14px;color:var(--ink-2)' }, consent, h('span', null, t('consentText')));
  const consentErr = h('div', { class: 'err', role: 'alert', style: 'color:var(--red);font-size:12.5px;font-weight:600' });
  const errBox = h('div');
  const submit = h('button', { class: 'btn primary block', type: 'submit', 'data-haptic': '' }, t('createAccount'));
  const form = h('form', { class: 'form', novalidate: true }, errBox, email.row, pwf.row, h('div', null, consentRow, consentErr), submit);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    errBox.replaceChildren();
    const em = email.input.value.trim(), p = pw.input.value;
    const eErr = EMAIL_RE.test(em) ? '' : t('errEmail');
    const pErr = p.length >= 8 ? '' : t('errWeakPassword');
    email.setError(eErr); pwf.setError(pErr); consentErr.textContent = consent.checked ? '' : t('errConsent');
    if (eErr || pErr || !consent.checked) { shake(submit); return; }
    busy(submit, async () => {
      try { await backend.auth.signUp(em, p); toast(t('accountCreated')); go('/profil', true); }
      catch (err) { errBox.replaceChildren(formError(t(errorKey(err)))); shake(submit); }
    });
  });
  return card(t('signUpTitle'), t('signUpSub'), form, frag(t('haveAccount'), ' ', h('a', { href: '#/belepes' }, t('signIn'))));
}

export function screenReset() {
  const email = field(t('email'), h('input', { class: 'input', type: 'email', autocomplete: 'email', inputmode: 'email', required: true }));
  const errBox = h('div');
  const submit = h('button', { class: 'btn primary block', type: 'submit' }, t('sendResetLink'));
  const form = h('form', { class: 'form', novalidate: true }, errBox, email.row, submit);
  const box = h('div', null, form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const em = email.input.value.trim();
    email.setError(EMAIL_RE.test(em) ? '' : t('errEmail'));
    if (!EMAIL_RE.test(em)) { shake(submit); return; }
    busy(submit, async () => {
      try {
        await backend.auth.sendReset(em);
        box.replaceChildren(h('div', { class: 'callout' }, icon('mail'), h('span', null, t('resetSent', { email: em }))), h('a', { class: 'btn block', href: '#/belepes', style: 'margin-top:16px' }, t('backToSignIn')));
      } catch (err) { errBox.replaceChildren(formError(t(errorKey(err)))); }
    });
  });
  return card(t('resetTitle'), t('resetSub'), box, frag(h('a', { href: '#/belepes' }, t('backToSignIn'))));
}

// Returning drivers from the old site: their account exists (with their old email) but has
// no password yet. The reset email proves the address is theirs; then they choose one.
export function screenActivate() {
  const email = field(t('email'), h('input', { class: 'input', type: 'email', autocomplete: 'email', inputmode: 'email', required: true }));
  const errBox = h('div');
  const submit = h('button', { class: 'btn primary block', type: 'submit', 'data-haptic': '' }, t('activateSend'));
  const form = h('form', { class: 'form', novalidate: true }, errBox, email.row, submit);
  const box = h('div', null, h('p', { class: 'muted', style: 'margin:0 0 16px' }, t('activateText')), form);
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const em = email.input.value.trim().toLowerCase();
    email.setError(EMAIL_RE.test(em) ? '' : t('errEmail'));
    if (!EMAIL_RE.test(em)) { shake(submit); return; }
    busy(submit, async () => {
      try {
        await backend.auth.sendReset(em);
        box.replaceChildren(h('div', { class: 'callout', style: 'display:block' }, h('b', { style: 'display:block;margin-bottom:4px' }, t('activateSentTitle')), t('activateSent', { email: em })),
          backend.kind === 'fake' ? h('a', { class: 'btn block', style: 'margin-top:12px', href: `?fakecloud&mode=resetPassword&oobCode=${encodeURIComponent('fake:' + em)}` }, t('activateTestLink')) : null,
          h('a', { class: 'btn block', href: '#/belepes', style: 'margin-top:12px' }, t('backToSignIn')));
      } catch (err) { errBox.replaceChildren(formError(t(errorKey(err)))); }
    });
  });
  return card(t('activateTitle'), null, box, frag(h('a', { href: '#/belepes' }, t('backToSignIn'))));
}
