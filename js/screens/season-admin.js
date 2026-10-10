// screens/season-admin.js
// Admin tools on the season page: state, featured flag, registration window shortcuts,
// per-entry actions (seeded, reserve approval, order, withdraw, delete), adding a
// driver by hand and the CSV export. Every change is written to the change log.
import { h, frag } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { seg, toggle, busy } from '../ui/controls.js';
import { avatar, formError, empty } from '../ui/parts.js';
import { openSheet, toast } from '../ui/sheet.js';
import { t, fmtDate } from '../i18n/index.js';
import { backend, errorKey } from '../services/backend.js';
import { users as loadUsers, seasons as loadSeasons, invalidateSeason } from '../core/data.js';
import { fullName, isComplete } from '../model/profile.js';
import { STATES, regStatus, snapshotOf } from '../model/season.js';
import { DAY } from '../model/time.js';

const audit = (action, s, extra = {}) => backend.audit.add({ action, target: s.id, targetName: 'MCSM' + s.no, before: null, after: null, reason: null, ...extra });

export function adminSeasonCard(st, reload) {
  const s = st.season;
  const r = regStatus(s);
  const stateSeg = seg(STATES.map((k) => ({ value: k, label: t('state_' + k) })), s.state, (v) => {
    const yes = h('button', { class: 'btn primary block', type: 'button' }, t('confirm'));
    const sh = openSheet({ title: t('changeState'), body: frag(h('p', { class: 'muted', style: 'margin:0 0 16px' }, t('changeStateText', { from: t('state_' + s.state), to: t('state_' + v) })), yes), onClose: reload });
    yes.addEventListener('click', () => busy(yes, async () => {
      try { await backend.seasons.patch(s.id, { state: v }); await audit('season.state', s, { before: { state: s.state }, after: { state: v } }); sh.close(true); toast(t('saved')); reload(); }
      catch (e) { toast(t(errorKey(e)), 'alert'); }
    }));
  }, { scroll: true, label: t('seasonState') });
  const featured = toggle(!!s.featured, async (v) => {
    try {
      if (v) for (const o of (await loadSeasons()).filter((x) => x.featured && x.id !== s.id)) await backend.seasons.patch(o.id, { featured: false });
      await backend.seasons.patch(s.id, { featured: v }); await audit('season.featured', s, { after: { featured: v } });
      invalidateSeason(s.id); toast(v ? t('featuredOn') : t('featuredOff'));
    } catch (e) { toast(t(errorKey(e)), 'alert'); }
  }, { label: t('featured') });
  const openNow = r === 'soon' ? h('button', { class: 'btn small', type: 'button' }, t('openRegNow')) : null;
  const closeNow = r === 'open' ? h('button', { class: 'btn small', type: 'button' }, t('closeRegNow')) : null;
  const extend = (r === 'open' || (r === 'closed' && s.state === 'announced')) ? h('button', { class: 'btn small', type: 'button' }, t('extendReg')) : null;
  const win = async (btn, patch, action) => busy(btn, async () => {
    try { await backend.seasons.patch(s.id, patch); await audit(action, s, { before: { regOpensAt: s.regOpensAt, regClosesAt: s.regClosesAt }, after: patch }); toast(t('saved')); reload(); }
    catch (e) { toast(t(errorKey(e)), 'alert'); }
  });
  if (openNow) openNow.addEventListener('click', () => win(openNow, { state: 'announced', regOpensAt: Date.now(), regClosesAt: Math.max(s.regClosesAt || 0, Date.now() + 7 * DAY) }, 'season.regOpen'));
  if (closeNow) closeNow.addEventListener('click', () => win(closeNow, { regClosesAt: Date.now() }, 'season.regClose'));
  if (extend) extend.addEventListener('click', () => win(extend, { regClosesAt: Math.max(s.regClosesAt || 0, Date.now()) + 3 * DAY }, 'season.regExtend'));
  const del = s.state === 'draft' ? h('button', { class: 'btn small danger', type: 'button' }, icon('trash'), t('delete')) : null;
  if (del) del.addEventListener('click', () => busy(del, async () => {
    try { await backend.seasons.remove(s.id); await audit('season.delete', s); invalidateSeason(s.id); toast(t('deleted')); location.hash = '#/szezonok'; }
    catch (e) { toast(t(errorKey(e)), 'alert'); }
  }));
  return h('section', { class: 'panel pad', style: 'margin-top:12px' },
    h('div', { class: 'row-between' }, h('h2', { class: 'display', style: 'font-size:24px' }, t('manageSeason')), h('span', { class: 'status' }, icon('shield'), t('admin'))),
    h('div', { class: 'label', style: 'margin:14px 0 8px' }, t('seasonState')), stateSeg,
    h('div', { class: 'toggle-row', style: 'margin-top:8px' }, h('span', null, t('featured'), h('small', null, t('featuredHint'))), featured),
    h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:14px' },
      h('a', { class: 'btn small', href: '#/admin/szezon/' + s.id }, icon('edit'), t('editSeason')),
      h('a', { class: 'btn small', href: '#/admin/szezon/uj?masol=' + s.id }, icon('plus'), t('duplicateSeason')),
      openNow, closeNow, extend, del));
}

