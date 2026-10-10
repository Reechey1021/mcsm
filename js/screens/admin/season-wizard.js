// screens/admin/season-wizard.js
// Create or edit a season in six steps: basics, rounds and PQ, cars, registration,
// scoring, review. New seasons can start as a copy of an existing one (?masol=mcsm31).
import { h, frag } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { reduced, SPRING, haptic } from '../../core/motion.js';
import { field, seg, toggle, busy, choice } from '../../ui/controls.js';
import { formError, loading, backLink, empty } from '../../ui/parts.js';
import { seasonCover, carLine } from '../../ui/season-parts.js';
import { toast } from '../../ui/sheet.js';
import { t, fmtDate } from '../../i18n/index.js';
import { backend, errorKey } from '../../services/backend.js';
import { seasons as loadSeasons, users as loadUsers, gtTeams as loadGt, invalidateSeason } from '../../core/data.js';
import { newSeason, defaultPq, defaultWindow, validateSeason, slugFor, FORMATS } from '../../model/season.js';
import { budapestToMs, msToBudapestInput, shiftDay, DAY } from '../../model/time.js';
import { DEFAULT_TABLE } from '../../engine/scoring.js';
import { TRACKS, trackById, roundTitle } from '../../data/tracks.js';
import { fullName, isComplete } from '../../model/profile.js';
import { go } from '../../router.js';
import { carField } from '../../ui/car-picker.js';
import { pickFile, uploadImage } from '../../ui/upload.js';
import { notifyAll } from '../../services/notify.js';

const STEP_KEYS = ['swBasics', 'swRounds', 'swCars', 'swEntry', 'swScoring', 'swReview'];
const STEP_OF_ERROR = { no: 0, name: 0, coverUrl: 0, rounds: 1, car: 2, window: 3, cap: 3, lobbySize: 3, points: 4 };

export function screenSeasonWizard({ id }, query) {
  const root = h('div', { class: 'narrow', style: 'max-width:640px' }, loading());
  Promise.all([loadSeasons(), loadUsers(), loadGt(), id ? backend.seasons.get(id) : null]).then(([all, us, gts, existing]) => {
    if (id && !existing) { root.replaceChildren(empty(t('notFound'))); return; }
    const from = query.get('masol') ? all.find((s) => s.id === query.get('masol')) : null;
    const draft = existing ? JSON.parse(JSON.stringify(existing)) : newSeason(Math.max(0, ...all.map((s) => s.no)) + 1, from);
    root.replaceChildren(build(draft, !!existing, all, us, gts));
  }).catch(() => root.replaceChildren(formError(t('loadFailed'))));
  return root;
}

function dt(label, ms, onChange, hint) {
  const inp = h('input', { class: 'input', type: 'datetime-local', value: msToBudapestInput(ms) });
  inp.addEventListener('change', () => onChange(budapestToMs(inp.value)));
  return field(label, inp, { hint: hint || t('budapestTime') });
}
function num(label, value, onChange, opts = {}) {
  const inp = h('input', { class: 'input', inputmode: 'numeric', value: value ?? '', style: opts.style || '' });
  inp.addEventListener('input', () => { inp.value = inp.value.replace(/[^\d]/g, ''); onChange(inp.value === '' ? null : Number(inp.value)); });
  return field(label, inp, { hint: opts.hint });
}
function txt(label, value, onChange, opts = {}) {
  const inp = h(opts.area ? 'textarea' : 'input', { class: 'input', value: value || '', maxlength: opts.max || 80, placeholder: opts.ph || '' });
  if (opts.area) inp.value = value || '';
  inp.addEventListener('input', () => onChange(inp.value));
  return field(label, inp, { hint: opts.hint });
}

