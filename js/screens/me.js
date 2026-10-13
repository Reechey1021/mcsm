// screens/me.js
// "Saját": your profile at a glance, account details, password, sign out.
import { h, frag } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { field, passwordInput, busy } from '../ui/controls.js';
import { avatar, ratingEl, formError, secHead } from '../ui/parts.js';
import { openSheet, toast } from '../ui/sheet.js';
import { t, fmtDate } from '../i18n/index.js';
import { backend, errorKey } from '../services/backend.js';
import { session, isAdmin, roles, profileComplete } from '../services/session.js';
import { fullName, ROLE_KEYS } from '../model/profile.js';
import { teamMap, gtTeams } from '../core/data.js';
import { verifyBanner } from './banners.js';
import { fmtInt } from '../core/motion.js';
import { ratingPanel } from '../ui/rating.js';
import { mcsmRatingBox } from '../ui/mcsm-rating.js';
import { teamBadge, medalRow } from '../ui/parts.js';
import { honours } from '../services/honours.js';
import { medalsForUser } from '../model/honours.js';
import { trophy, trophyCount } from '../ui/trophy.js';
import { pickFile, uploadImage } from '../ui/upload.js';
import { emit } from '../core/bus.js';
import { toggle } from '../ui/controls.js';
import { pushState, enablePush, disablePush } from '../services/push.js';
import { openSheet as openSheet2 } from '../ui/sheet.js';
import { go } from '../router.js';
import { myEntries } from './seasons.js';

export function profileHead(p, team, opts = {}) {
  const av = avatar(p, team, 'lg');
  if (opts.editable) {
    av.removeAttribute('aria-hidden');
    const edit = h('button', { class: 'avatar-edit', type: 'button', 'aria-label': t('photoChange') }, icon('edit'));
    edit.addEventListener('click', () => photoSheet(p));
    av.append(edit); av.style.overflow = 'visible';
  }
  if (opts.vt) av.style.viewTransitionName = 'drv-hero';
  return h('section', { class: 'profile-head' + (p.gt7Cover ? ' has-cover' : '') }, p.gt7Cover ? h('span', { class: 'head-cover', vars: { 'background-image': `url("${String(p.gt7Cover).replace(/"/g, '')}")` }, 'aria-hidden': 'true' }) : null, h('span', { class: 'bign', 'aria-hidden': 'true' }, p.raceNumber ?? ''), av,
    h('div', { style: 'min-width:0' }, h('h1', { class: 'display' }, (p.lastName || '').toLocaleUpperCase('hu'), h('br'), p.firstName || ''),
      h('div', { class: 'sub' }, h('span', null, p.psn || ''), ratingEl(p), headTitles(p, opts)),
      h('div', { class: 'head-chips' }, team ? h('a', { class: 'head-chip', href: '#/csapatok/' + team.id, style: 'color:inherit' }, teamBadge(team, 18), team.name) : null, p.gtTeamId ? h('span', { class: 'head-chip' }, opts.gt && opts.gt.logoUrl ? teamBadge(opts.gt, 18) : null, p.gtTeamId) : null)));
}

// Titles next to the name in the profile header (filled in once the honours are loaded).
function headTitles(p, opts) {
  const el = h('span', { class: 'head-titles' });
  honours().then((H) => { const m = medalsForUser(H.people, { ...p, uid: p.uid || opts.uid }); if (m && m.medals[0]) el.replaceChildren(trophyCount(m.medals[0], 0, 18)); }).catch(() => {});
  return el;
}

// Championship titles from the hall of fame and finished seasons (overall drivers' title only;
// the MGTK table lives on the hall of fame page).
function titlesBox(p) {
  const box = h('section', { style: 'margin-top:12px' });
  honours().then((H) => { const m = medalsForUser(H.people, p); if (!m) { box.remove(); return; } box.replaceChildren(h('div', { class: 'panel pad' }, h('div', { class: 'row-between', style: 'margin-bottom:10px' }, h('span', { class: 'label' }, t('titlesTitle')), m.medals[0] ? h('span', { class: 'status champ' }, trophy(0, 14), t('championN', { n: m.medals[0] })) : null), medalRow(m, { seasons: true }))); }).catch(() => box.remove());
  return box;
}

