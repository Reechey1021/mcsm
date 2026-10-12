// screens/results-entry.js
// Results entry for one sheet (round, lobby, session). Two modes:
//   Order: tap drivers in finishing order; row menu for DNF/DNS/DSQ/remove.
//   Times: lap times (qualifying) or winner's time + gaps + best laps (races).
// Plus paste-from-spreadsheet, fill-in-grid-order, undo, and a local backup of
// unsaved work so a stray back button on a phone never loses a sheet.
import { h, frag } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { flip, haptic, reduced } from '../core/motion.js';
import { store } from '../core/storage.js';
import { seg, busy } from '../ui/controls.js';
import { empty, backLink, formError, skelRows } from '../ui/parts.js';
import { openSheet, toast } from '../ui/sheet.js';
import { aiImportPanel } from '../ui/ai-import.js';
import { t } from '../i18n/index.js';
import { backend, errorKey } from '../services/backend.js';
import { isAdmin } from '../services/session.js';
import { loadRace } from '../core/race-data.js';
import { fullName } from '../model/profile.js';
import { gpGrid } from '../engine/scoring.js';
import { sheetId, sheetProblems, parseLap, parseRaceTime, parseGap, fmtLap, fmtRace } from '../model/race.js';

const RANK = { OK: 0, DNF: 1, DNS: 2, DSQ: 3 };

export function screenResultsEntry({ sid, n, L, S }) {
  n = Number(n);
  const root = h('div', null, skelRows(8, 52));
  loadRace(sid, { drafts: true }).then((ctx) => {
    const doc = ctx && ctx.roundDoc(n);
    if (!doc || !doc.lobbies || !(doc.lobbies[L] || []).length || !['Q', 'S', 'GP'].includes(S)) { root.replaceChildren(empty(t('notFound'))); return; }
    root.replaceChildren(build(ctx, n, L, S));
  }).catch(() => root.replaceChildren(empty(t('loadFailed'))));
  return frag(backLink(t('roundN', { n }), `#/szezonok/${sid}/fordulo/${n}`), root);
}