export function adminEntrySheet(e, st, reload) {
  const s = st.season, p = e.snapshot || {};
  const info = st.table.byUid[e.uid] || {};
  const err = h('div');
  const save = async (patch, action, msg) => {
    try { await backend.entries.save(s.id, e.uid, patch); await audit(action, s, { targetName: `MCSM${s.no}: ${fullName(p)}`, before: Object.fromEntries(Object.keys(patch).map((k) => [k, e[k] ?? null])), after: patch }); Object.assign(e, patch); toast(msg || t('saved')); invalidateSeason(s.id); }
    catch (x) { err.replaceChildren(formError(t(errorKey(x)))); throw x; }
  };
  const drivers = st.table.inList.concat(st.table.waitlist);
  const idx = drivers.findIndex((x) => x.uid === e.uid);
  const move = (dir) => async () => {
    const other = drivers[idx + dir]; if (!other) return;
    const a = other.order ?? other.createdAt, b = e.order ?? e.createdAt;
    try { await backend.entries.save(s.id, other.uid, { order: b }); await save({ order: a }, 'entry.order', t('moved')); sh.close(); } catch { /* shown */ }
  };
  const typeSeg = seg([{ value: 'driver', label: t('asDriverShort') }, { value: 'reserve', label: t('asReserveShort') }], e.type, async (v) => { await save({ type: v }, 'entry.type').catch(() => {}); });
  const sh = openSheet({ title: fullName(p), onClose: reload, body: frag(
    h('div', { style: 'display:flex;gap:12px;align-items:center;margin-bottom:12px' }, avatar(p, st.tmap[p.teamId]), h('div', null, h('b', null, p.psn), h('div', { class: 'faint', style: 'font-size:13px' }, t('es_' + (info.status || 'in')) + (info.pos ? ` (${info.pos}.)` : '') + '  ' + t('enteredAt', { date: fmtDate(e.createdAt || Date.now(), true) })))),
    e.note ? h('div', { class: 'callout', style: 'margin-bottom:12px' }, icon('info'), h('span', null, e.note)) : null,
    err,
    h('div', { class: 'toggle-row' }, h('span', null, t('seeded'), h('small', null, t('seededHint'))), toggle(!!e.seeded, (v) => save({ seeded: v }, 'entry.seeded').catch(() => {}), { label: t('seeded') })),
    e.type === 'reserve' ? h('div', { class: 'toggle-row' }, h('span', null, t('approved'), h('small', null, e.availability && e.availability.length ? t('availableRounds', { r: e.availability.join(', ') }) : '')), toggle(e.approved !== false, (v) => save({ approved: v }, 'entry.approve').catch(() => {}), { label: t('approved') })) : null,
    h('div', { class: 'f-row', style: 'margin:14px 0' }, h('span', { class: 'f-label' }, t('entryType')), typeSeg),
    e.type === 'driver' ? h('div', { style: 'display:flex;gap:8px;margin-bottom:12px' },
      h('button', { class: 'btn small', type: 'button', disabled: idx <= 0, onclick: move(-1) }, icon('up'), t('moveUp')),
      h('button', { class: 'btn small', type: 'button', disabled: idx < 0 || idx >= drivers.length - 1, onclick: move(1) }, icon('down'), t('moveDown'))) : null,
    h('div', { class: 'stack', style: 'gap:8px' },
      e.status === 'withdrawn'
        ? h('button', { class: 'btn block', type: 'button', onclick: () => save({ status: 'entered', withdrawnAt: null }, 'entry.restore').then(() => { sh.close(); }).catch(() => {}) }, icon('undo'), t('restoreEntry'))
        : h('button', { class: 'btn danger block', type: 'button', onclick: () => save({ status: 'withdrawn', withdrawnAt: Date.now() }, 'entry.withdraw', t('withdrawn')).then(() => { sh.close(); }).catch(() => {}) }, t('withdrawFor')),
      h('button', { class: 'btn block', type: 'button', style: 'color:var(--red)', onclick: async () => { try { await backend.entries.remove(s.id, e.uid); await audit('entry.delete', s, { targetName: `MCSM${s.no}: ${fullName(p)}` }); sh.close(); toast(t('deleted')); } catch (x) { err.replaceChildren(formError(t(errorKey(x)))); } } }, icon('trash'), t('deleteEntry')))) });
}

