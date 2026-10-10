// screens/admin/merge.js
// Owner tool: one person, several accounts (e.g. signed up fresh instead of activating, or an
// old-site account next to a new one). Finds everything that belongs to a PSN ID and moves it
// onto one account: profile details, the PSN lock, entries, PQ times, lobbies, results,
// penalties and protests. Writes go through the admin function (admin rights).
import { h, frag } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { busy, field } from '../../ui/controls.js';
import { pageTitle, backLink, formError, empty } from '../../ui/parts.js';
import { toast } from '../../ui/sheet.js';
import { t } from '../../i18n/index.js';
import { backend, errorKey } from '../../services/backend.js';
import { session } from '../../services/session.js';
import { invalidate } from '../../core/data.js';
import { fullName, isComplete, SELF_KEYS } from '../../model/profile.js';

const swap = (v, from, to) => (v === from ? to : v);
const swapArr = (a, from, to) => [...new Set((a || []).map((x) => swap(x, from, to)))];

async function findRefs(psnLower) {
  const [us, lock, seasons] = await Promise.all([backend.users.list(), backend.users.lockOwner(psnLower), backend.seasons.list({ all: true })]);
  const found = {};
  const add = (uid, what) => { if (!uid) return; (found[uid] = found[uid] || { uid, what: new Set(), entries: [] }).what.add(what); };
  us.filter((u) => u.psnLower === psnLower).forEach((u) => add(u.uid, 'profile'));
  add(lock, 'lock');
  for (const s of seasons) {
    const es = await backend.entries.list(s.id);
    es.filter((e) => e.snapshot && e.snapshot.psnLower === psnLower).forEach((e) => { add(e.uid, 'entries'); found[e.uid].entries.push({ sid: s.id, e }); });
  }
  const byUid = Object.fromEntries(us.map((u) => [u.uid, u]));
  return { found: Object.values(found), byUid, seasons };
}

async function merge(from, to, psnLower, ctx, log) {
  const ops = [];
  const src = ctx.byUid[from] || null, dst = ctx.byUid[to] || {};
  // profile: fill the target's gaps from the source profile, or from the newest entry snapshot
  const snap = (ctx.found.find((f) => f.uid === from) || { entries: [] }).entries.map((x) => x.e.snapshot).pop() || {};
  const base = src || snap;
  const fill = {};
  [...SELF_KEYS, 'drPoints', 'gtStats', 'gt7Guid', 'gt7Nick', 'gt7Avatar', 'gt7Cover', 'ratingsSyncedAt', 'legacyId', 'imported'].forEach((k) => { if ((dst[k] == null || dst[k] === '') && base[k] != null) fill[k] = base[k]; });
  if (src && src.roles) { const roles = { ...(dst.roles || {}) }; Object.entries(src.roles).forEach(([k, v]) => { if (v === true) roles[k] = true; }); fill.roles = roles; }
  fill.psnLower = psnLower; if (!dst.psn && base.psn) fill.psn = base.psn;
  fill.complete = isComplete({ ...dst, ...fill });
  ops.push({ path: ['users', to], data: fill, merge: true });
  ops.push({ path: ['psnIds', psnLower], data: { uid: to } });
  // season data
  for (const s of ctx.seasons) {
    const sid = s.id;
    const [entries, pqs, rounds, sheets, pens, protests] = await Promise.all([backend.entries.list(sid), backend.race.pqList(sid), backend.race.roundsList(sid, { staff: true }), backend.race.sheetsList(sid, { staff: true }), backend.penalties.list(sid), backend.protests.list(sid, { judge: true })]);
    const mine = entries.find((e) => e.uid === from);
    if (mine && !entries.find((e) => e.uid === to)) ops.push({ path: ['seasons', sid, 'entries', to], data: { ...mine, uid: to } });
    pqs.filter((d) => d.times && from in d.times).forEach((d) => { const times = { ...d.times }; if (!(to in times)) times[to] = times[from]; delete times[from]; ops.push({ path: ['seasons', sid, 'pq', d.id], data: { ...d, times } }); });
    rounds.forEach((r) => {
      const inLobby = r.lobbies && Object.values(r.lobbies).some((a) => (a || []).includes(from));
      const inLegacy = r.legacy && r.legacy.rows && r.legacy.rows.some((x) => x.id === from);
      if (!inLobby && !inLegacy) return;
      const next = { ...r, lobbies: Object.fromEntries(Object.entries(r.lobbies || {}).map(([L, a]) => [L, swapArr(a, from, to)])) };
      if (inLegacy) next.legacy = { ...r.legacy, rows: r.legacy.rows.map((x) => ({ ...x, id: swap(x.id, from, to) })) };
      ops.push({ path: ['seasons', sid, 'rounds', String(r.n)], data: next });
    });
    sheets.filter((x) => (x.rows || []).some((r) => r.id === from)).forEach((x) => ops.push({ path: ['seasons', sid, 'sheets', x.id], data: { ...x, rows: x.rows.map((r) => ({ ...r, id: swap(r.id, from, to) })) } }));
    pens.filter((p) => p.uid === from).forEach((p) => ops.push({ path: ['seasons', sid, 'penalties', p.id], data: { ...p, uid: to } }));
    protests.filter((p) => p.by === from || (p.involved || []).includes(from) || (p.panel || []).includes(from)).forEach((p) => ops.push({ path: ['seasons', sid, 'protests', p.id], data: { ...p, by: swap(p.by, from, to), involved: swapArr(p.involved, from, to), panel: swapArr(p.panel, from, to) } }));
    ctx.cleanup.push(...(mine ? [() => backend.entries.remove(sid, from)] : []));
  }
  log(t('mergeWriting', { n: ops.length }));
  for (let i = 0; i < ops.length; i += 150) await backend.admin.call('importData', { ops: ops.slice(i, i + 150) });
  for (const f of ctx.cleanup.splice(0)) await f().catch(() => {});
  if (src && from !== to) await backend.users.remove(from).catch(() => {});
}