function build(ctx, n, L, S) {
  const s = ctx.season, id = sheetId(n, L, S);
  const roster = ctx.roundDoc(n).lobbies[L];
  const existing = ctx.sheet(n, L, S);
  const localKey = `entry:${s.id}:${id}`;
  const local = store.get(localKey, null);
  let placed = (local && (!existing || local.at > (existing.updatedAt || 0)) ? local.rows : (existing ? existing.rows : [])).map((r) => ({ ...r }));
  const restored = !!(local && (!existing || local.at > (existing.updatedAt || 0)) && local.rows.length);
  let mode = 'order';
  const hist = [];
  const name = (uid) => fullName(ctx.snaps[uid] || {});
  const wrap = h('div', { class: 'entry-wrap' });
  const orderEl = h('ol', { class: 'order', 'aria-label': t('finishOrder') });
  const poolEl = h('div', { class: 'pool', 'aria-label': t('notPlaced') });
  const timesEl = h('div', { class: 'stack', style: 'gap:6px' });
  const prog = h('span', { class: 'prog' });
  const err = h('div');
  const undoBtn = h('button', { class: 'btn small', type: 'button', 'aria-label': t('undo') }, icon('undo'));
  const saveBtn = h('button', { class: 'btn primary small', type: 'button', 'data-haptic': '' }, icon('check'), t('save'));
  const snapshot = () => hist.push(JSON.stringify(placed));
  const backup = () => store.set(localKey, { at: Date.now(), rows: placed });
  const normalize = () => { placed = placed.map((p, i) => [p, i]).sort((a, b) => RANK[a[0].status] - RANK[b[0].status] || a[1] - b[1]).map((x) => x[0]); };

  const renderOrder = () => {
    const free = roster.filter((uid) => !placed.some((p) => p.id === uid));
    let okN = 0;
    orderEl.replaceChildren(...placed.map((p, i) => {
      const snap = ctx.snaps[p.id] || {}, tm = ctx.tmap[snap.teamId];
      if (p.status === 'OK') okN++;
      return h('li', { dataset: { key: p.id } }, h('span', { class: 'p' }, p.status === 'OK' ? okN : '–'),
        h('span', { style: 'display:flex;align-items:center;gap:10px;min-width:0' }, h('span', { class: 'rnum', style: `font-size:18px;min-width:30px;border-bottom:3px solid ${tm ? tm.c1 : 'transparent'}` }, snap.raceNumber ?? ''), h('b', { style: 'white-space:nowrap;overflow:hidden;text-overflow:ellipsis' }, (snap.lastName || '').toLocaleUpperCase('hu'), h('span', { class: 'faint', style: 'font-weight:500' }, ' ' + (snap.firstName || '')))),
        h('span', { class: 'acts' },
          h('button', { type: 'button', 'aria-label': t('moveUp'), disabled: i === 0, onclick: () => { snapshot(); [placed[i - 1], placed[i]] = [placed[i], placed[i - 1]]; commit(); } }, icon('up')),
          h('button', { type: 'button', 'aria-label': t('rowActions', { name: name(p.id) }), onclick: () => rowMenu(p) }, p.status === 'OK' ? icon('dots') : h('span', { class: 'st ' + p.status.toLowerCase() }, p.status))));
    }), ...free.map((_, j) => h('li', { class: 'slot' + (j === 0 ? ' next' : '') }, h('span', { class: 'p' }, placed.length + j + 1), h('span', { class: 'hint' }, j === 0 ? t('tapNext') : ''), h('span'))));
    poolEl.replaceChildren(...(free.length ? free.map((uid) => {
      const snap = ctx.snaps[uid] || {}, tm = ctx.tmap[snap.teamId];
      return h('button', { class: 'pchip', type: 'button', dataset: { key: uid }, onclick: () => { snapshot(); placed.push({ id: uid, status: 'OK' }); commit(); } },
        h('span', { class: 'rn', vars: { '--t1': tm ? tm.c1 : 'transparent' } }, snap.raceNumber ?? '?'), (snap.lastName || '').toLocaleUpperCase('hu'));
    }) : [h('span', { class: 'faint', style: 'padding:6px' }, t('allPlaced'))]));
  };

  const timeInput = (p, key, parse, fmt, ph, label) => {
    const v = key === 'gap' ? (p.laps ? '+' + p.laps + ' ' + t('lapUnit') : p.gap != null ? fmtLap(p.gap) : '') : (p[key] != null ? fmt(p[key]) : '');
    const inp = h('input', { class: 'input', inputmode: 'decimal', value: v, placeholder: ph, 'aria-label': label, style: 'min-height:42px;font-variant-numeric:tabular-nums;padding:0 10px' });
    inp.addEventListener('change', () => {
      const raw = inp.value.trim();
      if (!raw) { if (key === 'gap') { p.gap = null; p.laps = null; } else p[key] = null; inp.removeAttribute('aria-invalid'); backup(); return; }
      if (key === 'gap') { const g = parseGap(raw); if (!g) { inp.setAttribute('aria-invalid', 'true'); return; } p.gap = g.gap ?? null; p.laps = g.laps ?? null; inp.value = g.laps ? '+' + g.laps + ' ' + t('lapUnit') : fmtLap(g.gap); }
      else { const x = parse(raw); if (x == null) { inp.setAttribute('aria-invalid', 'true'); return; } p[key] = x; inp.value = fmt(x); }
      inp.removeAttribute('aria-invalid'); backup(); updateProg();
    });
    return inp;
  };
  const renderTimes = () => {
    let okN = 0;
    timesEl.replaceChildren(...(placed.length ? placed.map((p) => {
      const ok = p.status === 'OK'; if (ok) okN++;
      const first = ok && okN === 1;
      const snap = ctx.snaps[p.id] || {};
      const inputs = S === 'Q'
        ? [timeInput(p, 'best', parseLap, fmtLap, '1:57.234', t('bestLap'))]
        : [first ? timeInput(p, 'time', parseRaceTime, fmtRace, '20:13.400', t('totalTime')) : ok ? timeInput(p, 'gap', null, null, '+3.456', t('gap')) : h('span', { class: 'st ' + p.status.toLowerCase(), style: 'justify-self:start' }, p.status),
          timeInput(p, 'best', parseLap, fmtLap, t('bestLapPh'), t('bestLap'))];
      return h('div', { class: 'time-row' + (S === 'Q' ? ' q' : '') }, h('span', { class: 'p display' }, ok ? okN : '–'), h('b', { class: 'nm' }, (snap.lastName || '').toLocaleUpperCase('hu')), ...inputs);
    }) : [empty(t('orderFirst'))]));
  };
  const updateProg = () => {
    const probs = sheetProblems(placed, roster, S);
    prog.replaceChildren(h('b', null, `${placed.length} / ${roster.length}`), ' ', t('placedLabel'), probs.length ? h('span', { style: 'display:block;font-size:12px;color:var(--ink-3)' }, probs.map((k) => t(k)).join(' ')) : null);
    undoBtn.disabled = !hist.length;
  };
  const render = () => { mode === 'order' ? renderOrder() : renderTimes(); updateProg(); };
  const commit = () => { normalize(); backup(); flip(wrap, render); };

  const rowMenu = (p) => {
    const opt = (st, label) => h('button', { class: 'menu-item', type: 'button', 'aria-pressed': String(p.status === st), onclick: () => { sh.close(true); if (p.status !== st) { snapshot(); p.status = st; if (st !== 'OK') { p.time = null; p.gap = null; p.laps = null; } haptic(10); setTimeout(commit, 120); } } }, icon(p.status === st ? 'check' : 'dots'), label);
    const sh = openSheet({ title: name(p.id), body: frag(opt('OK', t('stOk')), opt('DNF', 'DNF'), opt('DNS', 'DNS'), opt('DSQ', 'DSQ'),
      h('button', { class: 'menu-item', type: 'button', style: 'color:var(--red)', onclick: () => { sh.close(true); snapshot(); placed.splice(placed.indexOf(p), 1); setTimeout(commit, 120); } }, icon('close'), t('removeRow'))) });
  };
  undoBtn.addEventListener('click', () => { if (!hist.length) return; placed = JSON.parse(hist.pop()); backup(); flip(wrap, render); });

  // helpers
  const q = ctx.sheet(n, L, 'Q');
  const gridOrder = () => (S === 'Q' ? roster : S === 'S' && q ? q.rows.slice().sort((a, b) => a.pos - b.pos).map((r) => r.id) : S === 'GP' && q ? gpGrid(q.rows) : roster);
  const fill = h('button', { class: 'btn small', type: 'button' }, icon('bolt'), t('fillGrid'));
  fill.addEventListener('click', () => {
    const free = gridOrder().filter((uid) => roster.includes(uid) && !placed.some((p) => p.id === uid));
    if (!free.length) return;
    snapshot(); let i = 0;
    const step = () => { if (i >= free.length) return; placed.push({ id: free[i++], status: 'OK' }); normalize(); backup(); flip(wrap, render); haptic(4); setTimeout(step, reduced() ? 0 : 60); };
    step();
  });
  const clear = h('button', { class: 'btn small', type: 'button' }, t('clearAll'));
  clear.addEventListener('click', () => { if (!placed.length) return; snapshot(); placed = []; commit(); });
  const paste = h('textarea', { class: 'input', placeholder: S === 'Q' ? 'MGTK_Dudu  1:57.234' : 'MGTK_Dudu  20:13.400  1:57.900\nIGTSH_Saby  +1.204  1:58.010' });
  const pasteBtn = h('button', { class: 'btn small', type: 'button' }, t('readPaste'));
  pasteBtn.addEventListener('click', () => {
    const miss = [], rows = [];
    paste.value.split('\n').map((l) => l.trim()).filter(Boolean).forEach((line) => {
      const tokens = line.split(/\t|;|\s{2,}/).map((x) => x.trim()).filter(Boolean);
      const who = (tokens.shift() || '').replace(/^\d+[.)]\s*/, '').toLowerCase();
      const uid = roster.find((u) => (ctx.snaps[u] || {}).psnLower === who) || roster.find((u) => who.length > 3 && ((ctx.snaps[u] || {}).psnLower || '').startsWith(who));
      if (!uid || rows.some((r) => r.id === uid)) { miss.push(line); return; }
      const row = { id: uid, status: 'OK' };
      const up = tokens.map((x) => x.toUpperCase());
      if (['DNF', 'DNS', 'DSQ'].includes(up[0])) { row.status = up[0]; tokens.shift(); }
      if (S === 'Q') row.best = parseLap(tokens[0]);
      else {
        if (row.status === 'OK') { if (!rows.some((r) => r.status === 'OK')) row.time = parseRaceTime(tokens[0]); else { const g = parseGap(tokens[0]); if (g) { row.gap = g.gap ?? null; row.laps = g.laps ?? null; } } }
        row.best = parseLap(tokens[row.status === 'OK' ? 1 : 0]);
      }
      rows.push(row);
    });
    if (!rows.length) { toast(t('pasteNothing'), 'alert'); return; }
    snapshot(); placed = rows; paste.value = miss.join('\n'); commit();
    toast(miss.length ? t('pasteMissed', { n: miss.length }) : t('pasteOk'), miss.length ? 'alert' : 'check');
  });

  saveBtn.addEventListener('click', () => busy(saveBtn, async () => {
    err.replaceChildren();
    let pos = 0;
    const rows = placed.map((p) => ({ id: p.id, status: p.status, pos: ++pos, best: p.best ?? null, time: p.status === 'OK' ? p.time ?? null : null, gap: p.status === 'OK' ? p.gap ?? null : null, laps: p.status === 'OK' ? p.laps ?? null : null }));
    const state = existing && existing.state === 'published' && isAdmin() ? 'published' : 'draft';
    try {
      await backend.race.sheetSave(s.id, id, { n, L, S, rows, state });
      await backend.audit.add({ action: existing ? 'sheet.update' : 'sheet.create', target: s.id, targetName: `MCSM${s.no} ${t('roundN', { n })} ${L} ${S}`, before: null, after: { rows: rows.length, state }, reason: null });
      store.del(localKey);
      const probs = sheetProblems(rows, roster, S);
      toast(probs.length ? t('savedWithGaps') : state === 'published' ? t('correctionSaved') : t('draftSaved2'), probs.length ? 'info' : 'check');
      setTimeout(() => history.back(), 500);
    } catch (e) { err.replaceChildren(formError(t(errorKey(e)))); }
  }));

  const modeSeg = seg([{ value: 'order', label: t('modeOrder') }, { value: 'times', label: S === 'Q' ? t('modeLaps') : t('modeTimes') }], mode, (v) => {
    mode = v; layout(); render();
    if (!reduced()) wrap.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
  });
  const orderPane = h('div', null, h('div', { class: 'label', style: 'margin-bottom:8px' }, t('finishOrder')), orderEl);
  const poolPane = h('div', null, h('div', { class: 'row-between', style: 'margin-bottom:8px' }, h('span', { class: 'label' }, t('notPlaced')), h('span', { style: 'display:flex;gap:6px' }, fill, clear)), poolEl,
    h('details', { class: 'panel', style: 'padding:0;margin-top:12px' }, h('summary', { style: 'padding:14px 16px;font-weight:700;cursor:pointer' }, t('pasteFromSheet')),
      h('div', { class: 'stack', style: 'gap:8px;padding:0 16px 16px' }, h('p', { class: 'note', style: 'margin:0' }, S === 'Q' ? t('pastHelpQ') : t('pasteHelpRace')), paste, pasteBtn)),
    h('p', { class: 'note' }, t('entryHelp')));
  const layout = () => { wrap.replaceChildren(...(mode === 'order' ? [orderPane, poolPane] : [h('div', { style: 'grid-column:1 / -1' }, h('p', { class: 'note', style: 'margin:0 0 10px' }, S === 'Q' ? t('lapsHelp') : t('timesHelp')), timesEl)])); };
  const sesName = { Q: t('quali'), S: 'Sprint', GP: "Gran'Prix" }[S];
  const people = roster.map((uid) => { const p = ctx.person ? ctx.person(uid) : ctx.snaps[uid] || {}; return { uid, psn: p.psn || '', firstName: p.firstName || '', lastName: p.lastName || '' }; });
  const ai = aiImportPanel({ session: S, people, onApply: (rows) => {
    snapshot();
    let leaderTime = null;
    placed = rows.map((r, i) => {
      const status = { finished: 'OK', dnf: 'DNF', dsq: 'DSQ', dns: 'DNS' }[r.status] || 'OK';
      const row = { id: r.uid, status, best: parseLap(r.bestLap) };
      if (S !== 'Q' && status === 'OK') {
        if (i === 0 || (!leaderTime && r.totalTime)) { row.time = parseRaceTime(r.totalTime); leaderTime = row.time; }
        else { const g = parseGap(r.gap || ''); if (g) { row.gap = g.gap ?? null; row.laps = g.laps ?? null; } }
      }
      return row;
    });
    mode = S === 'Q' ? 'times' : 'times'; layout(); commit();
  } });
  layout(); render();
  return frag(h('h1', { class: 'display page-title' }, t('resultsEntry')),
    h('p', { class: 'page-sub', style: 'display:flex;align-items:center;gap:8px;flex-wrap:wrap' }, h('span', { class: 'lobby ' + L }, L), t('entrySub', { n, l: L, s: sesName }), existing ? h('span', { class: 'status' }, t('sheet_' + existing.state)) : null),
    restored ? h('div', { class: 'callout', style: 'margin-bottom:12px' }, icon('info'), h('span', null, t('restoredLocal'))) : null,
    ai, h('div', { style: 'margin:14px 0' }, modeSeg), err, wrap, h('div', { class: 'entry-bar' }, prog, undoBtn, saveBtn));
}
