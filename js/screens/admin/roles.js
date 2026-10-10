// screens/admin/roles.js
// Roles, handed out one level down: owners appoint admins (and everything below), admins
// appoint the judge chair, judges and results editors, the judge chair appoints judges.
// Owners themselves are set in the Firebase console (FIREBASE_SETUP.md).
import { h, frag } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { flip } from '../../core/motion.js';
import { busy, choice } from '../../ui/controls.js';
import { avatar, pageTitle, backLink, skelRows, empty, formError } from '../../ui/parts.js';
import { openSheet, toast } from '../../ui/sheet.js';
import { t } from '../../i18n/index.js';
import { backend, errorKey } from '../../services/backend.js';
import { session, grantableRoles } from '../../services/session.js';
import { users as loadUsers, teamMap, invalidate } from '../../core/data.js';
import { fullName, ROLE_KEYS } from '../../model/profile.js';
import { notifyUsers } from '../../services/notify.js';

export function screenRoles() {
  const mine = grantableRoles();
  const box = h('div', null, skelRows(6, 62));
  let all = [], tmap = {};
  const draw = (animate) => {
    const groups = ROLE_KEYS.map((k) => [k, all.filter((u) => u.roles && u.roles[k] === true)]);
    const build = () => box.replaceChildren(...groups.map(([k, us]) => h('section', { style: 'margin-bottom:18px' },
      h('div', { class: 'row-between', style: 'margin-bottom:8px' }, h('h2', { class: 'display', style: 'font-size:22px' }, t('role_' + k)), h('span', { class: 'faint', style: 'font-size:13px' }, t('roleHint_' + k))),
      us.length ? h('div', { class: 'stack', style: 'gap:6px' }, us.map((u) => h('div', { class: 'row-card', dataset: { key: k + u.uid } }, avatar(u, tmap[u.teamId]),
        h('span', { class: 'nm' }, h('b', null, fullName(u) || u.psn || u.uid), h('span', null, u.psn || '')),
        mine.includes(k) && u.uid !== session.user.uid ? h('button', { class: 'btn small', type: 'button', onclick: () => setRole(u, k, false) }, t('removeRole')) : null)))
        : h('p', { class: 'note', style: 'margin:0' }, k === 'owner' ? t('ownerConsoleNote') : t('noOneYet')))));
    animate ? flip(box, build) : build();
  };
  const load = () => { invalidate('users'); return Promise.all([loadUsers(), teamMap()]).then(([us, tm]) => { all = us; tmap = tm; draw(true); }); };
  async function setRole(u, k, value) {
    try {
      const roles = { ...(u.roles || {}), [k]: value };
      if (!value) delete roles[k];
      await backend.users.save(u.uid, { roles });
      await backend.audit.add({ action: 'user.update', target: u.uid, targetName: fullName(u), before: { roles: u.roles || {} }, after: { roles }, reason: null });
      if (value) notifyUsers([u.uid], 'roleGranted', { role: t('role_' + k) }, '#/sajat');
      toast(value ? t('roleGiven', { role: t('role_' + k) }) : t('roleRemoved')); await load();
    } catch (e) { toast(t(errorKey(e)), 'alert'); }
  }
  const grant = h('button', { class: 'btn primary', type: 'button', 'data-haptic': '' }, icon('plus'), t('grantRole'));
  grant.addEventListener('click', () => {
    let role = mine[0], picked = null;
    const q = h('input', { class: 'input', type: 'search', placeholder: t('searchPeople'), autocomplete: 'off' });
    const results = h('div', { class: 'stack', style: 'gap:6px;max-height:320px;overflow-y:auto' });
    const err = h('div');
    const ok = h('button', { class: 'btn primary block', type: 'button', disabled: true }, icon('check'), t('grantRole'));
    const drawResults = () => {
      const s = q.value.trim().toLowerCase();
      const items = all.filter((u) => !(u.roles && u.roles[role] === true) && (!s || [fullName(u), u.psn].join(' ').toLowerCase().includes(s))).slice(0, 20);
      results.replaceChildren(...(items.length ? items.map((u) => h('button', { class: 'row-card', type: 'button', style: picked === u ? 'border-color:var(--accent-text)' : '', onclick: () => { picked = u; ok.disabled = false; drawResults(); } }, avatar(u, tmap[u.teamId]), h('span', { class: 'nm' }, h('b', null, fullName(u) || u.psn), h('span', null, u.psn || '')), picked === u ? icon('check') : null)) : [empty(t('noMatches'))]));
    };
    q.addEventListener('input', drawResults);
    ok.addEventListener('click', () => busy(ok, async () => { if (!picked) return; await setRole(picked, role, true); sh.close(true); }));
    const sh = openSheet({ title: t('grantRole'), body: frag(h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('role')), choice(mine.map((k) => ({ value: k, label: t('role_' + k) })), role, (v) => { role = v; picked = null; ok.disabled = true; drawResults(); })),
      h('div', { style: 'margin:12px 0 8px' }, q), results, err, h('div', { style: 'margin-top:12px' }, ok)) });
    drawResults();
  });
  Promise.all([loadUsers(), teamMap()]).then(([us, tm]) => { all = us; tmap = tm; draw(false); }).catch(() => box.replaceChildren(empty(t('loadFailed'))));
  return frag(backLink(t('admin'), '#/admin'), pageTitle(t('rolesTitle'), t('rolesSub')), h('div', { style: 'margin-bottom:16px' }, grant), box);
}