export function addDriverSheet(st, reload) {
  const s = st.season;
  const list = h('div', { class: 'stack', style: 'gap:8px;margin-top:12px' });
  const input = h('input', { class: 'input', type: 'search', placeholder: t('searchDrivers'), autocomplete: 'off' });
  let all = [];
  const taken = new Set(st.entries.filter((e) => e.status !== 'withdrawn').map((e) => e.uid));
  const draw = () => {
    const q = input.value.trim().toLowerCase();
    const items = all.filter((u) => isComplete(u) && !taken.has(u.uid) && (!q || [fullName(u), u.psn, u.raceNumber].join(' ').toLowerCase().includes(q))).slice(0, 30);
    list.replaceChildren(...(items.length ? items.map((u) => h('button', { class: 'row-card', type: 'button', onclick: async () => {
      try {
        const now = Date.now();
        await backend.entries.save(s.id, u.uid, { uid: u.uid, type: 'driver', status: 'entered', order: now, approved: true, seeded: false, snapshot: snapshotOf(u), availability: [], absences: [], note: '', createdAt: now });
        await audit('entry.add', s, { targetName: `MCSM${s.no}: ${fullName(u)}` });
        sh.close(); toast(t('driverAdded', { name: fullName(u) }));
      } catch (e) { toast(t(errorKey(e)), 'alert'); }
    } }, avatar(u, st.tmap[u.teamId]), h('span', { class: 'nm' }, h('b', null, fullName(u)), h('span', null, '#' + u.raceNumber + '  ' + u.psn)), icon('plus'))) : [empty(t('noMatches'))]));
  };
  input.addEventListener('input', draw);
  const sh = openSheet({ title: t('addDriver'), onClose: reload, body: frag(input, list) });
  loadUsers().then((us) => { all = us; draw(); });
}

export function exportCsv(st) {
  const s = st.season;
  const rows = [['#', t('csvStatus'), t('lastName'), t('firstName'), 'PSN ID', t('raceNumber'), 'DR', 'SR', t('mcsmTeam'), t('gtTeam'), t('seeded'), t('entryType'), t('csvAbsent')]];
  const add = (e, pos, status) => { const p = e.snapshot || {}; rows.push([pos, t('es_' + status), p.lastName, p.firstName, p.psn, p.raceNumber, p.dr, p.sr, (st.tmap[p.teamId] || {}).name || '', p.gtTeamId || '', e.seeded ? 'X' : '', t(e.type === 'reserve' ? 'asReserveShort' : 'asDriverShort'), (e.absences || []).join(' ')]); };
  st.table.inList.forEach((e, i) => add(e, i + 1, 'in'));
  st.table.waitlist.forEach((e, i) => add(e, 'V' + (i + 1), 'waitlist'));
  st.table.reserves.forEach((e) => add(e, 'T', e.approved === false ? 'pending' : 'reserve'));
  const csv = '\ufeff' + rows.map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n');
  const a = h('a', { href: URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })), download: `mcsm${s.no}-nevezesek.csv` });
  document.body.append(a); a.click(); a.remove();
  toast(t('csvDone'));
}
