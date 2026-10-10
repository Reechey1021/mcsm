// screens/admin/gt7.js
// GT7 data from GT GridStats: save the token, test the connection, import the car list,
// and refresh every driver's DR/SR. Runs in the admin's browser, paced to the API's limits.
import { h, frag } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { field, passwordInput, busy } from '../../ui/controls.js';
import { pageTitle, backLink, formError, skelRows } from '../../ui/parts.js';
import { toast } from '../../ui/sheet.js';
import { t, fmtDate } from '../../i18n/index.js';
import { backend, errorKey } from '../../services/backend.js';
import { users as loadUsers, invalidate } from '../../core/data.js';
import { isComplete, fullName } from '../../model/profile.js';
import { gridstatsClient, fakeGridstats, PACE_MS } from '../../services/gridstats.js';
import { fetchCatalog, fakeCatalog } from '../../services/gt7info.js';
import { onLeave } from '../../router.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const gsError = (e) => (e && e.code === 'permission-denied' ? t('permRulesHint') : t({ 'gs-blocked': 'gsBlocked', 'gs-auth': 'gsAuth', 'gs-quota': 'gsQuota', 'gs-notfound': 'gsNotFound', 'gs-http': 'gsHttp' }[e && e.code] || errorKey(e)));

export function screenGt7() {
  const root = h('div', null, skelRows(3, 120));
  let stop = false;
  onLeave(() => { stop = true; });
  Promise.all([backend.config.get('gridstats').catch((e) => ({ __error: e })), backend.content.get('cars').catch(() => null)]).then(([cfg0, carsDoc]) => {
    const loadErr = cfg0 && cfg0.__error ? cfg0.__error : null;
    const cfg = loadErr ? null : cfg0;
    const fake = backend.kind === 'fake';
    const client = () => (fake ? fakeGridstats() : gridstatsClient({ token: tokenIn.input.value.trim(), base: baseIn.value.trim() }));
    const tokenIn = passwordInput({ autocomplete: 'off', value: (cfg && cfg.token) || '' });
    const tokenF = field(t('gsToken'), tokenIn, { hint: t('gsTokenHint') });
    const baseIn = h('input', { class: 'input', value: (cfg && cfg.base) || 'https://gt-gridstats.com/api' });
    const status = h('div');
    if (loadErr) status.replaceChildren(formError(gsError(loadErr)));
    const saveCfg = async (quiet) => { try { await backend.config.save('gridstats', { token: tokenIn.input.value.trim(), base: baseIn.value.trim() }); if (!quiet) toast(t('gsTokenSaved')); return true; } catch (e) { status.replaceChildren(formError(gsError(e))); return false; } };
    tokenIn.input.addEventListener('change', () => saveCfg(false));
    baseIn.addEventListener('change', () => saveCfg(true));
    const save = h('button', { class: 'btn', type: 'button' }, icon('check'), t('save'));
    save.addEventListener('click', () => busy(save, async () => {
      await saveCfg(false);
    }));
    const test = h('button', { class: 'btn primary', type: 'button', 'data-haptic': '' }, icon('bolt'), t('gsTest'));
    test.addEventListener('click', () => busy(test, async () => {
      if (!fake && !tokenIn.input.value.trim()) { tokenF.setError(t('errRequired')); return; }
      try { await client().ping(); if (!fake) await saveCfg(true); status.replaceChildren(h('div', { class: 'callout' }, icon('check'), h('span', null, t('gsOk')))); }
      catch (e) { status.replaceChildren(formError(gsError(e))); }
    }));
    // progress helper
    const progress = () => {
      const bar = h('i', { style: 'width:0%' });
      const log = h('div', { class: 'sync-log', style: 'display:none' });
      const el = h('div', { class: 'stack', style: 'gap:8px' }, h('div', { class: 'kerb' }, bar), log);
      return { el, set: (p) => { bar.style.width = Math.round(p * 100) + '%'; }, line: (s) => { log.style.display = ''; log.textContent += s + '\n'; log.scrollTop = log.scrollHeight; } };
    };
    // cars
    const carsInfo = h('p', { class: 'muted', style: 'margin:0' }, carsDoc && carsDoc.cars ? t('gsCarsHave', { n: carsDoc.cars.length, date: fmtDate(carsDoc.updatedAt) }) : t('gsCarsNone'));
    const carsProg = h('div');
    const carsBtn = h('button', { class: 'btn primary', type: 'button', 'data-haptic': '' }, icon('car'), t('gsCarsImport'));
    carsBtn.addEventListener('click', () => busy(carsBtn, async () => {
      carsProg.replaceChildren();
      let all;
      try { all = fake ? await fakeCatalog() : await fetchCatalog(); }
      catch { carsProg.replaceChildren(formError(t('carsFetchFailed'))); toast(t('carsFetchFailed'), 'alert'); return; }
      try {
        const classed = all.filter((c) => c.cls).length;
        await backend.content.save('cars', { cars: all, count: all.length, source: 'GT7 Info' });
        await backend.audit.add({ action: 'gt7.cars', target: 'cars', targetName: t('gsCarsTitle'), before: null, after: { count: all.length }, reason: null });
        invalidate('cars');
        carsInfo.textContent = t('gsCarsHave', { n: all.length, date: fmtDate(Date.now()) });
        carsProg.replaceChildren(h('div', { class: 'callout' }, icon('check'), h('span', null, t('carsImported', { n: all.length, c: classed }))));
        toast(t('gsCarsDone', { n: all.length }));
      } catch (e) { carsProg.replaceChildren(formError(gsError(e))); toast(gsError(e), 'alert'); }
    }));
    // tracks (GridStats): photo, map, length, corners
    const trackInfo = h('p', { class: 'muted', style: 'margin:0' }, t('tracksNone'));
    backend.content.get('tracks').then((d) => { if (d && d.tracks) trackInfo.textContent = t('tracksHave', { n: d.tracks.length, date: fmtDate(d.updatedAt) }); }).catch(() => {});
    const trackProg = h('div');
    const trackBtn = h('button', { class: 'btn primary', type: 'button', 'data-haptic': '' }, icon('flag'), t('tracksImport'));
    trackBtn.addEventListener('click', () => busy(trackBtn, async () => {
      const api = client(); const all = [];
      try {
        for (let page = 1; page < 40; page++) {
          const res = await api.tracksPage(page);
          const rows = Array.isArray(res) ? res : res.data || [];
          const abs = (u) => (!u ? null : /^https?:|^data:/.test(u) ? u : 'https://gt-gridstats.com' + (u.startsWith('/') ? '' : '/') + u);
          rows.forEach((x) => all.push({ id: x.id, name_short: x.name_short || x.name || '', full_name: x.full_name || x.name_short || x.name || '', trackphoto: abs(x.trackphoto || x.track_photo || x.trackPhoto || x.photo || x.image), track_map: abs(x.track_map || x.trackmap || x.trackMap || x.map), corner_count: x.corner_count ?? x.corners ?? null, track_length: x.track_length ?? x.length ?? null, elevation: x.elevation ?? null, longest_straight: x.longest_straight ?? null }));
          if (Array.isArray(res) || !res.next_page_url || !rows.length) break;
          if (!fake) await sleep(PACE_MS);
        }
        if (!all.length) throw Object.assign(new Error('empty'), { code: 'gs-notfound' });
        await backend.content.save('tracks', { tracks: all, count: all.length, source: 'GT GridStats' });
        invalidate('tracks'); trackInfo.textContent = t('tracksHave', { n: all.length, date: fmtDate(Date.now()) });
        const withPhoto = all.filter((x) => x.trackphoto), withMap = all.filter((x) => x.track_map);
        const sample = withPhoto[0];
        trackProg.replaceChildren(h('div', { class: 'callout', style: 'display:block' }, h('b', { style: 'display:block' }, t('tracksDone', { n: all.length })), t('tracksDiag', { p: withPhoto.length, m: withMap.length })),
          sample ? h('div', { class: 'track-sample', vars: { 'background-image': `url("${sample.trackphoto.replace(/"/g, '')}")` } }, sample.track_map ? h('img', { class: 'trk-map', src: sample.track_map, alt: '' }) : null, h('span', null, sample.full_name)) : null);
      } catch (e) { trackProg.replaceChildren(formError(gsError(e))); }
    }));
    // ratings
    const rateProg = h('div');
    const rateBtn = h('button', { class: 'btn primary', type: 'button', 'data-haptic': '' }, icon('refresh'), t('gsRatingsSync'));
    rateBtn.addEventListener('click', () => busy(rateBtn, async () => {
      stop = false;
      const pr = progress(); rateProg.replaceChildren(pr.el);
      const api = client();
      invalidate('users');
      const drivers = (await loadUsers()).filter((u) => isComplete(u) && u.psn);
      const byPsn = Object.fromEntries(drivers.map((u) => [u.psn.toLowerCase(), u]));
      const batches = []; for (let i = 0; i < drivers.length; i += 16) batches.push(drivers.slice(i, i + 16));
      let updated = 0; const missing = [];
      try {
        for (let b = 0; b < batches.length; b++) {
          if (stop) { pr.line(t('gsStopped')); break; }
          const res = await api.racers(batches[b].map((u) => u.psn));
          for (const d of res.drivers || []) {
            const u = byPsn[String(d.PSN_ID || '').toLowerCase()]; if (!u) continue;
            const st = d.stats || {};
            const patch = { dr: d.DR || u.dr, sr: d.SR || u.sr, drPoints: st.dr_points ?? null, gtStats: { races: st.total_races ?? null, wins: st.victories ?? null, clean: st.clean_races ?? null, country: d.country_code || null }, ratingsSyncedAt: Date.now() };
            await backend.users.save(u.uid, patch); updated++;
          }
          (res.not_found || []).forEach((p) => missing.push(p));
          pr.set((b + 1) / batches.length); pr.line(t('gsBatch', { b: b + 1, total: batches.length, n: updated }));
          if (b < batches.length - 1 && !fake) await sleep(PACE_MS);
        }
        if (missing.length) pr.line(t('gsMissing', { list: missing.join(', ') }));
        await backend.audit.add({ action: 'gt7.ratings', target: 'users', targetName: 'DR/SR', before: null, after: { updated, missing: missing.length }, reason: null });
        invalidate('users'); toast(t('gsRatingsDone', { n: updated }));
      } catch (e) { pr.line(gsError(e)); toast(gsError(e), 'alert'); }
    }));
    const stopBtn = h('button', { class: 'btn small', type: 'button', onclick: () => { stop = true; } }, t('stop'));
    root.replaceChildren(
      fake ? h('div', { class: 'callout', style: 'margin-bottom:14px' }, icon('info'), h('span', null, t('gsFakeNote'))) : null,
      h('section', { class: 'panel pad stack', style: 'gap:12px' }, h('h2', { class: 'display', style: 'font-size:24px' }, t('gsCarsTitle')), carsInfo, h('p', { class: 'note', style: 'margin:0' }, t('gsCarsHelp'), ' ', h('a', { href: 'https://ddm999.github.io/gt7info/', target: '_blank', rel: 'noopener', style: 'color:var(--accent-text);font-weight:650' }, 'GT7 Info')), h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, carsBtn), carsProg),
      h('section', { class: 'panel pad stack', style: 'gap:12px;margin-top:14px' }, h('h2', { class: 'display', style: 'font-size:24px' }, t('gsConnection')), tokenF.row,
        h('details', null, h('summary', { style: 'cursor:pointer;font-weight:650;font-size:14px;color:var(--ink-2)' }, t('gsAdvanced')), h('div', { style: 'margin-top:10px' }, field(t('gsBase'), baseIn).row)),
        h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, test, save), status),
      h('section', { class: 'panel pad stack', style: 'gap:12px;margin-top:14px' }, h('h2', { class: 'display', style: 'font-size:24px' }, t('tracksTitle')), trackInfo, h('p', { class: 'note', style: 'margin:0' }, t('tracksHelp')), h('div', null, trackBtn), trackProg),
      h('section', { class: 'panel pad stack', style: 'gap:12px;margin-top:14px' }, h('h2', { class: 'display', style: 'font-size:24px' }, t('gsRatingsTitle')), h('p', { class: 'note', style: 'margin:0' }, t('gsRatingsHelp')), h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, rateBtn, stopBtn), rateProg));
  }).catch(() => root.replaceChildren(formError(t('loadFailed'))));
  return frag(backLink(t('admin'), '#/admin'), pageTitle(t('gsTitle'), t('gsSub')), root);
}