export function screenMerge() {
  const psnIn = h('input', { class: 'input', autocapitalize: 'off', spellcheck: 'false', placeholder: 'IGTSH_Reechey-' });
  const out = h('div', { class: 'stack', style: 'gap:10px' });
  const find = h('button', { class: 'btn primary', type: 'button' }, icon('search'), t('mergeFind'));
  find.addEventListener('click', () => busy(find, async () => {
    const q = psnIn.value.trim().toLowerCase(); if (!q) return;
    try {
      const ctx = await findRefs(q); ctx.cleanup = [];
      const me = session.user.uid;
      if (!ctx.found.some((f) => f.uid === me)) ctx.found.push({ uid: me, what: new Set(), entries: [] });
      let target = me;
      const rows = ctx.found.map((f) => {
        const u = ctx.byUid[f.uid];
        const r = h('label', { class: 'row-card', style: 'cursor:pointer' }, h('input', { type: 'radio', name: 'mt', checked: f.uid === me, onchange: () => { target = f.uid; } }),
          h('span', { class: 'nm' }, h('b', null, (u && fullName(u)) || t('mergeNoProfile')), h('span', null, `${f.uid}${f.uid === me ? '  ·  ' + t('mergeYou') : ''}`),
            h('span', null, [f.what.has('profile') ? (u && isComplete(u) ? t('mergeProfileOk') : t('mergeProfileBad')) : null, f.what.has('lock') ? t('mergeLock') : null, f.entries.length ? t('mergeEntries', { n: f.entries.length }) : null].filter(Boolean).join(' · '))));
        return r;
      });
      const go = h('button', { class: 'btn primary block', type: 'button', 'data-haptic': '' }, icon('check'), t('mergeGo'));
      const log = h('p', { class: 'note' });
      go.addEventListener('click', () => busy(go, async () => {
        try {
          for (const f of ctx.found) if (f.uid !== target && (f.what.size || f.entries.length)) await merge(f.uid, target, q, ctx, (m) => { log.textContent = m; });
          invalidate(); log.textContent = ''; out.replaceChildren(h('div', { class: 'callout' }, icon('check'), h('span', null, t('mergeDone')))); toast(t('mergeDone'));
        } catch (e) { log.replaceChildren(formError(t(errorKey(e)) + (e.message ? ` (${e.message})` : ''))); }
      }));
      out.replaceChildren(h('p', { class: 'muted', style: 'margin:0' }, t('mergePick')), ...rows, go, log);
    } catch (e) { out.replaceChildren(formError(t(errorKey(e)) + (e.message ? ` (${e.message})` : ''))); }
  }));
  return frag(backLink(t('admin'), '#/admin'), pageTitle(t('mergeTitle'), t('mergeSub')),
    h('section', { class: 'panel pad stack', style: 'gap:12px' }, field(t('psnId'), psnIn).row, h('div', null, find), out));
}