export function profileKv(p, team, gtName, gt) {
  const row = (ic, k, v) => h('div', { class: 'info-row' }, icon(ic), h('span', { class: 'k' }, k), h('span', { class: 'v' }, v));
  const input = p.input === 'wheel' ? `${t('wheel')}${p.wheelBrand ? ' (' + (p.wheelBrand === 'other' ? p.wheelOther : p.wheelBrand) + ')' : ''}` : t('pad');
  return frag(ratingPanel(p), titlesBox(p),
    h('section', { class: 'panel info-list' },
      row('flag', t('raceNumber'), h('b', { class: 'rnum', style: 'font-size:20px' }, '#' + (p.raceNumber ?? '–'))),
      row('users', t('mcsmTeam'), team ? h('a', { href: '#/csapatok/' + team.id, style: 'color:inherit;display:flex;gap:8px;align-items:center' }, teamBadge(team, 20), team.name) : t('noTeam')),
      row('grid', t('gtTeam'), gtName ? frag(gt && gt.logoUrl ? teamBadge(gt, 20) : null, gtName) : t('none')),
      row(p.input === 'wheel' ? 'wheel' : 'pad', t('inputLabel'), input),
      row('eye', t('viewLabel'), p.view ? t('view_' + p.view) : '–')));
}

export function screenMe() {
  const p = session.profile || {};
  const box = h('div');
  const mi = (ic, label, onclick, end) => h('button', { class: 'menu-item', type: 'button', onclick }, icon(ic), label, end ? h('span', { class: 'end' }, end) : null, icon('chevR', 'chev'));
  const email = h('span', { class: 'end' }, session.user.email);
  const myEntriesBox = h('div');
  myEntries().then((rows) => { if (!rows.length) return; myEntriesBox.replaceChildren(secHead(t('myEntries')), h('div', { class: 'stack', style: 'gap:8px' }, rows.map(({ season: s, info }) => h('a', { class: 'round-item', href: '#/szezonok/' + s.id }, h('span', { class: 'no display' }, info.status === 'in' ? info.pos : info.status === 'waitlist' ? 'V' + info.pos : 'T'), h('span', { class: 't' }, h('b', null, 'MCSM' + s.no + (s.name ? ' – ' + s.name : '')), h('span', { class: 'sub' }, t('es_' + info.status))), icon('chevR', 'chev'))))); }).catch(() => {});
  Promise.all([teamMap(), gtTeams()]).then(([tm, gts]) => {
    const team = tm[p.teamId];
    const gt = gts.find((g) => g.id === p.gtTeamId);
    const myRoles = ROLE_KEYS.filter((k) => roles()[k]);
    box.replaceChildren(...[
      profileComplete() ? frag(profileHead(p, team, { gt, uid: session.user.uid }), profileKv({ ...p, uid: session.user.uid }, team, gt && gt.tag, gt)) : h('div', { class: 'empty' }, t('profileIncomplete'), h('div', { style: 'margin-top:14px' }, h('a', { class: 'btn primary', href: '#/profil' }, t('finishProfileBtnShort')))),
      p.teamRequest ? h('div', { class: 'callout', style: 'margin-top:12px' }, icon('clock'), h('span', null, t('teamRequestPending', { team: (tm[p.teamRequest] || {}).name || '' }))) : null,
      myRoles.length ? h('div', { class: 'roles', style: 'margin-top:12px' }, myRoles.map((k) => h('span', { class: 'role-tag ' + k }, t('role_' + k)))) : null,
      myEntriesBox,
      secHead(t('account')),
      session.user.emailVerified ? null : verifyBanner(),
      h('div', { class: 'panel', style: 'padding:0 14px' },
        h('div', { class: 'menu-item', style: 'cursor:default' }, icon('mail'), t('email'), email),
        mi('edit', t('editProfile'), () => go('/profil')),
        profileComplete() ? mi('user', t('publicProfile'), () => go('/pilotak/' + encodeURIComponent(p.psnLower))) : null,
        pushRow(),
        mi('lock', t('changePassword'), changePassword),
        isAdmin() ? mi('shield', t('admin'), () => go('/admin')) : null,
        h('button', { class: 'menu-item', type: 'button', style: 'color:var(--red)', onclick: async () => { await backend.auth.signOut(); toast(t('signedOut')); go('/'); } }, icon('logout'), t('signOut'))),
      h('p', { class: 'note' }, t('memberSince', { date: fmtDate(p.createdAt || Date.now()) }))].filter(Boolean));
  });
  return frag(h('h1', { class: 'display page-title' }, t('myPage')), box);
}

