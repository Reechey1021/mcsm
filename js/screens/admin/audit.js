// screens/admin/audit.js
// The change log: who changed what, when, and why.
import { h, frag } from '../../core/dom.js';
import { pageTitle, skelRows, empty, backLink } from '../../ui/parts.js';
import { t, fmtDate } from '../../i18n/index.js';
import { backend } from '../../services/backend.js';
import { users, teams } from '../../core/data.js';
import { fullName } from '../../model/profile.js';

const LABEL = { lastName: 'lastName', firstName: 'firstName', psn: 'psnId', raceNumber: 'raceNumber', teamId: 'mcsmTeam', teamRequest: 'requestTag', roles: 'rolesTitle', suspendedUntil: 'suspendedUntil', suspendNote: 'suspendNote', name: 'teamName', status: 'teamStatus', c1: 'color1', c2: 'color2', tag: 'gtTag' };
const label = (k) => (LABEL[k] ? t(LABEL[k]) : k.toUpperCase());
function show(k, v, tmap) {
  if (v == null || v === '') return '–';
  if (k === 'roles') { const on = Object.keys(v).filter((r) => v[r]); return on.length ? on.map((r) => t('role_' + r)).join(', ') : '–'; }
  if (k === 'teamId' || k === 'teamRequest') return (tmap[v] && tmap[v].name) || v;
  if (k === 'status') return t('teamStatus_' + v);
  if (k === 'suspendedUntil') return fmtDate(v);
  return typeof v === 'object' ? JSON.stringify(v) : String(v);
}

export function screenAdminAudit() {
  const list = h('div', null, skelRows(8, 54));
  Promise.all([backend.audit.list(150), users(), teams()]).then(([rows, us, tms]) => {
    const tmap = Object.fromEntries(tms.map((x) => [x.id, x]));
    const who = (uid) => { const u = us.find((x) => x.uid === uid); return u ? fullName(u) : uid; };
    list.replaceChildren(...(rows.length ? rows.map((r) => {
      const keys = r.before && r.after && typeof r.after === 'object' ? Object.keys(r.after).filter((k) => !['updatedAt', 'createdAt', 'id'].includes(k) && JSON.stringify(r.after[k]) !== JSON.stringify((r.before || {})[k])) : [];
      return h('div', { class: 'audit-row' }, h('time', null, fmtDate(r.at, true)),
        h('div', null, h('b', null, who(r.by)), ' ', t('audit_' + r.action), ' ', h('b', null, r.targetName || r.target)),
        keys.length ? h('div', { class: 'faint', style: 'font-size:13px;margin-top:3px' }, keys.map((k) => `${label(k)}: ${show(k, (r.before || {})[k], tmap)} → ${show(k, r.after[k], tmap)}`).join('; ')) : null,
        r.reason ? h('div', { style: 'font-size:13px;margin-top:3px' }, t('reason') + ': ' + r.reason) : null);
    }) : [empty(t('auditEmpty'))]));
  }).catch(() => list.replaceChildren(empty(t('loadFailed'))));
  return frag(backLink(t('admin'), '#/admin'), pageTitle(t('adminAudit'), t('adminAuditSub')), list);
}
