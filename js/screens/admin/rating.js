// screens/admin/rating.js
// MCSM Rating admin: starting tiers for the founding drivers (hidden from everyone else),
// CSV import of tiers, the one-time calibration lock, and recompute + publish.
import { h, frag } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { busy, choice } from '../../ui/controls.js';
import { pageTitle, backLink, skelRows, formError, empty } from '../../ui/parts.js';
import { openSheet, toast } from '../../ui/sheet.js';
import { t, fmtDate } from '../../i18n/index.js';
import { users as loadUsers, invalidate } from '../../core/data.js';
import { fullName } from '../../model/profile.js';
import { loadSeeds, saveSeeds, seedsFrom, computeAndPublish } from '../../services/mcsm-rating.js';
import { TIERS } from '../../engine/rating.js';
import { explainRating } from '../../ui/mcsm-rating.js';
import { errorKey } from '../../services/backend.js';

const f1 = (v) => (v == null ? '–' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));

export function screenRatingAdmin() {
  const root = h('div', null, skelRows(6, 60));
  let doc = null, us = [], q = '';
  const draw = () => {
    const { mean } = seedsFrom(doc, us);
    const counts = Object.fromEntries([...TIERS, 'u'].map((k) => [k, 0]));
    us.forEach((u) => { const v = doc.tiers[u.uid]; counts[v || 'u']++; });
    const status = h('section', { class: 'panel pad stack', style: 'gap:10px' },
      h('div', { class: 'row-between' }, h('h2', { class: 'display', style: 'font-size:24px;margin:0' }, t('mrStatus')), h('button', { class: 'linkish', type: 'button', onclick: explainRating }, icon('info'), t('mrHow'))),
      h('p', { class: 'muted', style: 'margin:0' }, doc.locked ? t('mrLocked', { n: (doc.founders || []).length, date: fmtDate(doc.lockedAt) }) : t('mrNotLocked')),
      h('p', { class: 'note', style: 'margin:0' }, t('mrMean', { m: f1(mean) }) + '  ·  ' + [...TIERS].map((k) => `${k}: ${counts[k]}`).join(', ') + `, ${t('mrUnknown')}: ${counts.u}`),
      doc.lastRun ? h('p', { class: 'note', style: 'margin:0' }, t('mrLastRun', { date: fmtDate(doc.lastRun.at, true), r: doc.lastRun.rounds, e: doc.lastRun.established, avg: f1(doc.lastRun.average) })) : null);
    const run = h('button', { class: 'btn primary', type: 'button', 'data-haptic': '' }, icon('refresh'), t('mrRun'));
    const runOut = h('div');
    run.addEventListener('click', () => busy(run, async () => {
      try { const r = await computeAndPublish(); doc = await loadSeeds(); draw(); toast(t('mrRunDone', { r: r.rounds, e: r.established })); }
      catch (e) { runOut.replaceChildren(formError(t(errorKey(e)) + (e.message ? ` (${e.message})` : ''))); }
    }));
    const lock = doc.locked ? null : h('button', { class: 'btn', type: 'button' }, icon('lock'), t('mrLock'));
    if (lock) lock.addEventListener('click', () => {
      const yes = h('button', { class: 'btn primary block', type: 'button' }, icon('lock'), t('mrLockConfirm'));
      const sh = openSheet({ title: t('mrLock'), body: h('div', { class: 'stack', style: 'gap:12px' }, h('p', { class: 'muted', style: 'margin:0' }, t('mrLockText', { n: us.length, m: f1(mean) })), yes) });
      yes.addEventListener('click', () => busy(yes, async () => { doc = { ...doc, locked: true, lockedAt: Date.now(), founders: us.map((u) => u.uid), mean }; await saveSeeds(doc); sh.close(true); toast(t('saved')); draw(); }));
    });
    // tiers
    const rows = h('div', { class: 'stack', style: 'gap:6px' });
    const tierOpts = [{ value: '', label: '?' }, ...TIERS.slice().reverse().map((v) => ({ value: String(v), label: String(v) }))];
    const drawRows = () => {
      const s = q.trim().toLowerCase();
      const list = us.filter((u) => !s || [fullName(u), u.psn].join(' ').toLowerCase().includes(s));
      rows.replaceChildren(...(list.length ? list.map((u) => {
        const founder = !doc.locked || (doc.founders || []).includes(u.uid);
        return h('div', { class: 'row-card mr-row' }, h('span', { class: 'nm' }, h('b', null, fullName(u) || u.psn), h('span', null, u.psn || '')),
          founder ? choice(tierOpts, doc.tiers[u.uid] ? String(doc.tiers[u.uid]) : '', (v) => { if (doc.locked) { toast(t('mrLockedEdit'), 'alert'); return; } if (v) doc.tiers[u.uid] = Number(v); else delete doc.tiers[u.uid]; dirty(); }) : h('span', { class: 'faint' }, t('mrNewcomer')));
      }) : [empty(t('noMatches'))]));
    };
    const save = h('button', { class: 'btn primary', type: 'button', disabled: true }, icon('check'), t('save'));
    const dirty = () => { save.disabled = false; };
    save.addEventListener('click', () => busy(save, async () => { try { await saveSeeds(doc); save.disabled = true; toast(t('saved')); draw(); } catch (e) { toast(t(errorKey(e)), 'alert'); } }));
    const search = h('input', { class: 'input', type: 'search', placeholder: t('searchPeople'), value: q });
    search.addEventListener('input', () => { q = search.value; drawRows(); });
    // CSV
    const csv = h('textarea', { class: 'input script-box', placeholder: 'IGTSH_Saby;125\nMGTK_Baboca96;125\nACTA_Szabi;100' });
    const csvBtn = h('button', { class: 'btn small', type: 'button', disabled: !!doc.locked }, icon('list'), t('mrCsvApply'));
    const csvOut = h('p', { class: 'note' });
    csvBtn.addEventListener('click', () => {
      const byPsn = Object.fromEntries(us.map((u) => [String(u.psn || '').toLowerCase(), u]));
      let ok = 0; const miss = [];
      csv.value.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).forEach((line) => {
        const [psn, tier] = line.split(/[;,\t]/).map((x) => x.trim());
        const u = byPsn[(psn || '').toLowerCase()]; const v = Number(tier);
        if (!u || !(TIERS.includes(v) || /^(\?|unknown|ismeretlen)?$/i.test(tier || ''))) { miss.push(psn); return; }
        if (TIERS.includes(v)) doc.tiers[u.uid] = v; else delete doc.tiers[u.uid];
        ok++;
      });
      csvOut.textContent = t('mrCsvResult', { n: ok, m: miss.length }) + (miss.length ? ' ' + miss.slice(0, 20).join(', ') : '');
      drawRows(); if (ok) dirty();
    });
    drawRows();
    root.replaceChildren(status, h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin:12px 0' }, run, lock), runOut,
      h('section', { class: 'panel pad stack', style: 'gap:10px;margin-top:6px' }, h('h2', { class: 'display', style: 'font-size:24px;margin:0' }, t('mrSeeds')), h('p', { class: 'note', style: 'margin:0' }, t('mrSeedsHint')),
        search, rows, h('div', { style: 'position:sticky;bottom:calc(var(--tabbar-h, 0px) + 12px)' }, save)),
      h('section', { class: 'panel pad stack', style: 'gap:10px;margin-top:14px' }, h('h2', { class: 'display', style: 'font-size:24px;margin:0' }, t('mrCsv')), h('p', { class: 'note', style: 'margin:0' }, t('mrCsvHint')), csv, h('div', null, csvBtn), csvOut));
  };
  Promise.all([loadSeeds(), loadUsers()]).then(([d, u]) => { doc = { tiers: {}, conf: {}, ...d }; us = u.filter((x) => x.psn).sort((a, b) => fullName(a).localeCompare(fullName(b), 'hu')); draw(); }).catch((e) => root.replaceChildren(formError(t(errorKey(e)))));
  void invalidate;
  return frag(backLink(t('admin'), '#/admin'), pageTitle('MCSM Rating', t('mrAdminSub')), root);
}