function changePassword() {
  const cur = passwordInput({ autocomplete: 'current-password' });
  const nxt = passwordInput({ autocomplete: 'new-password' });
  const f1 = field(t('currentPassword'), cur), f2 = field(t('newPassword'), nxt, { hint: t('passwordHint') });
  const err = h('div');
  const save = h('button', { class: 'btn primary block', type: 'submit' }, t('save'));
  const form = h('form', { class: 'form', novalidate: true }, err, f1.row, f2.row, save);
  const sh = openSheet({ title: t('changePassword'), body: form });
  form.addEventListener('submit', (e) => {
    e.preventDefault(); err.replaceChildren();
    f2.setError(nxt.input.value.length >= 8 ? '' : t('errWeakPassword'));
    if (nxt.input.value.length < 8) return;
    busy(save, async () => {
      try { await backend.auth.changePassword(cur.input.value, nxt.input.value); sh.close(true); toast(t('passwordChanged')); }
      catch (e2) { err.replaceChildren(formError(t(errorKey(e2)))); }
    });
  });
}

function photoSheet(p) {
  const status = h('div');
  const choose = h('button', { class: 'btn primary block', type: 'button', 'data-haptic': '' }, icon('plus'), t('photoChoose'));
  choose.addEventListener('click', async () => {
    const file = await pickFile('image/*'); if (!file) return;
    busy(choose, async () => {
      try { const url = await uploadImage(`avatars/${session.user.uid}/photo`, file, { max: 400, square: true }); await backend.users.save(session.user.uid, { photoUrl: url }); sh.close(true); toast(t('photoSaved')); setTimeout(() => emit('rerender'), 100); }
      catch (e) { status.replaceChildren(formError(t(errorKey(e)))); }
    });
  });
  const remove = p.photoUrl ? h('button', { class: 'btn block', type: 'button', style: 'color:var(--red)' }, icon('trash'), t('photoRemove')) : null;
  if (remove) remove.addEventListener('click', () => busy(remove, async () => { try { await backend.users.save(session.user.uid, { photoUrl: null }); sh.close(true); toast(t('photoRemoved')); setTimeout(() => emit('rerender'), 100); } catch (e) { status.replaceChildren(formError(t(errorKey(e)))); } }));
  const sh = openSheet2({ title: t('photoTitle'), body: h('div', { class: 'stack', style: 'gap:10px' }, h('p', { class: 'muted', style: 'margin:0' }, t('photoHelp')), status, choose, remove) });
}

function pushRow() {
  const st = pushState();
  const note = h('small', null, t('pushState_' + st));
  const sw = toggle(st === 'on', async (v) => {
    sw.disabled = true;
    try { const r = v ? await enablePush() : await disablePush(); note.textContent = t('pushState_' + r); toast(v ? t('pushOnToast') : t('pushOffToast')); }
    catch (e) { sw.setAttribute('aria-checked', 'false'); note.textContent = t({ 'push-denied': 'pushDenied', 'push-nokey': 'pushNoKey', 'push-ios-home': 'pushState_ios-home', 'push-unsupported': 'pushState_unsupported' }[e.code] || errorKey(e)); }
    finally { sw.disabled = st === 'unsupported' || st === 'ios-home' || st === 'blocked'; }
  }, { label: t('pushTitle'), disabled: st === 'unsupported' || st === 'ios-home' || st === 'blocked' });
  return h('div', { class: 'toggle-row', style: 'border-bottom:1px solid var(--line)' }, h('span', { style: 'display:flex;gap:12px;align-items:center' }, icon('bell'), h('span', null, t('pushTitle'), note)), sw);
}
