// screens/admin/teams.js
// MCSM team catalogue and GT teams: create, edit, retire, delete.
import { h, frag } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { flip } from '../../core/motion.js';
import { field, seg, busy } from '../../ui/controls.js';
import { pageTitle, skelRows, empty, backLink, formError } from '../../ui/parts.js';
import { openSheet, toast } from '../../ui/sheet.js';
import { t } from '../../i18n/index.js';
import { backend, errorKey } from '../../services/backend.js';
import { users, teams, gtTeams, invalidate } from '../../core/data.js';
import { fullName } from '../../model/profile.js';
import { pickFile, uploadImage } from '../../ui/upload.js';

export function hslToHex(c) {
  if (!c) return '#888888';
  if (c.startsWith('#')) return c;
  const m = /hsl\((\d+)\s+(\d+)%\s+(\d+)%\)/.exec(c); if (!m) return '#888888';
  const hh = +m[1] / 360, s = +m[2] / 100, l = +m[3] / 100;
  const f = (n) => { const k = (n + hh * 12) % 12, a = s * Math.min(l, 1 - l); const v = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); return Math.round(v * 255).toString(16).padStart(2, '0'); };
  return '#' + f(0) + f(8) + f(4);
}

export function screenAdminTeams() {
  const list = h('div', { class: 'stack', style: 'gap:8px' }, skelRows(8, 62));
  const reload = () => { invalidate('teams'); invalidate('users'); load(true); };
  const load = (animate) => Promise.all([teams(), users()]).then(([tms, us]) => {
    const build = () => list.replaceChildren(...(tms.length ? tms.map((tm) => {
      const n = us.filter((u) => u.teamId === tm.id).length, rq = us.filter((u) => u.teamRequest === tm.id).length;
      return h('button', { class: 'row-card', type: 'button', dataset: { key: tm.id }, onclick: () => editTeam(tm, reload) },
        h('span', { style: `width:6px;height:36px;border-radius:3px;background:${tm.c1}` }),
        h('span', { class: 'nm' }, h('b', null, tm.name), h('span', null, t('nMembers', { n }), rq ? '  ' + t('nRequests', { n: rq }) : '')),
        h('span', { class: 'status' }, t('teamStatus_' + tm.status)));
    }) : [empty(t('noTeams'))]));
    animate ? flip(list, build) : build();
  }).catch(() => list.replaceChildren(empty(t('loadFailed'))));
  load(false);
  const add = h('button', { class: 'btn primary', type: 'button', onclick: () => editTeam(null, reload) }, icon('plus'), t('newTeam'));
  return frag(backLink(t('admin'), '#/admin'), pageTitle(t('adminTeams'), t('adminTeamsSub')), h('div', { style: 'margin-bottom:14px' }, add), list);
}

export function editTeam(tm, reload) {
  const draft = tm ? { ...tm } : { name: '', status: 'free', c1: '#B6F03C', c2: '#38BDF8' };
  const err = h('div');
  const name = h('input', { class: 'input', value: draft.name, maxlength: 40 });
  const nf = field(t('teamName'), name);
  name.addEventListener('input', () => { draft.name = name.value; nf.setError(''); });
  const status = seg([{ value: 'free', label: t('teamStatus_free') }, { value: 'perm', label: t('teamStatus_perm') }, { value: 'retired', label: t('teamStatus_retired') }], draft.status, (v) => { draft.status = v; });
  const col = (k) => { const i = h('input', { class: 'color-in', type: 'color', value: hslToHex(draft[k]), 'aria-label': t(k === 'c1' ? 'color1' : 'color2') }); i.addEventListener('input', () => { draft[k] = i.value; }); return i; };
  const save = h('button', { class: 'btn primary block', type: 'button', 'data-haptic': '' }, icon('check'), t('save'));
  const del = tm ? h('button', { class: 'btn danger block', type: 'button' }, icon('trash'), t('deleteTeam')) : null;
  const logoPrev = h('span', { class: 'logo-prev', style: draft.logoUrl ? `background-image:url("${draft.logoUrl}")` : '' });
  const logoBtn = h('button', { class: 'btn small', type: 'button' }, icon('plus'), t('logoUpload'));
  logoBtn.addEventListener('click', async () => { const f = await pickFile('image/*'); if (!f) return; busy(logoBtn, async () => { try { draft.logoUrl = await uploadImage(`teams/${draft.id || 'new'}/logo`, f, { max: 512 }); logoPrev.style.backgroundImage = `url("${draft.logoUrl}")`; } catch (e) { err.replaceChildren(formError(t(errorKey(e)))); } }); });
  const sh = openSheet({ title: tm ? tm.name : t('newTeam'), body: h('div', { class: 'form' }, err, nf.row,
    h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('teamStatus')), status, h('span', { class: 'hint' }, t('teamStatusHint'))),
    h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('colors')), h('div', { style: 'display:flex;gap:10px' }, col('c1'), col('c2'))),
    h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('teamLogo')), h('div', { style: 'display:flex;gap:12px;align-items:center' }, logoPrev, logoBtn)),
    save, del) });
  save.addEventListener('click', () => busy(save, async () => {
    if (!draft.name.trim()) { nf.setError(t('errRequired')); return; }
    try {
      const id = await backend.teams.save({ ...draft, name: draft.name.trim() });
      await backend.audit.add({ action: tm ? 'team.update' : 'team.create', target: id, targetName: draft.name.trim(), before: tm || null, after: draft, reason: null });
      sh.close(true); toast(t('saved')); reload();
    } catch (e) { err.replaceChildren(formError(t(errorKey(e)))); }
  }));
  if (del) del.addEventListener('click', () => busy(del, async () => {
    const us = await users();
    if (us.some((u) => u.teamId === tm.id)) { err.replaceChildren(formError(t('teamHasMembers'))); return; }
    try { await backend.teams.remove(tm.id); await backend.audit.add({ action: 'team.delete', target: tm.id, targetName: tm.name, before: tm, after: null, reason: null }); sh.close(true); toast(t('deleted')); reload(); }
    catch (e) { err.replaceChildren(formError(t(errorKey(e)))); }
  }));
}

