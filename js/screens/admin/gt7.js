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
import { profileScript, GT7_DEFAULT_AVATAR } from '../../data/gt7-images.js';
import { previewPictureImport, PICTURE_BATCH_LIMIT } from '../../model/gt7-picture-merge.js';
import { syncRatings, pickDrivers } from '../../services/ratings.js';
import { seg, toggle } from '../../ui/controls.js';
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
    const saveCfg = async (quiet) => { try { const prev = (await backend.config.get('gridstats')) || {}; await backend.config.save('gridstats', { ...prev, token: tokenIn.input.value.trim(), base: baseIn.value.trim() }); if (!quiet) toast(t('gsTokenSaved')); return true; } catch (e) { status.replaceChildren(formError(gsError(e))); return false; } };
    const save = h('button', { class: 'btn', type: 'button' }, icon('check'), t('save'));
    save.addEventListener('click', () => busy(save, async () => {
      await saveCfg(false);
    }));
    const test = h('button', { class: 'btn primary', type: 'button', 'data-haptic': '' }, icon('bolt'), t('gsTest'));
    test.addEventListener('click', () => busy(test, async () => {
      if (!fake && !tokenIn.input.value.trim()) { tokenF.setError(t('errRequired')); return; }
      try { await client().ping(); status.replaceChildren(h('div', { class: 'callout' }, icon('check'), h('span', null, t('gsOk')))); }
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
    // Bulk profile writes go through the admin function (admin rights), else directly.
    const writeUsers = async (ops) => { if (!ops.length) return; try { await backend.admin.call('importData', { ops }); } catch (e) { if (e.code === 'fn-missing') { for (const o of ops) await backend.users.save(o.path[1], o.data); } else throw e; } };
    // GT7 profile pictures: guided workflow; the external console script stays unchanged.
    // We never write fallback/empty images over a driver's existing pictures.
    const MAX_PICTURE_BATCH = PICTURE_BATCH_LIMIT;
    const GT7_LOGIN_URL = 'https://www.gran-turismo.com/gb/gt7/user/mymenu/';
    const picInfo = h('p', { class: 'muted', style: 'margin:0' });
    const picOut = h('div', { 'aria-live': 'polite' });
    const copyFallback = h('div');
    const paste = h('textarea', { class: 'input script-box', spellcheck: 'false', placeholder: '[{"guid":"…","avatar":"https://…","cover":"https://…"}]', 'aria-label': t('picsPasteLabel') });
    const picPreview = h('div', { 'aria-live': 'polite' });
    const picList = h('div', { class: 'gt7-picker-list' });
    const picCount = h('p', { class: 'note', style: 'margin:0' });
    const wizardStatus = h('div', { 'aria-live': 'polite' });
    const wizardRateProg = h('div');
    const wizardBody = h('div', { class: 'gt7-wizard-body' });
    const wizardSteps = h('div', { class: 'gt7-wizard-steps', 'aria-label': t('picsWizardProgress') });
    let withGuid = [], selectedGuids = new Set(), scriptGuids = new Set();
    let wizardStep = 1, selectionInitialised = false, lastScript = '';
    const picOnlyMissing = toggle(true, () => drawPictureList(), { label: t('picsOnlyMissing') });
    const picPsnFilter = h('input', { class: 'input', type: 'search', placeholder: t('picsPsnSearch'), autocapitalize: 'off', spellcheck: 'false' });
    picPsnFilter.addEventListener('input', () => drawPictureList());

    const refreshPics = async () => {
      invalidate('users');
      const us = await loadUsers();
      withGuid = us.filter((u) => isComplete(u) && u.gt7Guid && u.psn)
        .sort((a, b) => String(a.psn).localeCompare(String(b.psn), 'hu'));
      picInfo.textContent = t('picsInfo', { n: withGuid.length, a: us.filter((u) => u.gt7Avatar && u.gt7Avatar !== GT7_DEFAULT_AVATAR).length, all: us.filter(isComplete).length });
      const valid = new Set(withGuid.map((u) => String(u.gt7Guid)));
      selectedGuids = new Set([...selectedGuids].filter((guid) => valid.has(guid)));
      if (!selectionInitialised || (selectedGuids.size === 0 && wizardStep === 1)) {
        withGuid.filter((u) => !u.gt7Avatar || u.gt7Avatar === GT7_DEFAULT_AVATAR).slice(0, MAX_PICTURE_BATCH)
          .forEach((u) => selectedGuids.add(String(u.gt7Guid)));
        selectionInitialised = true;
      }
      return us;
    };
    refreshPics().catch(() => {});

    const visiblePictureDrivers = () => {
      const missingOnly = picOnlyMissing.getAttribute('aria-checked') === 'true';
      const q = picPsnFilter.value.trim().toLocaleLowerCase('hu');
      return withGuid.filter((u) => (!missingOnly || !u.gt7Avatar || u.gt7Avatar === GT7_DEFAULT_AVATAR)
        && (!q || String(u.psn).toLocaleLowerCase('hu').includes(q)));
    };
    function drawPictureList() {
      if (wizardStep !== 2) return;
      const visible = visiblePictureDrivers();
      picCount.textContent = t('picsSelectionCount', { n: selectedGuids.size, max: MAX_PICTURE_BATCH, total: visible.length });
      if (!visible.length) {
        picList.replaceChildren(h('p', { class: 'note' }, t(withGuid.length ? 'picsNoMatches' : 'picsNoGuid')));
        return;
      }
      picList.replaceChildren(...visible.map((u) => {
        const guid = String(u.gt7Guid);
        const cb = h('input', { type: 'checkbox', checked: selectedGuids.has(guid) ? true : null, 'aria-label': String(u.psn) });
        cb.addEventListener('change', () => {
          if (cb.checked && selectedGuids.size >= MAX_PICTURE_BATCH) {
            cb.checked = false; toast(t('picsSelectionLimit', { n: MAX_PICTURE_BATCH }), 'alert'); return;
          }
          if (cb.checked) selectedGuids.add(guid); else selectedGuids.delete(guid);
          picCount.textContent = t('picsSelectionCount', { n: selectedGuids.size, max: MAX_PICTURE_BATCH, total: visible.length });
        });
        return h('label', { class: 'gt7-picker-row' }, cb, h('span', { class: 'gt7-picker-name' }, h('b', null, u.psn), h('small', null, u.gt7Avatar && u.gt7Avatar !== GT7_DEFAULT_AVATAR ? t('picsAlreadyHasPhoto') : t('picsPhotoMissing'))));
      }));
    }
    const selectVisible = () => {
      for (const u of visiblePictureDrivers()) {
        if (selectedGuids.size >= MAX_PICTURE_BATCH) break;
        selectedGuids.add(String(u.gt7Guid));
      }
      drawPictureList();
    };
    const clearSelected = () => { selectedGuids.clear(); drawPictureList(); };

    // Preview and writes use one pure, tested validator (no destructive fallback).
    const picturePreview = (raw, us) => previewPictureImport(raw, us, scriptGuids);
    const saveBtn = h('button', { class: 'btn primary', type: 'button', disabled: true }, icon('check'), t('picsSave'));
    let lastPreview = null;
    const showPreview = () => {
      lastPreview = null;
      if (!paste.value.trim()) {
        picPreview.replaceChildren(h('p', { class: 'note' }, t('picsPasteHint')));
        saveBtn.disabled = true; return;
      }
      try {
        lastPreview = picturePreview(paste.value, withGuid);
        saveBtn.disabled = lastPreview.ops.length === 0;
        picPreview.replaceChildren(
          h('div', { class: 'callout' }, icon('info'), h('span', null, t('picsPreview', { n: lastPreview.ops.length, total: lastPreview.rows, missing: lastPreview.empty, unknown: lastPreview.unknown + lastPreview.duplicates + lastPreview.unchanged }))),
          lastPreview.ops.length ? null : h('p', { class: 'note' }, t('picsNoValidPhotos')));
      } catch {
        saveBtn.disabled = true;
        picPreview.replaceChildren(formError(t('picsBadJson')));
      }
    };
    paste.addEventListener('input', showPreview);
    saveBtn.addEventListener('click', () => busy(saveBtn, async () => {
      if (!lastPreview || !lastPreview.ops.length) { showPreview(); return; }
      // Re-read users before writing in case the GT7 GUID changed since copying.
      let fresh;
      try { fresh = await refreshPics(); }
      catch (e) { picOut.replaceChildren(formError(gsError(e))); return; }
      let checked;
      try { checked = picturePreview(paste.value, fresh); }
      catch { picOut.replaceChildren(formError(t('picsBadJson'))); return; }
      if (!checked.ops.length) { showPreview(); picOut.replaceChildren(formError(t('picsNoValidPhotos'))); return; }
      try {
        await writeUsers(checked.ops);
        invalidate('users'); selectionInitialised = false;
        selectedGuids.clear(); scriptGuids.clear(); lastScript = '';
        paste.value = '';
        await refreshPics();
        drawDiag().catch(() => {});
        picOut.replaceChildren(h('div', { class: 'callout' }, icon('check'), h('span', null, t('picsSavedSafely', { n: checked.ops.length, ignored: checked.rows - checked.ops.length }))));
        setWizardStep(2);
      } catch (e) { picOut.replaceChildren(formError(gsError(e) + (e.message ? ` (${e.message})` : ''))); }
    }));

    const copyBtn = h('button', { class: 'btn primary', type: 'button', 'data-haptic': '' }, icon('list'), t('picsCopyScript'));
    const manualCopiedBtn = h('button', { class: 'btn', type: 'button' }, icon('check'), t('picsCopiedManually'));
    manualCopiedBtn.addEventListener('click', () => { copyFallback.replaceChildren(); setWizardStep(3); });
    copyBtn.addEventListener('click', () => busy(copyBtn, async () => {
      const chosen = withGuid.filter((u) => selectedGuids.has(String(u.gt7Guid)));
      if (!chosen.length) { toast(t('picsPickOne'), 'alert'); return; }
      if (chosen.length > MAX_PICTURE_BATCH) { toast(t('picsSelectionLimit', { n: MAX_PICTURE_BATCH }), 'alert'); return; }
      lastScript = profileScript(chosen.map((u) => ({ guid: u.gt7Guid, psn: u.psn })));
      scriptGuids = new Set(chosen.map((u) => String(u.gt7Guid)));
      copyFallback.replaceChildren();
      try { await navigator.clipboard.writeText(lastScript); toast(t('picsCopied', { n: chosen.length })); setWizardStep(3); }
      catch {
        const box = h('textarea', { class: 'input script-box', readonly: true, 'aria-label': t('picsCopyManual') }, lastScript);
        copyFallback.replaceChildren(h('p', { class: 'note' }, t('picsCopyManual')), box, manualCopiedBtn);
        box.select();
      }
    }));
    const wizardRateBtn = h('button', { class: 'btn primary', type: 'button' }, icon('refresh'), t('gsRatingsSync'));
    wizardRateBtn.addEventListener('click', () => runRatings(wizardRateBtn, 'missing', wizardRateProg));

    function setWizardStep(n) {
      wizardStep = n;
      wizardSteps.replaceChildren(...[1, 2, 3, 4].map((i) => h('div', {
        class: 'gt7-wizard-dot' + (i === n ? ' active' : '') + (i < n ? ' done' : ''),
        'aria-current': i === n ? 'step' : null,
      }, h('span', null, i < n ? icon('check') : String(i)), h('small', null, t('picsWizardShort' + i)))));
      wizardStatus.replaceChildren();
      if (n === 1) {
        wizardBody.replaceChildren(
          h('h3', null, t('picsWizardTitle1')),
          h('p', { class: 'note', style: 'margin:0' }, t('picsWizardHelp1')),
          h('div', { class: 'gt7-wizard-actions' }, wizardRateBtn,
            h('button', { class: 'btn', type: 'button', onclick: async (e) => {
              const btn = e.currentTarget;
              btn.disabled = true;
              try {
                await refreshPics();
                if (!withGuid.length) { wizardStatus.replaceChildren(formError(t('picsNoGuid'))); return; }
                setWizardStep(2);
              } catch (err) { wizardStatus.replaceChildren(formError(gsError(err))); }
              finally { btn.disabled = false; }
            } }, t('picsAlreadySynced'))), wizardRateProg, wizardStatus);
      } else if (n === 2) {
        const selectAll = h('button', { class: 'btn small', type: 'button', onclick: selectVisible }, t('picsSelectVisible'));
        const selectNone = h('button', { class: 'btn small', type: 'button', onclick: clearSelected }, t('picsSelectNone'));
        wizardBody.replaceChildren(
          h('h3', null, t('picsWizardTitle2')),
          h('p', { class: 'note', style: 'margin:0' }, t('picsWizardHelp2', { n: MAX_PICTURE_BATCH })),
          picInfo,
          h('div', { class: 'toggle-row' }, h('span', null, t('picsOnlyMissing'), h('small', null, t('picsOnlyMissingHint'))), picOnlyMissing),
          picPsnFilter,
          h('div', { class: 'gt7-picker-toolbar' }, selectAll, selectNone), picCount, picList,
          copyFallback, picOut,
          h('div', { class: 'gt7-wizard-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => setWizardStep(1) }, t('back')), copyBtn));
        drawPictureList();
      } else if (n === 3) {
        wizardBody.replaceChildren(
          h('h3', null, t('picsWizardTitle3')),
          h('p', { class: 'note', style: 'margin:0' }, t('picsWizardHelp3')),
          h('a', { class: 'btn primary gt7-external-link', href: GT7_LOGIN_URL, target: '_blank', rel: 'noopener noreferrer' }, icon('link'), t('picsOpenGT7')),
          h('ol', { class: 'gt7-wizard-instructions' },
            h('li', null, t('picsConsoleLogin')),
            h('li', null, t('picsConsoleOpen'), ' ', h('kbd', null, 'F12'), ' / ', h('kbd', null, 'Ctrl + Shift + J')),
            h('li', null, t('picsConsolePaste'), ' ', h('kbd', null, 'Ctrl + V'), ' → ', h('kbd', null, 'Enter')),
            h('li', null, t('picsConsoleWait'))),
          h('p', { class: 'note', style: 'margin:0' }, t('picsConsoleFallback')),
          h('div', { class: 'gt7-wizard-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => setWizardStep(2) }, t('back')),
            copyBtn, h('button', { class: 'btn primary', type: 'button', onclick: () => setWizardStep(4) }, icon('check'), t('picsDoneConsole'))));
      } else {
        showPreview();
        wizardBody.replaceChildren(
          h('h3', null, t('picsWizardTitle4')),
          h('p', { class: 'note', style: 'margin:0' }, t('picsWizardHelp4')),
          paste, picPreview, picOut,
          h('div', { class: 'gt7-wizard-actions' }, h('button', { class: 'btn', type: 'button', onclick: () => setWizardStep(3) }, t('back')), saveBtn));
      }
    }
    setWizardStep(1);
    const pictureWizard = h('section', { class: 'panel pad stack gt7-picture-wizard', style: 'gap:15px;margin-top:14px' },
      h('div', { class: 'gt7-picture-heading' }, h('div', null,
        h('h2', { class: 'display', style: 'font-size:24px' }, t('picsTitle')),
        h('p', { class: 'note', style: 'margin:3px 0 0' }, t('picsWizardIntro')))), wizardSteps, wizardBody);
    // Diagnostics: who has no GT7 ID (GridStats couldn't find the PSN ID), who has no picture.
    const diagBox = h('div');
    const drawDiag = async () => {
      invalidate('users');
      const us = (await loadUsers()).filter(isComplete).sort((a, b) => fullName(a).localeCompare(fullName(b), 'hu'));
      const noId = us.filter((u) => !u.gt7Guid), noPic = us.filter((u) => u.gt7Guid && (!u.gt7Avatar || u.gt7Avatar === GT7_DEFAULT_AVATAR));
      const list = (arr, why) => h('div', { class: 'diag-list' }, arr.map((u) => h('a', { class: 'diag-row', href: '#/pilotak/' + encodeURIComponent(u.psnLower) }, h('b', null, u.psn), h('span', null, fullName(u)), h('small', null, why(u)))));
      diagBox.replaceChildren(
        h('details', { class: 'lobby-sec' }, h('summary', null, t('diagNoId', { n: noId.length }), icon('down', 'chev')), h('p', { class: 'note' }, t('diagNoIdHint')), list(noId, (u) => (u.psnSynced && u.psnSynced !== u.psnLower ? t('diagPsnChanged') : u.ratingsSyncedAt ? t('diagNotFound') : t('diagNeverSynced')))),
        h('details', { class: 'lobby-sec', style: 'margin-top:8px' }, h('summary', null, t('diagNoPic', { n: noPic.length }), icon('down', 'chev')), h('p', { class: 'note' }, t('diagNoPicHint')), list(noPic, () => '')));
    };
    drawDiag().catch(() => {});
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
    // DR/SR refresh shared by the compact card and the picture wizard. Both use
    // the same underlying GridStats sync; the wizard always fetches missing GUIDs.
    const rateProg = h('div');
    const rateBtn = h('button', { class: 'btn primary', type: 'button', 'data-haptic': '' }, icon('refresh'), t('gsRatingsSync'));
    let rateMode = 'missing';
    const rateSeg = seg([{ value: 'missing', label: t('rateMissing') }, { value: 'stale', label: t('rateStale') }, { value: 'all', label: t('rateAll') }], rateMode, (v) => { rateMode = v; }, { scroll: true });
    let ratingRun = false;
    const runRatings = (btn, mode, output) => busy(btn, async () => {
      if (ratingRun) { toast(t('picsRefreshRunning'), 'info'); return; }
      ratingRun = true;
      try {
        stop = false;
        const pr = progress(); output.replaceChildren(pr.el);
        invalidate('users');
        const drivers = pickDrivers(await loadUsers(), mode);
        if (!drivers.length) { pr.line(t('rateNone')); return; }
        const r = await syncRatings(drivers, client(), { fake, stop: () => stop, onBatch: (b, total, n) => { pr.set(b / total); pr.line(t('gsBatch', { b, total, n })); } });
        if (r.missing.length) pr.line(t('gsMissing', { list: r.missing.join(', ') }));
        await backend.audit.add({ action: 'gt7.ratings', target: 'users', targetName: 'DR/SR', before: null, after: { updated: r.updated, missing: r.missing.length }, reason: null });
        toast(t('gsRatingsDone', { n: r.updated }));
        await refreshPics();
        drawDiag().catch(() => {});
      } catch (e) {
        output.appendChild(formError(gsError(e) + (e.message ? ` (${e.message})` : '')));
        toast(gsError(e), 'alert');
      } finally { ratingRun = false; }
    });
    rateBtn.addEventListener('click', () => runRatings(rateBtn, rateMode, rateProg));
    const autoRow = h('div', { class: 'toggle-row' }, h('span', null, t('rateAuto'), h('small', null, cfg && cfg.lastAuto ? t('rateAutoLast', { date: fmtDate(cfg.lastAuto, true) }) : t('rateAutoHint'))),
      toggle(!cfg || cfg.autoDaily !== false, async (v) => { try { const cur = (await backend.config.get('gridstats')) || {}; await backend.config.save('gridstats', { ...cur, autoDaily: v }); toast(t('saved')); } catch (e) { toast(gsError(e), 'alert'); } }, { label: t('rateAuto') }));
    const stopBtn = h('button', { class: 'btn small', type: 'button', onclick: () => { stop = true; } }, t('stop'));
    const card = (title, ...children) => h('section', { class: 'panel pad stack gt7-action-card', style: 'gap:12px' },
      h('h2', { class: 'display', style: 'font-size:21px' }, title), ...children);
    root.replaceChildren(
      fake ? h('div', { class: 'callout', style: 'margin-bottom:14px' }, icon('info'), h('span', null, t('gsFakeNote'))) : null,
      h('section', { class: 'panel pad stack', style: 'gap:12px' }, h('h2', { class: 'display', style: 'font-size:24px' }, t('diagTitle')), diagBox),
      h('div', { class: 'gt7-admin-grid' },
        card(t('gsCarsTitle'), carsInfo,
          h('p', { class: 'note', style: 'margin:0' }, t('gsCarsHelp'), ' ', h('a', { href: 'https://ddm999.github.io/gt7info/', target: '_blank', rel: 'noopener noreferrer', style: 'color:var(--accent-text);font-weight:650' }, 'GT7 Info')),
          carsBtn, carsProg),
        card(t('tracksTitle'), trackInfo, h('p', { class: 'note', style: 'margin:0' }, t('tracksHelp')), trackBtn, trackProg),
        card(t('gsRatingsTitle'), h('p', { class: 'note', style: 'margin:0' }, t('gsRatingsHelp')),
          h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('rateWho')), rateSeg),
          h('div', { class: 'gt7-wizard-actions' }, rateBtn, stopBtn), rateProg, autoRow)),
      h('details', { class: 'lobby-sec gt7-token-settings', style: 'margin-top:14px' },
        h('summary', null, icon('lock'), h('span', null, t('gsConnection')), icon('down', 'chev')),
        h('div', { class: 'stack', style: 'gap:12px' },
          h('p', { class: 'note', style: 'margin:0' }, t('gsTokenSafeHint')),
          tokenF.row,
          h('details', null, h('summary', { style: 'cursor:pointer;font-weight:650;font-size:14px;color:var(--ink-2)' }, t('gsAdvanced')),
            h('div', { style: 'margin-top:10px' }, field(t('gsBase'), baseIn).row)),
          h('div', { class: 'gt7-wizard-actions' }, test, save), status)),
      pictureWizard);
  }).catch(() => root.replaceChildren(formError(t('loadFailed'))));
  return frag(backLink(t('admin'), '#/admin'), pageTitle(t('gsTitle'), t('gsSub')), root);
}
