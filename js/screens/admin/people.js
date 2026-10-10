// screens/admin/people.js
// Every account: search, filter, edit any profile field, roles and suspensions.
// Each save writes an audit entry with before/after and an optional reason.
import { h, frag } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { flip } from '../../core/motion.js';
import { field, toggle, choice, busy } from '../../ui/controls.js';
import { avatar, pageTitle, skelRows, empty, backLink, formError } from '../../ui/parts.js';
import { openSheet, toast } from '../../ui/sheet.js';
import { t, fmtDate } from '../../i18n/index.js';
import { backend, errorKey } from '../../services/backend.js';
import { session, isOwner } from '../../services/session.js';
import { users, teams, invalidate } from '../../core/data.js';
import { fullName, isComplete, ROLE_KEYS, DR_OPTS, SR_OPTS, validate, psnKey } from '../../model/profile.js';
import { emit } from '../../core/bus.js';

const ui = { q: '', filter: 'all' };

export function screenAdminPeople(_p, query) {
  if (query.get('szuro') === 'hianyos') ui.filter = 'incomplete';
  const list = h('div', { class: 'stack', style: 'gap:8px' }, skelRows(8, 62));
  const count = h('span', { class: 'faint' });
  const input = h('input', { type: 'search', placeholder: t('searchPeople'), value: ui.q, 'aria-label': t('searchPeople'), autocomplete: 'off' });
  let data = [], tms = [];
  const filters = [['all', t('all')], ['incomplete', t('incomplete')], ['staff', t('staff')], ['suspended', t('suspendedF')], ['requests', t('adminRequests')]];
  const chips = h('div', { class: 'chips', role: 'group' }, filters.map(([v, l]) => {
    const c = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(ui.filter === v) }, l);
    c.addEventListener('click', () => { ui.filter = v; chips.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c))); draw(true); });
    return c;
  }));
  const draw = (animate) => {
    const q = ui.q.trim().toLowerCase();
    const items = data.filter((u) => {
      const r = u.roles || {};
      if (ui.filter === 'incomplete' && isComplete(u)) return false;
      if (ui.filter === 'staff' && !ROLE_KEYS.some((k) => r[k])) return false;
      if (ui.filter === 'suspended' && !(u.suspendedUntil > Date.now())) return false;
      if (ui.filter === 'requests' && !u.teamRequest) return false;
      return !q || [fullName(u), u.psn, u.raceNumber, u.uid].join(' ').toLowerCase().includes(q);
    }).sort((a, b) => fullName(a).localeCompare(fullName(b), 'hu'));
    count.textContent = t('nPeople', { n: items.length });
    const build = () => list.replaceChildren(...(items.length ? items.map((u) => {
      const tm = tms.find((x) => x.id === u.teamId);
      const r = ROLE_KEYS.filter((k) => (u.roles || {})[k]);
      return h('button', { class: 'row-card', type: 'button', dataset: { key: u.uid }, onclick: () => editPerson(u, tms, reload) }, avatar(u, tm),
        h('span', { class: 'nm' }, h('b', null, fullName(u) || t('noName')), h('span', null, u.psn || t('profileNotStarted'), u.suspendedUntil > Date.now() ? '  ' + t('suspendedF') : '')),
        h('span', { class: 'roles' }, !isComplete(u) ? h('span', { class: 'role-tag' }, t('incomplete')) : null, u.teamRequest ? h('span', { class: 'role-tag' }, t('requestTag')) : null, r.map((k) => h('span', { class: 'role-tag ' + k }, t('role_' + k)))));
    }) : [empty(t('noMatches'))]));
    animate ? flip(list, build, { stagger: 10 }) : build();
  };
  const reload = () => { invalidate('users'); Promise.all([users(), teams()]).then(([us, tm]) => { data = us; tms = tm; draw(true); }); };
  let qT; input.addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => { ui.q = input.value; draw(true); }, 90); });
  Promise.all([users(), teams()]).then(([us, tm]) => { data = us; tms = tm; draw(false); }).catch(() => list.replaceChildren(empty(t('loadFailed'))));
  return frag(backLink(t('admin'), '#/admin'), pageTitle(t('adminPeople')),
    h('div', { class: 'toolbar' }, h('label', { class: 'field' }, icon('search'), input), chips, h('div', { class: 'row' }, count)), list);
}