export function screenAdminGt() {
  const list = h('div', { class: 'stack', style: 'gap:8px' }, skelRows(6, 62));
  const reload = () => { invalidate('gtTeams'); load(); };
  const load = () => Promise.all([gtTeams(), users()]).then(([gts, us]) => {
    flip(list, () => list.replaceChildren(...(gts.length ? gts.map((g) => h('button', { class: 'row-card', type: 'button', dataset: { key: g.id }, onclick: () => editGt(g, reload) },
      h('span', { class: 'cc', style: 'min-width:58px;height:28px;font-size:12.5px' }, g.tag), h('span', { class: 'nm' }, h('b', null, g.name), h('span', null, t('nMembers', { n: us.filter((u) => u.gtTeamId === g.id).length }))), icon('chevR', 'chev'))) : [empty(t('noTeams'))])));
  }).catch(() => list.replaceChildren(empty(t('loadFailed'))));
  load();
  return frag(backLink(t('admin'), '#/admin'), pageTitle(t('adminGt'), t('adminGtSub')),
    h('div', { style: 'margin-bottom:14px' }, h('button', { class: 'btn primary', type: 'button', onclick: () => editGt(null, reload) }, icon('plus'), t('newGt'))), list);
}

export function editGt(g, reload) {
  const cols = { c1: (g && g.c1) || '#B6F03C', c2: (g && g.c2) || '#38BDF8' };
  const colIn = (k) => { const i = h('input', { class: 'color-in', type: 'color', value: hslToHex(cols[k]), 'aria-label': t(k === 'c1' ? 'color1' : 'color2') }); i.addEventListener('input', () => { cols[k] = i.value; }); return i; };
  const tag = h('input', { class: 'input', value: g ? g.tag : '', maxlength: 12, autocapitalize: 'characters', disabled: !!g });
  const name = h('input', { class: 'input', value: g ? g.name : '', maxlength: 60 });
  const tf = field(t('gtTag'), tag, { hint: t('gtTagHint') }), nf = field(t('gtName'), name);
  let logoUrl = g ? g.logoUrl || null : null;
  const logoPrev = h('span', { class: 'logo-prev', style: logoUrl ? `background-image:url("${logoUrl}")` : '' });
  const logoBtn = h('button', { class: 'btn small', type: 'button' }, icon('plus'), t('logoUpload'));
  logoBtn.addEventListener('click', async () => { const f = await pickFile('image/*'); if (!f) return; busy(logoBtn, async () => { try { logoUrl = await uploadImage(`teams/gt-${(tag.value || 'new').trim().toLowerCase()}/logo`, f, { max: 512 }); logoPrev.style.backgroundImage = `url("${logoUrl}")`; } catch (e) { err.replaceChildren(formError(t(errorKey(e)))); } }); });
  const err = h('div');
  const save = h('button', { class: 'btn primary block', type: 'button' }, icon('check'), t('save'));
  const del = g ? h('button', { class: 'btn danger block', type: 'button' }, icon('trash'), t('delete')) : null;
  const sh = openSheet({ title: g ? g.tag : t('newGt'), body: h('div', { class: 'form' }, err, tf.row, nf.row, h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('colors')), h('div', { style: 'display:flex;gap:10px' }, colIn('c1'), colIn('c2'))), h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('teamLogo')), h('div', { style: 'display:flex;gap:12px;align-items:center' }, logoPrev, logoBtn)), save, del) });
  save.addEventListener('click', () => busy(save, async () => {
    const tg = tag.value.trim(), nm = name.value.trim();
    tf.setError(/^[A-Za-z0-9_-]{1,12}$/.test(tg) ? '' : t('errGtTag')); nf.setError(nm ? '' : t('errRequired'));
    if (!/^[A-Za-z0-9_-]{1,12}$/.test(tg) || !nm) return;
    try { const id = await backend.gtTeams.save({ tag: tg, name: nm, logoUrl, c1: cols.c1, c2: cols.c2 }); await backend.audit.add({ action: g ? 'gt.update' : 'gt.create', target: id, targetName: nm, before: g || null, after: { tag: tg, name: nm }, reason: null }); sh.close(true); toast(t('saved')); reload(); }
    catch (e) { err.replaceChildren(formError(t(errorKey(e)))); }
  }));
  if (del) del.addEventListener('click', () => busy(del, async () => {
    // like MCSM teams: everyone has to leave the GT team first
    const left = (await users()).filter((u) => u.gtTeamId === g.id).length;
    if (left) { err.replaceChildren(formError(t('gtHasMembers', { n: left }))); return; }
    try { await backend.gtTeams.remove(g.id); await backend.audit.add({ action: 'gt.delete', target: g.id, targetName: g.name, before: g, after: null, reason: null }); sh.close(true); toast(t('deleted')); reload(); }
    catch (e) { err.replaceChildren(formError(t(errorKey(e)))); }
  }));
}
