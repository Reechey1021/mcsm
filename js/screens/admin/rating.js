// screens/admin/rating.js
// MCSM Rating v3.2 admin: import the historical bootstrap (the V3.2 latent JSON, once), check how its
// PSN IDs match accounts (fix any by hand; unmatched ones are kept for when that driver signs up),
// then recalculate and publish. The bootstrap stays in an admin-only record.
import { h, frag } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { busy } from '../../ui/controls.js';
import { pageTitle, backLink, skelRows, formError } from '../../ui/parts.js';
import { toast } from '../../ui/sheet.js';
import { t, fmtDate } from '../../i18n/index.js';
import { users as loadUsers } from '../../core/data.js';
import { fullName } from '../../model/profile.js';
import { loadBootstrap, saveBootstrap, matchBootstrap, computeAndPublish } from '../../services/mcsm-rating.js';
import { explainRating } from '../../ui/mcsm-rating.js';
import { errorKey } from '../../services/backend.js';

export function screenRatingAdmin() {
  const root = h('div', null, skelRows(6, 60));
  let boot = null, us = [];
  const draw = () => {
    const status = h('section', { class: 'panel pad stack', style: 'gap:8px' },
      h('div', { class: 'row-between' }, h('h2', { class: 'display', style: 'font-size:24px;margin:0' }, t('mrStatus')), h('button', { class: 'linkish', type: 'button', onclick: explainRating }, icon('info'), t('mrHow'))),
      h('p', { class: 'muted', style: 'margin:0' }, boot ? t('mrBootLoaded', { n: boot.entries.length, date: fmtDate(boot.importedAt) }) : t('mrBootMissing')),
      boot && boot.lastRun ? h('p', { class: 'note', style: 'margin:0' }, t('mrLastRun3', { date: fmtDate(boot.lastRun.at, true), r: boot.lastRun.rounds, e: boot.lastRun.established })) : null);
    const run = h('button', { class: 'btn primary', type: 'button', disabled: !boot, 'data-haptic': '' }, icon('refresh'), t('mrRun'));
    const runOut = h('div');
    run.addEventListener('click', () => busy(run, async () => {
      try { const r = await computeAndPublish(); boot = await loadBootstrap(); draw(); toast(t('mrRunDone', { r: r.rounds, e: r.established })); }
      catch (e) { runOut.replaceChildren(formError(t(errorKey(e)) + (e.message ? ` (${e.message})` : ''))); }
    }));
    // import
    const input = h('input', { type: 'file', accept: '.json,application/json', style: 'display:none' });
    const pick = h('button', { class: 'btn', type: 'button', onclick: () => input.click() }, icon('plus'), t('mrBootPick'));
    const preview = h('div');
    input.addEventListener('change', async () => {
      const f = input.files[0]; input.value = ''; if (!f) return;
      try {
        const j = JSON.parse(await f.text());
        if (!Array.isArray(j.entries) || !j.entries[0] || j.entries[0].latent_q == null) throw new Error('format');
        const entries = j.entries.map((e) => ({ psn: e.psn_id, rounds: e.historical_rounds, status: e.status, q: e.latent_q, s: e.latent_sprint, g: e.latent_gp, overall: e.public_overall }));
        boot = { version: j.version || 'V3.2', entries, map: (boot && boot.map) || {}, importedAt: Date.now() };
        draw(); toast(t('mrBootReady', { n: entries.length }), 'info');
      } catch { preview.replaceChildren(formError(t('mrBootBad'))); }
    });
    // matching review
    const matchBox = h('div');
    if (boot) {
      const rows = matchBootstrap(boot.entries, us, boot.map || {});
      const matched = rows.filter((r) => r.uid).length;
      const people = us.slice().sort((a, b) => fullName(a).localeCompare(fullName(b), 'hu'));
      const list = rows.slice().sort((a, b) => (a.uid ? 1 : 0) - (b.uid ? 1 : 0) || b.overall - a.overall).map((r) => {
        const sel = h('select', { class: 'select' }, h('option', { value: '' }, t('mrNoAccount')), ...people.map((u) => h('option', { value: u.uid, selected: r.uid === u.uid }, `${fullName(u)} (${u.psn})`)));
        sel.addEventListener('change', () => { boot.map = { ...(boot.map || {}), [r.key]: sel.value || null }; save.disabled = false; });
        return h('div', { class: 'ai-row ' + (r.uid ? 'ok' : 'check') }, h('b', { class: 'display num ai-pos', style: 'font-size:15px' }, (r.overall ?? 0).toFixed(1)),
          h('div', { class: 'ai-read' }, h('span', { class: 'ai-name' }, r.psn), h('small', null, `${r.rounds} ${t('mrRoundsDone')} · ${r.status === 'established' ? t('mrEstablished') : t('mrUnranked')}`)), sel);
      });
      const save = h('button', { class: 'btn primary', type: 'button' }, icon('check'), t('mrBootSave'));
      save.addEventListener('click', () => busy(save, async () => { try { await saveBootstrap(boot); toast(t('saved')); save.disabled = true; } catch (e) { toast(t(errorKey(e)), 'alert'); } }));
      matchBox.replaceChildren(h('p', { class: 'note' }, t('mrBootMatch', { m: matched, n: rows.length })), h('div', { class: 'ai-rows' }, list), h('div', { style: 'margin-top:10px;position:sticky;bottom:12px' }, save));
    }
    root.replaceChildren(status, h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin:12px 0' }, run), runOut,
      h('section', { class: 'panel pad stack', style: 'gap:10px' }, h('h2', { class: 'display', style: 'font-size:24px;margin:0' }, t('mrBootTitle')), h('p', { class: 'note', style: 'margin:0' }, t('mrBootHint')), h('div', null, pick, input), preview, matchBox));
  };
  Promise.all([loadBootstrap(), loadUsers()]).then(([b, u]) => { boot = b; us = u.filter((x) => x.psn); draw(); }).catch((e) => root.replaceChildren(formError(t(errorKey(e)))));
  return frag(backLink(t('admin'), '#/admin'), pageTitle('MCSM Rating', t('mrAdminSub3')), root);
}