function editPerson(u, tms, reload) {
  const draft = { ...u, roles: { ...(u.roles || {}) } };
  const err = h('div');
  const emailLine = h('span', { class: 'faint' }, '…');
  backend.users.getPrivate(u.uid).then((p) => { emailLine.textContent = p.email || '–'; }).catch(() => { emailLine.textContent = '–'; });
  const txt = (key, label, opts = {}) => {
    const inp = h('input', { class: 'input', value: draft[key] ?? '', ...opts });
    inp.addEventListener('input', () => { draft[key] = opts.inputmode === 'numeric' ? (inp.value === '' ? null : Number(inp.value)) : inp.value; });
    return field(label, inp);
  };
  const last = txt('lastName', t('lastName')), first = txt('firstName', t('firstName')), psn = txt('psn', t('psnId'), { autocapitalize: 'off' }), num = txt('raceNumber', t('raceNumber'), { inputmode: 'numeric' });
  const teamSel = h('select', { class: 'select', style: 'width:100%' }, h('option', { value: '' }, t('noTeam')), tms.map((tm) => h('option', { value: tm.id, selected: draft.teamId === tm.id }, tm.name)));
  teamSel.addEventListener('change', () => { draft.teamId = teamSel.value || null; if (draft.teamRequest === draft.teamId) draft.teamRequest = null; });
  const req = u.teamRequest ? tms.find((x) => x.id === u.teamRequest) : null;
  const reqBox = req ? h('div', { class: 'callout' }, icon('clock'), h('span', { style: 'flex:1' }, t('requestFor', { team: req.name })),
    h('button', { class: 'btn small', type: 'button', onclick: () => { draft.teamId = req.id; draft.teamRequest = null; teamSel.value = req.id; reqBox.remove(); toast(t('requestApprovedDraft')); } }, t('approve')),
    h('button', { class: 'btn small', type: 'button', onclick: () => { draft.teamRequest = null; reqBox.remove(); } }, t('decline'))) : null;
  const roleRows = ROLE_KEYS.map((k) => {
    const ownerOnly = k === 'owner' || k === 'admin';
    const self = u.uid === session.user.uid && k === 'owner';
    return h('div', { class: 'toggle-row' }, h('span', null, t('role_' + k), h('small', null, t('roleHint_' + k))),
      toggle(!!draft.roles[k], (v) => { draft.roles[k] = v; }, { label: t('role_' + k), disabled: (ownerOnly && !isOwner()) || self }));
  });
  const scope = new Set(Array.isArray(u.judgeScope) && u.judgeScope.length ? u.judgeScope : ['A', 'B', 'C']);
  draft.judgeScope = [...scope];
  const scopeRow = h('div', { class: 'f-row', style: 'margin-top:10px' }, h('span', { class: 'f-label' }, t('judgeScope')),
    h('div', { class: 'choice multi' }, ['A', 'B', 'C'].map((L) => { const b = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(scope.has(L)) }, t('lobbyX', { l: L })); b.addEventListener('click', () => { scope.has(L) ? scope.delete(L) : scope.add(L); b.setAttribute('aria-pressed', String(scope.has(L))); draft.judgeScope = [...scope].sort(); }); return b; })),
    h('span', { class: 'hint' }, t('judgeScopeHint')));
  const until = h('input', { class: 'input', type: 'date', value: u.suspendedUntil ? new Date(u.suspendedUntil).toISOString().slice(0, 10) : '' });
  until.addEventListener('change', () => { draft.suspendedUntil = until.value ? Date.parse(until.value + 'T23:59:59') : null; });
  const note = h('input', { class: 'input', value: u.suspendNote || '', maxlength: 200, placeholder: t('suspendNotePh') });
  note.addEventListener('input', () => { draft.suspendNote = note.value; });
  const reason = h('input', { class: 'input', maxlength: 200, placeholder: t('reasonPh') });
  const save = h('button', { class: 'btn primary block', type: 'button', 'data-haptic': '' }, icon('check'), t('save'));
  const sh = openSheet({ title: fullName(u) || t('noName'), body: frag(
    h('p', { style: 'margin:0 0 12px;display:flex;gap:8px;align-items:center' }, icon('mail'), emailLine),
    err, reqBox,
    h('div', { class: 'form' }, last.row, first.row, psn.row, num.row,
      h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, 'DR'), choice(DR_OPTS.map((v) => ({ value: v, label: v })), draft.dr, (v) => { draft.dr = v; })),
      h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, 'SR'), choice(SR_OPTS.map((v) => ({ value: v, label: v })), draft.sr, (v) => { draft.sr = v; })),
      h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('mcsmTeam')), teamSel)),
    h('h3', { class: 'display', style: 'font-size:22px;margin:22px 0 4px' }, t('rolesTitle')), roleRows, scopeRow,
    h('h3', { class: 'display', style: 'font-size:22px;margin:22px 0 8px' }, t('suspension')),
    h('div', { class: 'form' }, field(t('suspendedUntil'), until).row, field(t('suspendNote'), note).row, field(t('reason'), reason, { hint: t('reasonHint') }).row, save)) });
  save.addEventListener('click', () => busy(save, async () => {
    err.replaceChildren();
    const bad = [['lastName', last], ['firstName', first], ['psn', psn]].find(([k]) => draft[k] && validate[k === 'psn' ? 'psn' : 'name'](draft[k]));
    if (bad) { bad[1].setError(t(validate[bad[0] === 'psn' ? 'psn' : 'name'](draft[bad[0]]))); return; }
    if (draft.raceNumber != null && (!Number.isInteger(draft.raceNumber) || draft.raceNumber < 1 || draft.raceNumber > 999)) { num.setError(t('errNumber')); return; }
    const keys = ['firstName', 'lastName', 'psn', 'raceNumber', 'dr', 'sr', 'teamId', 'teamRequest', 'roles', 'judgeScope', 'suspendedUntil', 'suspendNote'];
    const patch = {}, before = {}, after = {};
    keys.forEach((k) => { if (JSON.stringify(draft[k] ?? null) !== JSON.stringify(u[k] ?? null)) { patch[k] = draft[k] ?? null; before[k] = u[k] ?? null; after[k] = draft[k] ?? null; } });
    if (!Object.keys(patch).length) { sh.close(true); return; }
    if ('psn' in patch) patch.psnLower = psnKey(patch.psn);
    try {
      await backend.users.save(u.uid, patch);
      await backend.audit.add({ action: 'user.update', target: u.uid, targetName: fullName({ ...u, ...patch }), before, after, reason: reason.value.trim() || null });
      sh.close(true); toast(t('saved')); reload(); emit('rerender');
    } catch (e) { err.replaceChildren(formError(t(errorKey(e)))); }
  }));
}