function build(d, editing, all, us, gts) {
  let step = 0;
  const existingIds = all.map((s) => s.id).filter((x) => !editing || x !== d.id);
  const title = h('h1', { class: 'display page-title' }, editing ? t('editSeasonTitle', { n: d.no }) : t('newSeasonTitle'));
  const sub = h('p', { class: 'page-sub' });
  const bars = h('div', { class: 'wizard-steps', 'aria-hidden': 'true' }, STEP_KEYS.map(() => h('i')));
  const body = h('div', { class: 'wizard-body form' });
  const back = h('button', { class: 'btn', type: 'button' }, icon('chevL'), t('back'));
  const next = h('button', { class: 'btn primary', type: 'button', 'data-haptic': '' }, t('next'), icon('chevR'));
  const jump = seg(STEP_KEYS.map((k, i) => ({ value: i, label: t(k) })), 0, (v) => goStep(v), { scroll: true, label: t('steps') });

  const steps = [
    // 0 basics
    () => {
      const preview = h('div', { class: 'season-card', style: 'pointer-events:none' }, seasonCover(d), h('div', { class: 'body' }, h('h3', { class: 'display' }, 'MCSM' + (d.no || '?')), h('div', { style: 'font-weight:650' }, d.name || t('untitled'))));
      const refresh = () => preview.replaceChildren(seasonCover(d), h('div', { class: 'body' }, h('h3', { class: 'display' }, 'MCSM' + (d.no || '?')), h('div', { style: 'font-weight:650' }, d.name || t('untitled'))));
      const noF = num(t('seasonNo'), d.no, (v) => { d.no = v; d.id = slugFor(v); refresh(); }, { hint: editing ? t('seasonNoLocked') : t('seasonNoHint') });
      if (editing) noF.input.disabled = true;
      const upBtn = h('button', { class: 'btn small', type: 'button' }, icon('plus'), t('coverUpload'));
      upBtn.addEventListener('click', async () => { const f = await pickFile('image/*'); if (!f) return; busy(upBtn, async () => { try { d.coverUrl = await uploadImage(`seasons/${slugFor(d.no || 0)}/cover`, f, { max: 1600 }); refresh(); paint(0); } catch (e) { toast(t(errorKey(e)), 'alert'); } }); });
      return frag(noF.row, txt(t('seasonName'), d.name, (v) => { d.name = v; refresh(); }, { ph: 'FT-1 Cup [Gr.3]', max: 60 }).row,
        h('div', null, upBtn),
        txt(t('coverUrl'), d.coverUrl && d.coverUrl.startsWith('data:') ? '' : d.coverUrl, (v) => { d.coverUrl = v.trim(); refresh(); }, { ph: 'https://…', max: 400, hint: t('coverHint') }).row,
        txt(t('description'), d.description, (v) => { d.description = v; }, { area: true, max: 600, hint: t('descriptionHint') }).row,
        h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('preview')), preview));
    },
    // 1 rounds + PQ
    () => {
      const list = h('div', { class: 'stack', style: 'gap:12px' });
      const drawRounds = () => list.replaceChildren(...d.rounds.map((r, i) => roundEditor(r, i)));
      const roundEditor = (r, i) => {
        const tr = r.trackId === 'other' ? null : trackById(r.trackId);
        const layoutBox = h('div');
        const otherBox = h('div', { class: 'stack', style: 'gap:10px' });
        const drawTrack = () => {
          const cur = r.trackId === 'other' ? null : trackById(r.trackId);
          layoutBox.replaceChildren(cur && cur.layouts.length > 1 ? h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('layout')),
            choice(cur.layouts.map((l) => ({ value: l, label: l || t('layoutDefault') })), r.layout ?? cur.layouts[0], (v) => { r.layout = v; })) : '');
          otherBox.replaceChildren(...(r.trackId === 'other' ? [txt(t('trackName'), r.track, (v) => { r.track = v; }).row, txt(t('layout'), r.layout, (v) => { r.layout = v; }).row, txt(t('countryCode'), r.cc, (v) => { r.cc = v.toUpperCase().slice(0, 3); }, { ph: 'HUN', max: 3 }).row] : []));
        };
        const sel = h('select', { class: 'select', style: 'width:100%;min-height:50px' }, h('option', { value: '' }, t('pickTrack')), TRACKS.map((x) => h('option', { value: x.id, selected: r.trackId === x.id }, x.name + (x.cc ? ` (${x.cc})` : ''))), h('option', { value: 'other', selected: r.trackId === 'other' }, t('otherTrack')));
        sel.addEventListener('change', () => {
          r.trackId = sel.value || null;
          const x = trackById(r.trackId);
          if (x) { r.track = x.name; r.cc = x.cc; r.layout = x.layouts[0]; } else if (r.trackId !== 'other') { r.track = ''; }
          if (r.trackId === 'other') { r.track = ''; r.layout = ''; r.cc = ''; }
          drawTrack();
        });
        drawTrack();
        const up = h('button', { class: 'icon-btn', type: 'button', style: 'color:var(--ink)', 'aria-label': t('moveUp'), disabled: i === 0, onclick: () => { [d.rounds[i - 1], d.rounds[i]] = [d.rounds[i], d.rounds[i - 1]]; drawRounds(); } }, icon('up'));
        const del = h('button', { class: 'icon-btn', type: 'button', style: 'color:var(--red)', 'aria-label': t('delete'), onclick: () => { d.rounds.splice(i, 1); drawRounds(); } }, icon('trash'));
        void tr;
        return h('div', { class: 'round-edit' }, h('div', { class: 'head' }, h('b', { class: 'display' }, t('roundN', { n: i + 1 })), h('span', null, up, del)),
          dt(t('roundStart'), r.date, (v) => { r.date = v; }).row, h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('track')), sel), layoutBox, otherBox);
      };
      drawRounds();
      const add = h('button', { class: 'btn block', type: 'button' }, icon('plus'), t('addRound'));
      add.addEventListener('click', () => {
        const last = d.rounds[d.rounds.length - 1];
        d.rounds.push({ n: d.rounds.length + 1, date: last && last.date ? shiftDay(last.date, 7, '19:00') : shiftDay(Date.now(), 21, '19:00'), trackId: null, track: '', layout: '', cc: '', car: '' });
        drawRounds(); list.lastChild && list.lastChild.scrollIntoView({ behavior: reduced() ? 'auto' : 'smooth', block: 'center' });
      });
      const pqList = h('div', { class: 'stack', style: 'gap:10px' });
      const drawPq = () => pqList.replaceChildren(...(d.pq.length ? d.pq.map((p, i) => h('div', { class: 'round-edit' },
        h('div', { class: 'head' }, h('b', { class: 'display' }, p.name || 'PQ'), h('button', { class: 'icon-btn', type: 'button', style: 'color:var(--red)', 'aria-label': t('delete'), onclick: () => { d.pq.splice(i, 1); drawPq(); } }, icon('trash'))),
        h('div', { class: 'inline' }, txt(t('pqName'), p.name, (v) => { p.name = v; }, { max: 20 }).row, dt(t('pqStart'), p.date, (v) => { p.date = v; }).row))) : [h('p', { class: 'note', style: 'margin:0' }, t('noPq'))]));
      drawPq();
      const defaults = h('button', { class: 'btn small', type: 'button' }, icon('refresh'), t('defaultPq'));
      defaults.addEventListener('click', () => { const r1 = d.rounds.map((r) => r.date).filter(Boolean).sort((a, b) => a - b)[0]; if (!r1) { toast(t('errNoRounds'), 'alert'); return; } d.pq = defaultPq(r1); drawPq(); });
      const addPq = h('button', { class: 'btn small', type: 'button' }, icon('plus'), t('addPq'));
      addPq.addEventListener('click', () => { d.pq.push({ id: 'pq' + Date.now().toString(36), name: 'PQ' + (d.pq.length + 1), date: d.pq.length ? d.pq[d.pq.length - 1].date + DAY : shiftDay(Date.now(), 14, '20:00') }); drawPq(); });
      return frag(list, add, h('h2', { class: 'display', style: 'font-size:24px;margin-top:14px' }, t('pqSessions')), h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, defaults, addPq), pqList);
    },
    // 2 cars
    () => {
      const box = h('div', { class: 'stack', style: 'gap:12px' });
      const draw = () => {
        if (d.format === 'oneMake') box.replaceChildren(field(t('car'), carField(d.car, (v) => { d.car = v; }), { hint: t('carPickerHint') }).row);
        else if (d.format === 'special') box.replaceChildren(...(d.rounds.length ? d.rounds.map((r, i) => field(t('carForRound', { n: i + 1, track: roundTitle(r) || '?' }), carField(r.car, (v) => { r.car = v; })).row) : [h('p', { class: 'note' }, t('errNoRounds'))]));
        else {
          if (!d.cars.length) d.cars = ['', ''];
          box.replaceChildren(...d.cars.map((c, i) => h('div', { style: 'display:flex;gap:8px;align-items:center' }, h('div', { style: 'flex:1;min-width:0' }, carField(c, (v) => { d.cars[i] = v; }, { placeholder: t('carN', { n: i + 1 }) })),
            h('button', { class: 'icon-btn', type: 'button', style: 'color:var(--red)', 'aria-label': t('delete'), onclick: () => { d.cars.splice(i, 1); draw(); } }, icon('trash')))),
            h('button', { class: 'btn small', type: 'button', onclick: () => { d.cars.push(''); draw(); } }, icon('plus'), t('addCar')), h('p', { class: 'note', style: 'margin:0' }, t('specHint')));
        }
      };
      draw();
      return frag(h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('format')), seg(FORMATS.map((f) => ({ value: f, label: t('format_' + f) })), d.format, (v) => { d.format = v; draw(); }), h('span', { class: 'hint' }, t('formatHint'))), box);
    },
    // 3 registration
    () => {
      const champSel = h('select', { class: 'select', style: 'width:100%;min-height:50px' }, h('option', { value: '' }, t('noChampion')),
        us.filter(isComplete).sort((a, b) => fullName(a).localeCompare(fullName(b), 'hu')).map((u) => h('option', { value: u.uid, selected: d.championUid === u.uid }, `${fullName(u)} (${u.psn})`)));
      champSel.addEventListener('change', () => { d.championUid = champSel.value || null; });
      const winBox = h('div', { class: 'inline' });
      const drawWin = () => winBox.replaceChildren(dt(t('regOpens'), d.regOpensAt, (v) => { d.regOpensAt = v; }).row, dt(t('regCloses'), d.regClosesAt, (v) => { d.regClosesAt = v; }).row);
      drawWin();
      const def = h('button', { class: 'btn small', type: 'button' }, icon('refresh'), t('defaultWindow'));
      def.addEventListener('click', () => { const r1 = d.rounds.map((r) => r.date).filter(Boolean).sort((a, b) => a - b)[0]; if (!r1) { toast(t('errNoRounds'), 'alert'); return; } Object.assign(d, defaultWindow(r1, d.pq.slice().sort((a, b) => a.date - b.date))); drawWin(); });
      return frag(winBox, h('div', null, def, h('p', { class: 'note' }, t('windowHint'))),
        h('div', { class: 'inline' }, num(t('cap'), d.cap, (v) => { d.cap = v; }, { hint: t('capHint') }).row, num(t('lobbySize'), d.lobbySize, (v) => { d.lobbySize = v; }, { hint: t('lobbySizeHint') }).row),
        h('div', { class: 'toggle-row' }, h('span', null, t('waitlist'), h('small', null, t('waitlistHint'))), toggle(d.waitlist !== false, (v) => { d.waitlist = v; }, { label: t('waitlist') })),
        h('div', { class: 'f-row', style: 'margin-top:8px' }, h('span', { class: 'f-label' }, t('champion')), champSel, h('span', { class: 'hint' }, t('championHint'))));
    },
    // 4 scoring
    () => {
      const P = d.points;
      const grid = (arr, label) => h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, label), h('div', { class: 'pts-grid' }, arr.map((v, i) => h('label', null, 'P' + (i + 1), h('input', { class: 'input', inputmode: 'numeric', value: v, oninput: (e) => { const n = Number(e.target.value.replace(/[^\d]/g, '')); e.target.value = e.target.value.replace(/[^\d]/g, ''); arr[i] = Number.isFinite(n) ? n : 0; } })))));
      const box = h('div', { class: 'stack', style: 'gap:16px' });
      const draw = () => box.replaceChildren(grid(P.raceA, t('raceA')),
        h('div', { class: 'inline' }, num(t('lobbyStep'), P.lobbyStep, (v) => { P.lobbyStep = v ?? 0; }, { hint: t('lobbyStepHint') }).row, num(t('flPoints'), P.fl, (v) => { P.fl = v ?? 0; }).row),
        h('div', { class: 'inline' }, ['A', 'B', 'C'].map((L) => num(t('dnfPoints', { l: L }), P.dnf[L], (v) => { P.dnf[L] = v ?? 0; }).row)),
        grid(P.quali, t('qualiPoints')));
      draw();
      const reset = h('button', { class: 'btn small', type: 'button' }, icon('refresh'), t('resetPoints'));
      reset.addEventListener('click', () => { d.points = JSON.parse(JSON.stringify(DEFAULT_TABLE)); toast(t('pointsReset')); paint(0); });
      d.championships = d.championships || { teams: true, gt: [] };
      const gtSet = new Set(d.championships.gt || []);
      return frag(h('p', { class: 'muted', style: 'margin:0' }, t('pointsIntro')), reset, box,
        num(t('promoteCount'), d.promote, (v) => { d.promote = v ?? 0; }, { hint: t('promoteHint') }).row,
        h('h2', { class: 'display', style: 'font-size:24px;margin-top:6px' }, t('championships')),
        h('div', { class: 'toggle-row' }, h('span', null, t('champTeams'), h('small', null, t('champTeamsHint'))), toggle(d.championships.teams !== false, (v) => { d.championships.teams = v; }, { label: t('champTeams') })),
        h('div', { class: 'f-row', style: 'margin-top:8px' }, h('span', { class: 'f-label' }, t('gtChamps')),
          h('div', { class: 'choice multi' }, gts.map((g) => { const b = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(gtSet.has(g.id)) }, g.tag); b.addEventListener('click', () => { gtSet.has(g.id) ? gtSet.delete(g.id) : gtSet.add(g.id); b.setAttribute('aria-pressed', String(gtSet.has(g.id))); d.championships.gt = [...gtSet]; }); return b; })),
          h('span', { class: 'hint' }, t('gtChampsHint'))));
    },
    // 5 review
    () => {
      normalize();
      const errs = validateSeason(d, existingIds);
      const errList = Object.entries(errs);
      const row = (k, v) => frag(h('dt', null, k), h('dd', null, v));
      return frag(
        errList.length ? h('div', { class: 'callout warn', style: 'display:block' }, h('b', null, t('fixBeforeSave')),
          h('ul', { style: 'margin:8px 0 0;padding-left:18px' }, errList.map(([k, e]) => h('li', null, h('a', { href: '#', style: 'color:inherit;text-decoration:underline', onclick: (ev) => { ev.preventDefault(); goStep(STEP_OF_ERROR[k] ?? 0); } }, t(e)))))) : h('div', { class: 'callout' }, icon('check'), h('span', null, t('readyToSave'))),
        h('div', { class: 'panel pad summary' }, h('dl', null,
          row(t('season'), `MCSM${d.no} – ${d.name || '?'}`), row(t('format'), t('format_' + d.format)), row(t('car'), carLine(d)),
          row(t('rounds'), d.rounds.map((r, i) => `${i + 1}. ${roundTitle(r)} (${r.date ? fmtDate(r.date, true) : '?'})`).join('\n') || '–'),
          row(t('pqSessions'), d.pq.map((p) => `${p.name} (${fmtDate(p.date, true)})`).join(', ') || '–'),
          row(t('regOpens'), d.regOpensAt ? fmtDate(d.regOpensAt, true) : '–'), row(t('regCloses'), d.regClosesAt ? fmtDate(d.regClosesAt, true) : '–'),
          row(t('cap'), `${d.cap} (${d.waitlist !== false ? t('withWaitlist') : t('noWaitlist')})`), row(t('lobbySize'), String(d.lobbySize)),
          row(t('championships'), [t('champDrivers'), d.championships.teams ? t('champTeams') : null, ...(d.championships.gt || [])].filter(Boolean).join(', ')),
          row(t('raceA'), `${d.points.raceA[0]}…${d.points.raceA[d.points.raceA.length - 1]}`))));
    },
  ];

  function normalize() {
    d.rounds = d.rounds.slice().sort((a, b) => (a.date || 0) - (b.date || 0)).map((r, i) => ({ ...r, n: i + 1 }));
    d.pq = d.pq.slice().sort((a, b) => (a.date || 0) - (b.date || 0));
  }
  function paint(dir) {
    sub.textContent = t('stepOf', { n: step + 1, total: STEP_KEYS.length, name: t(STEP_KEYS[step]) });
    [...bars.children].forEach((b, i) => { b.className = i < step ? 'done' : i === step ? 'on' : ''; });
    jump.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.v === step)));
    jump._place && jump._place();
    back.style.visibility = step === 0 ? 'hidden' : 'visible';
    next.replaceChildren(...(step === STEP_KEYS.length - 1 ? [] : [t('next'), icon('chevR')]));
    next.style.display = step === STEP_KEYS.length - 1 ? 'none' : '';
    saveRow.style.display = step === STEP_KEYS.length - 1 ? '' : 'none';
    body.replaceChildren(steps[step]());
    if (dir && !reduced()) body.animate([{ opacity: 0, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }], { duration: SPRING.move.duration, easing: SPRING.move.easing });
  }
  function goStep(i) { if (i === step) return; const dir = i > step ? 1 : -1; step = i; paint(dir); window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); }
  back.addEventListener('click', () => goStep(step - 1));
  next.addEventListener('click', () => goStep(step + 1));

  const err = h('div');
  const save = async (btn, state) => busy(btn, async () => {
    err.replaceChildren(); normalize();
    const errs = validateSeason(d, existingIds);
    if (Object.keys(errs).length) { haptic(25); goStep(STEP_KEYS.length - 1); paint(0); return; }
    const data = { ...d, id: slugFor(d.no), no: Number(d.no), state: state || d.state, name: d.name.trim() };
    try {
      await backend.seasons.save(data);
      await backend.audit.add({ action: editing ? 'season.update' : 'season.create', target: data.id, targetName: 'MCSM' + data.no, before: null, after: { state: data.state }, reason: null });
      if (state === 'announced' && d.state !== 'announced') notifyAll(data, 'seasonAnnounced', {}, '#/szezonok/' + data.id);
      invalidateSeason(data.id); toast(editing ? t('saved') : t('seasonCreated', { n: data.no })); go('/szezonok/' + data.id);
    } catch (e) { err.replaceChildren(formError(t(errorKey(e)))); }
  });
  const saveDraft = h('button', { class: 'btn', type: 'button' }, icon('check'), editing ? t('save') : t('saveDraft'));
  saveDraft.addEventListener('click', () => save(saveDraft, null));
  const announce = !editing || d.state === 'draft' ? h('button', { class: 'btn primary', type: 'button', 'data-haptic': '' }, icon('flag'), t('announce')) : null;
  if (announce) announce.addEventListener('click', () => save(announce, 'announced'));
  const saveRow = h('div', { class: 'wizard-foot', style: 'display:none' }, saveDraft, announce);

  paint(0);
  return frag(backLink(editing ? 'MCSM' + d.no : t('seasons'), editing ? '#/szezonok/' + d.id : '#/szezonok'), title, sub,
    h('div', { style: 'margin-bottom:14px' }, jump), bars, err, body, h('div', { class: 'wizard-foot' }, back, next), saveRow);
}
