// screens/admin/import.js
// Owner-only: bring the old site's data across. 1) pick the exported JSON files, 2) check the
// preview, 3) write the data, 4) create the sign-in accounts through the admin function.
// Safe to repeat: the same IDs are reused, and profiles already activated are left alone.
import { h, frag } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { busy, field } from '../../ui/controls.js';
import { pageTitle, backLink, formError, empty } from '../../ui/parts.js';
import { toast } from '../../ui/sheet.js';
import { t } from '../../i18n/index.js';
import { backend, errorKey } from '../../services/backend.js';
import { invalidate } from '../../core/data.js';
import { transformExport, planOps } from '../../model/import.js';

const KNOWN = ['profiles', 'cups', 'races', 'race_results', 'cup_applications'];
const kindOf = (name) => { const n = name.toLowerCase(); if (n.includes('profile')) return 'profiles'; return KNOWN.find((k) => n.startsWith(k)) || null; };

export function screenImport() {
  const files = {};
  let plan = null;
  const list = h('div', { class: 'stack', style: 'gap:6px' });
  const preview = h('div');
  const err = h('div');
  const input = h('input', { type: 'file', accept: '.json,application/json', multiple: true, style: 'display:none' });
  const pick = h('button', { class: 'btn', type: 'button', onclick: () => input.click() }, icon('plus'), t('impPick'));
  const drawFiles = () => list.replaceChildren(...KNOWN.map((k) => h('div', { class: 'row-card' }, icon(files[k] ? 'check' : 'clock'), h('span', { class: 'nm' }, h('b', null, k + '.json'), h('span', null, files[k] ? t('impRows', { n: files[k].length }) : k === 'profiles' ? t('impNeedEmails') : t('impMissing'))))));
  input.addEventListener('change', async () => {
    err.replaceChildren();
    for (const f of input.files) {
      const k = kindOf(f.name);
      if (!k) continue;
      try { const j = JSON.parse(await f.text()); files[k] = Array.isArray(j) ? j : j.data || []; }
      catch { err.replaceChildren(formError(t('impBadFile', { name: f.name }))); }
    }
    input.value = ''; drawFiles(); build();
  });
  const stat = (n, k) => h('div', null, h('div', { class: 'v display num' }, n), h('div', { class: 'k' }, k));
  function build() {
    if (!files.profiles) { preview.replaceChildren(); return; }
    plan = transformExport(files);
    const warn = plan.warnings.reduce((a, w) => { a[w.key] = (a[w.key] || 0) + 1; return a; }, {});
    preview.replaceChildren(
      h('div', { class: 'stat-row panel', style: 'margin-top:14px;overflow:hidden' }, stat(plan.users.length, t('impDrivers')), stat(plan.seasons.length, t('seasons').toLowerCase()), stat(plan.entries.length, t('entries').toLowerCase())),
      h('div', { class: 'panel pad summary', style: 'margin-top:12px' }, h('dl', null,
        h('dt', null, t('impAccounts')), h('dd', null, t('impAccountsVal', { n: plan.authUsers.length, m: plan.noEmail.length }) + (plan.noEmail.length ? '\n' + plan.noEmail.join(', ') : '')),
        h('dt', null, t('impMerged')), h('dd', null, plan.merged.length ? plan.merged.map((m) => `${m.dropped} → ${m.kept}`).join('\n') : '–'),
        h('dt', null, t('teams')), h('dd', null, `${plan.teams.length} MCSM, ${plan.gtTeams.length} GT`),
        h('dt', null, t('seasons')), h('dd', null, plan.seasons.map((s) => `MCSM${s.data.no} – ${s.data.name}: ${s.data.rounds.map((r) => [r.track, r.layout].filter(Boolean).join(' ')).join(', ')}`).join('\n')),
        h('dt', null, t('impToFix')), h('dd', null, Object.keys(warn).length ? Object.entries(warn).map(([k, n]) => t(k, { n })).join('\n') : '–'))),
      h('p', { class: 'note' }, t('impResultsNote')));
  }
  // step 3: data
  const prog = h('div', { class: 'note' });
  const write = h('button', { class: 'btn primary', type: 'button', 'data-haptic': '' }, icon('check'), t('impWrite'));
  write.addEventListener('click', () => busy(write, async () => {
    if (!plan) { toast(t('impPickFirst'), 'alert'); return; }
    err.replaceChildren();
    try {
      const all = await backend.users.list();
      const claimed = new Set(all.filter((u) => u.claimedAt).map((u) => u.uid));
      const ops = planOps(plan, { claimed });
      await backend.admin.writeMany(ops, (n, total) => { prog.textContent = t('impProgress', { n, total }); });
      await backend.audit.add({ action: 'import.data', target: 'import', targetName: t('impTitle'), before: null, after: { docs: ops.length, skipped: claimed.size }, reason: null });
      invalidate(); prog.textContent = t('impWritten', { n: ops.length, s: claimed.size }); toast(t('impWrittenShort'));
    } catch (e) { err.replaceChildren(formError(t(errorKey(e)))); }
  }));
  // step 4: accounts
  const accRes = h('div');
  const accounts = h('button', { class: 'btn primary', type: 'button', 'data-haptic': '' }, icon('users'), t('impAccountsBtn'));
  accounts.addEventListener('click', () => busy(accounts, async () => {
    if (!plan) { toast(t('impPickFirst'), 'alert'); return; }
    try {
      const r = await backend.admin.call('importUsers', { users: plan.authUsers });
      accRes.replaceChildren(h('div', { class: r.failureCount ? 'callout warn' : 'callout', style: 'display:block' }, h('b', null, t('impAccountsDone', { n: r.successCount, f: r.failureCount })),
        r.errors && r.errors.length ? h('div', { style: 'font-size:13px;margin-top:6px;white-space:pre-line' }, r.errors.slice(0, 20).map((e) => `${(plan.authUsers[e.index] || {}).displayName || e.uid}: ${e.message}`).join('\n')) : null));
      toast(t('impAccountsDoneShort'));
    } catch (e) { accRes.replaceChildren(formError(t(errorKey(e)))); }
  }));
  // function address
  const urlIn = h('input', { class: 'input', type: 'url', placeholder: 'https://mcsm-admin-….run.app' });
  backend.admin.functionsConfig().then((c) => { if (c && c.url && !String(c.url).startsWith('fake:')) urlIn.value = c.url; });
  const saveUrl = h('button', { class: 'btn small', type: 'button' }, t('save'));
  saveUrl.addEventListener('click', () => busy(saveUrl, async () => { try { await backend.config.save('functions', { url: urlIn.value.trim() }); toast(t('saved')); } catch (e) { toast(t(errorKey(e)), 'alert'); } }));
  const ping = h('button', { class: 'btn small', type: 'button' }, icon('bolt'), t('gsTest'));
  ping.addEventListener('click', () => busy(ping, async () => { try { await backend.admin.call('ping', {}); toast(t('fnOk')); } catch (e) { toast(t(errorKey(e)), 'alert'); } }));
  drawFiles();
  return frag(backLink(t('admin'), '#/admin'), pageTitle(t('impTitle'), t('impSub')), err,
    h('section', { class: 'panel pad stack', style: 'gap:12px' }, h('h2', { class: 'display', style: 'font-size:24px' }, t('impStep1')), h('p', { class: 'note', style: 'margin:0' }, t('impStep1Help')), list, h('div', null, pick, input), preview),
    h('section', { class: 'panel pad stack', style: 'gap:12px;margin-top:14px' }, h('h2', { class: 'display', style: 'font-size:24px' }, t('impStep2')), h('p', { class: 'note', style: 'margin:0' }, t('impStep2Help')), h('div', null, write), prog),
    h('section', { class: 'panel pad stack', style: 'gap:12px;margin-top:14px' }, h('h2', { class: 'display', style: 'font-size:24px' }, t('impStep3')), h('p', { class: 'note', style: 'margin:0' }, t('impStep3Help')),
      field(t('fnUrl'), urlIn, { hint: t('fnUrlHint') }).row, h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, saveUrl, ping), h('div', null, accounts), accRes),
    h('section', { class: 'panel pad', style: 'margin-top:14px' }, h('h2', { class: 'display', style: 'font-size:24px' }, t('impStep4')), h('p', { class: 'muted', style: 'margin:6px 0 0' }, t('impStep4Help'))));
}
