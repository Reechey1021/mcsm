// screens/race.js
// Race screens: the season's PQ tab, the round page (results, grid, line-ups),
// the lobby editor (PQ proposal for round 1, promotion/relegation after that),
// round publishing, and PQ time entry.
import { h, frag } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { flip, reduced, haptic } from '../core/motion.js';
import { seg, busy, field } from '../ui/controls.js';
import { avatar, ratingEl, empty, backLink, formError, secHead, skelRows, pageTitle } from '../ui/parts.js';
import { openSheet, toast } from '../ui/sheet.js';
import { t, fmtDate } from '../i18n/index.js';
import { backend, errorKey } from '../services/backend.js';
import { session, isAdmin, isStaff } from '../services/session.js';
import { loadRace } from '../core/race-data.js';
import { fullName } from '../model/profile.js';
import { LOBBIES, sessionPoints, flHolder, gpGrid, promoteRelegate } from '../engine/scoring.js';
import { SESSIONS, sheetId, lobbyOf, pqProposal, pqConflicts, noShows, fmtLap, fmtRace, parseLap } from '../model/race.js';
import { roundTitle } from '../data/tracks.js';
import { roundProtests } from './protests.js';
import { notifySeason } from '../services/notify.js';

const audit = (action, s, extra = {}) => backend.audit.add({ action, target: s.id, targetName: 'MCSM' + s.no, before: null, after: null, reason: null, ...extra });
const lobbyBadge = (L) => h('span', { class: 'lobby ' + L }, L);
const nameCell = (ctx, uid) => { const p = ctx.snaps[uid] || {}; return h('a', { href: '#/pilotak/' + encodeURIComponent(p.psnLower || '') }, h('span', { class: 'rnum faint', style: 'display:inline-block;min-width:26px' }, p.raceNumber ?? ''), h('b', null, (p.lastName || '').toLocaleUpperCase('hu')), ' ', h('span', { class: 'hide-sm' }, p.firstName || '')); };

/* ---------- PQ tab (season page) ---------- */
export function pqTab(st) {
  const box = h('div', null, skelRows(6, 54));
  loadRace(st.season.id).then((ctx) => {
    const s = ctx.season, size = s.lobbySize || 16;
    const sessions = (s.pq || []).slice().sort((a, b) => a.date - b.date);
    const count = (id) => Object.keys((ctx.pqDocs.find((d) => d.id === id) || {}).times || {}).length;
    const r1 = ctx.roundDoc(1);
    const fastest = (ctx.pqRank.find((r) => r.t) || {}).t;
    const items = [];
    ctx.pqRank.forEach((r, i) => {
      if (i > 0 && i % size === 0) items.push(h('li', { class: 'pq-cut' }, t('lobbyCut', { l: LOBBIES[i / size - 1] || '' })));
      const p = ctx.snaps[r.uid] || {}, tm = ctx.tmap[p.teamId];
      const L = r1 && r1.lobbiesPublished ? lobbyOf(r1.lobbies, r.uid) : (LOBBIES[Math.floor(i / size)] || 'C');
      const pqName = r.pq ? ((sessions.find((x) => x.id === r.pq) || {}).name || '') : '';
      items.push(h('li', { dataset: { key: r.uid } }, h('a', { class: 'trow' + (session.user && r.uid === session.user.uid ? ' me' : ''), href: '#/pilotak/' + encodeURIComponent(p.psnLower || '') },
        h('span', { class: 'pos' }, i + 1), h('span'),
        h('span', { class: 'who' }, h('span', { class: 'stripe', vars: { '--t1': tm ? tm.c1 : 'var(--line-2)' } }), h('span', { class: 'nm' }, h('b', null, fullName(p)), h('span', null, r.seeded ? t('seededExempt') : r.missing ? t('noPqTime') : pqName))),
        h('span', { class: 'pts' }, L ? lobbyBadge(L) : null, h('b', { style: 'font-size:16px;min-width:78px' }, r.seeded ? '★' : r.t ? fmtLap(r.t) : '–')),
        h('span', { class: 'cols' }, h('span', { style: 'width:84px' }, r.t && fastest && r.t !== fastest ? '+' + (r.t - fastest).toFixed(3) : '')))));
    });
    const ol = h('ol', { class: 'tower' }, items);
    if (!reduced()) requestAnimationFrame(() => [...ol.children].slice(0, 40).forEach((li, i) => li.animate([{ opacity: 0, transform: li.classList.contains('pq-cut') ? 'scaleX(.3)' : 'translateX(-14px)' }, { opacity: 1, transform: 'none' }], { duration: li.classList.contains('pq-cut') ? 500 : 300, delay: i * 14, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' })));
    box.replaceChildren(
      h('p', { class: 'muted', style: 'margin:6px 0 12px' }, t('pqIntro2', { n: ctx.pqRank.filter((r) => r.seeded).length, size })),
      h('div', { class: 'stack', style: 'gap:8px;margin-bottom:16px' }, sessions.map((p) => h('div', { class: 'round-item' }, icon('clock', 'chev'),
        h('span', { class: 't' }, h('b', null, p.name), h('span', { class: 'sub' }, fmtDate(p.date, true), h('span', null, t('nTimes', { n: count(p.id) })))),
        isStaff() ? h('a', { class: 'btn small', href: `#/admin/pq/${s.id}/${p.id}` }, icon('edit'), t('enterTimes')) : null))),
      isAdmin() ? h('div', { style: 'margin-bottom:14px' }, h('a', { class: 'btn', href: `#/szezonok/${s.id}/fordulo/1?szerk=lobbyk` }, icon('grid'), t('round1Lobbies'))) : null,
      ctx.pqRank.length ? h('div', { class: 'tower-wrap' }, ol) : empty(t('noEntries')));
  }).catch(() => box.replaceChildren(empty(t('loadFailed'))));
  return box;
}

/* ---------- round list items (season page) ---------- */
export function roundLink(s, r, docs, next) {
  const doc = docs.find((d) => d.n === r.n) || {};
  const state = doc.resultsState && doc.resultsState !== 'none' ? doc.resultsState : null;
  return h('a', { class: 'round-item' + (next ? ' next' : ''), href: `#/szezonok/${s.id}/fordulo/${r.n}` }, h('span', { class: 'no display' }, r.n),
    h('span', { class: 't' }, h('b', null, roundTitle(r)), h('span', { class: 'sub' }, fmtDate(r.date, true), r.cc ? h('span', { class: 'cc' }, r.cc) : null,
      state ? h('span', { class: 'status' + (state === 'final' ? '' : ' live') }, t(state === 'final' ? 'stFinal' : 'stProvisional')) : doc.lobbiesPublished ? h('span', { class: 'status' }, t('lobbiesOut')) : null)),
    icon('chevR', 'chev'));
}

/* ---------- round page ---------- */
const rui = { L: null, S: 'GP' };
export function screenRound({ id, n }, query) {
  n = Number(n);
  const root = h('div', null, skelRows(1, 120), h('div', { style: 'height:12px' }), skelRows(8, 44));
  const load = () => loadRace(id, { drafts: true }).then((ctx) => {
    if (!ctx || !ctx.season.rounds.find((r) => r.n === n)) { root.replaceChildren(empty(t('notFound'))); return; }
    root.replaceChildren(query.get('szerk') === 'lobbyk' && isAdmin() ? lobbyEditor(ctx, n, load) : roundView(ctx, n, load));
  }).catch(() => root.replaceChildren(empty(t('loadFailed'))));
  load();
  return frag(backLink(t('backToSeason'), `#/szezonok/${id}/fordulok`), root);
}

function roundView(ctx, n, reload) {
  const s = ctx.season, info = s.rounds.find((r) => r.n === n), doc = ctx.roundDoc(n) || {};
  const built = ctx.built.find((r) => r.n === n);
  const published = ['provisional', 'final'].includes(doc.resultsState);
  const showResults = built && (published || isStaff());
  const myL = session.user ? lobbyOf(doc.lobbies, session.user.uid) : null;
  if (!rui.L || !(doc.lobbies || {})[rui.L]) rui.L = myL || 'A';
  const lobbies = LOBBIES.filter((L) => ((doc.lobbies || {})[L] || []).length);
  const statusTxt = doc.resultsState === 'final' ? t('stFinal') : doc.resultsState === 'provisional' ? t('stProvisional') : doc.lobbiesPublished ? t('lobbiesOut') : t('stNext');
  const head = h('div', null,
    h('div', { class: 'row-between', style: 'flex-wrap:wrap' }, h('h1', { class: 'display page-title' }, t('roundN', { n })), h('span', { class: 'status' + (doc.resultsState === 'provisional' ? ' live' : '') }, statusTxt)),
    h('div', { style: 'display:flex;gap:8px;align-items:center;font-weight:650;font-size:16px' }, info.cc ? h('span', { class: 'cc' }, info.cc) : null, roundTitle(info)),
    h('p', { class: 'page-sub', style: 'margin-top:4px' }, fmtDate(info.date, true), info.car ? ' · ' + info.car : ''));
  const body = h('div');
  const sessions = showResults ? [['Q', t('quali')], ['S', 'Sprint'], ['GP', "Gran'Prix"], ['GRID', t('gpGrid')], ['ROSTER', t('roster')]] : [['ROSTER', t('roster')]];
  if (!sessions.some(([k]) => k === rui.S)) rui.S = sessions[0][0];
  const draw = (anim) => {
    body.replaceChildren(roundBody(ctx, n, rui.L, rui.S, built));
    if (anim && !reduced()) body.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
  };
  const tools = lobbies.length ? h('div', { class: 'stack', style: 'gap:10px;margin-bottom:14px' },
    seg(lobbies.map((L) => ({ value: L, label: t('lobbyX', { l: L }) + (L === myL ? ' •' : '') })), rui.L, (v) => { rui.L = v; draw(true); }, { label: t('lobby') }),
    seg(sessions.map(([value, label]) => ({ value, label })), rui.S, (v) => { rui.S = v; draw(true); }, { scroll: true, label: t('session') })) : null;
  if (lobbies.length) draw(); else body.replaceChildren(empty(t('noLobbiesYet')));
  return frag(head, isStaff() ? adminRoundCard(ctx, n, reload) : null,
    doc.resultsState === 'provisional' ? h('div', { class: 'callout', style: 'margin-bottom:12px' }, icon('info'), h('span', null, t('provisionalNote'))) : null,
    !published && built && isStaff() ? h('div', { class: 'callout warn', style: 'margin-bottom:12px' }, icon('alert'), h('span', null, t('draftResultsNote'))) : null,
    tools, body, roundProtests(ctx, n, reload));
}

function roundBody(ctx, n, L, S, built) {
  const doc = ctx.roundDoc(n) || {};
  const ids = (doc.lobbies || {})[L] || [];
  const me = session.user && session.user.uid;
  if (S === 'ROSTER') {
    const absent = new Set(ctx.entries.filter((e) => (e.absences || []).includes(n)).map((e) => e.uid));
    return h('div', { class: 'stack', style: 'gap:8px' }, ids.map((uid) => {
      const p = ctx.snaps[uid] || {}, tm = ctx.tmap[p.teamId];
      return h('a', { class: 'drv-card', href: '#/pilotak/' + encodeURIComponent(p.psnLower || ''), style: uid === me ? 'border-color:var(--accent-text)' : '' }, avatar(p, tm),
        h('span', { class: 'nm' }, h('b', null, fullName(p)), h('span', null, h('span', { class: 'rnum' }, '#' + (p.raceNumber ?? '')), '  ', tm ? tm.name : t('noTeam'), absent.has(uid) ? '  ' + t('cantComeTag') : '')), ratingEl(p));
    }));
  }
  const res = built && built.results[L];
  if (!res) return empty(t('noResultsLobby'));
  if (S === 'GRID') {
    const g = gpGrid(res.Q);
    return frag(h('p', { class: 'muted', style: 'margin:0 0 12px' }, t('gridExplain')),
      h('div', { class: 'grid-sheet' }, g.map((uid, i) => { const p = ctx.snaps[uid] || {}; return h('a', { class: 'grid-slot', href: '#/pilotak/' + encodeURIComponent(p.psnLower || ''), style: uid === me ? 'border-color:var(--accent-text)' : '' }, h('span', { class: 'gp display' }, i + 1), h('span', null, h('b', null, (p.lastName || '').toLocaleUpperCase('hu')), h('span', null, '#' + (p.raceNumber ?? '')))); })));
  }
  return resultsTable(ctx, res[S] || [], L, S, me);
}

export function resultsTable(ctx, rows, L, S, me) {
  const fl = S !== 'Q' ? flHolder(rows) : null;
  const ok = rows.filter((r) => r.status === 'OK');
  const winner = ok[0];
  const pole = S === 'Q' && winner ? winner.best : null;
  const thead = h('tr', null, h('th', { class: 'r' }, ''), h('th', null, t('driver')), h('th', { class: 'r' }, S === 'Q' ? t('lapTime') : t('time')), h('th', { class: 'r hide-sm' }, S === 'Q' ? t('gap') : t('bestLap')), h('th', { class: 'r' }, t('pointsShort')));
  const body = rows.map((r) => {
    const pts = sessionPoints(ctx.points, S, L, r) + (fl === r.id ? ctx.points.fl : 0);
    const timeTxt = S === 'Q' ? fmtLap(r.best) : r.status !== 'OK' ? h('span', { class: 'st ' + r.status.toLowerCase() }, r.status) : r === winner ? fmtRace(r.time) : r.laps ? t('lapsDown', { n: r.laps }) : r.gap != null ? '+' + fmtLap(r.gap) : '–';
    const second = S === 'Q' ? (r === winner || r.best == null || pole == null ? '' : '+' + (r.best - pole).toFixed(3)) : fmtLap(r.best);
    return h('tr', { style: r.id === me ? 'background:var(--accent-soft)' : '' }, h('td', { class: 'p' }, r.status === 'OK' ? r.pos : '–'),
      h('td', { class: 'nm' }, nameCell(ctx, r.id), fl === r.id ? h('span', { class: 'fl', title: t('fastestLap') }, 'FL') : null),
      h('td', { class: 'r' }, timeTxt), h('td', { class: 'r hide-sm' }, second), h('td', { class: 'r', style: 'font-weight:800' }, pts));
  });
  return h('div', { class: 'rtable-wrap' }, h('table', { class: 'rtable' }, h('thead', null, thead), h('tbody', null, body)));
}

/* ---------- admin: round card ---------- */
function adminRoundCard(ctx, n, reload) {
  const s = ctx.season, doc = ctx.roundDoc(n) || {};
  const lobbies = LOBBIES.filter((L) => ((doc.lobbies || {})[L] || []).length);
  const cells = lobbies.map((L) => h('div', { style: 'display:flex;gap:6px;align-items:center;flex-wrap:wrap' }, lobbyBadge(L),
    SESSIONS.map((S) => { const sh = ctx.sheet(n, L, S); const st = sh ? sh.state : 'none'; return h('a', { class: 'btn small', href: `#/admin/eredmeny/${s.id}/${n}/${L}/${S}`, title: t('sheet_' + st) }, S === 'Q' ? t('qShort') : S === 'S' ? 'Sprint' : 'GP', h('span', { class: 'role-tag', style: st === 'published' ? 'background:var(--accent);color:var(--accent-ink);border-color:transparent' : '' }, t('sheetShort_' + st))); })));
  const roundSheets = ctx.sheets.filter((x) => x.n === n);
  const complete = lobbies.length && lobbies.every((L) => SESSIONS.every((S) => ctx.sheet(n, L, S)));
  const publish = isAdmin() && complete && doc.resultsState !== 'final' ? h('button', { class: 'btn primary small', type: 'button', 'data-haptic': '' }, icon('flag'), doc.resultsState === 'provisional' ? t('republish') : t('publishResults')) : null;
  if (publish) publish.addEventListener('click', () => busy(publish, async () => {
    try {
      for (const x of roundSheets) if (x.state !== 'published') await backend.race.sheetSave(s.id, x.id, { state: 'published' });
      await backend.race.roundSave(s.id, n, { resultsState: 'provisional' });
      await audit('round.publish', s, { targetName: `MCSM${s.no} ${t('roundN', { n })}` });
      if (doc.resultsState !== 'provisional') notifySeason(s, 'resultsOut', { n }, `#/szezonok/${s.id}/fordulo/${n}`);
      toast(t('resultsPublished')); haptic(15); reload();
    } catch (e) { toast(t(errorKey(e)), 'alert'); }
  }));
  const finalize = isAdmin() && doc.resultsState === 'provisional' ? h('button', { class: 'btn small', type: 'button' }, icon('check'), t('finalize')) : null;
  if (finalize) finalize.addEventListener('click', () => busy(finalize, async () => { try { await backend.race.roundSave(s.id, n, { resultsState: 'final' }); await audit('round.final', s, { targetName: `MCSM${s.no} ${t('roundN', { n })}` }); toast(t('saved')); reload(); } catch (e) { toast(t(errorKey(e)), 'alert'); } }));
  const reopen = isAdmin() && doc.resultsState === 'final' ? h('button', { class: 'btn small', type: 'button' }, icon('undo'), t('backToProvisional')) : null;
  if (reopen) reopen.addEventListener('click', () => busy(reopen, async () => { try { await backend.race.roundSave(s.id, n, { resultsState: 'provisional' }); toast(t('saved')); reload(); } catch (e) { toast(t(errorKey(e)), 'alert'); } }));
  return h('section', { class: 'panel pad', style: 'margin:4px 0 14px' },
    h('div', { class: 'row-between' }, h('h2', { class: 'display', style: 'font-size:22px' }, t('manageRound')), isAdmin() ? h('a', { class: 'btn small', href: `#/szezonok/${s.id}/fordulo/${n}?szerk=lobbyk` }, icon('grid'), t('editLobbies')) : null),
    lobbies.length ? h('div', { class: 'stack', style: 'gap:8px;margin-top:12px' }, h('div', { class: 'label' }, t('enterResultsFor')), cells) : h('p', { class: 'muted', style: 'margin:10px 0 0' }, t('lobbiesFirst')),
    publish || finalize || reopen ? h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-top:14px' }, publish, finalize, reopen) : null,
    lobbies.length && !complete ? h('p', { class: 'note' }, t('publishNeedsAll')) : null);
}

/* ---------- admin: lobby editor ---------- */
function lobbyEditor(ctx, n, reload) {
  const s = ctx.season, size = s.lobbySize || 16;
  const doc = ctx.roundDoc(n) || {};
  let lobbies = JSON.parse(JSON.stringify(doc.lobbies || { A: [], B: [], C: [] }));
  LOBBIES.forEach((L) => { lobbies[L] = lobbies[L] || []; });
  let flags = new Set();
  const prev = n > 1 ? ctx.built.find((r) => r.n === n - 1) : null;
  const wrap = h('div', { class: 'stack', style: 'gap:16px' });
  const err = h('div');
  const pool = () => {
    const placed = new Set(LOBBIES.flatMap((L) => lobbies[L]));
    return [...ctx.table.inList, ...ctx.table.reserves.filter((e) => e.approved !== false)].filter((e) => !placed.has(e.uid));
  };
  const rowEl = (uid, L) => {
    const p = ctx.snaps[uid] || {}, tm = ctx.tmap[p.teamId];
    const wasL = prev ? lobbyOf(prev.lobbies, uid) : null;
    const mv = wasL && wasL !== L ? (wasL > L ? 'up' : 'down') : null;
    return h('button', { class: 'row-card', type: 'button', dataset: { key: uid }, onclick: () => moveSheet(uid, L) }, avatar(p, tm),
      h('span', { class: 'nm' }, h('b', null, fullName(p)), h('span', null, '#' + (p.raceNumber ?? '') + '  ' + (tm ? tm.name : ''), flags.has(uid) ? '  ' + t('noShowTag') : '')),
      mv ? h('span', { class: 'delta ' + mv, style: 'font-size:12.5px' }, mv === 'up' ? '▲ ' + t('promoted') : '▼ ' + t('relegated')) : null);
  };
  const totals = h('span', { class: 'prog' });
  const draw = (animate) => {
    totals.textContent = t('lobbyTotals', { a: lobbies.A.length, b: lobbies.B.length, c: lobbies.C.length });
    const build = () => wrap.replaceChildren(...LOBBIES.map((L) => h('section', null,
      h('div', { class: 'row-between', style: 'margin-bottom:8px' }, h('div', { style: 'display:flex;gap:10px;align-items:center' }, lobbyBadge(L), h('b', { style: 'font-size:17px' }, t('lobbyX', { l: L }))), h('span', { class: 'faint' + (lobbies[L].length > size ? '' : ''), style: lobbies[L].length > size ? 'color:var(--red);font-weight:700' : '' }, `${lobbies[L].length} / ${size}`)),
      h('div', { class: 'stack', style: 'gap:6px' }, lobbies[L].length ? lobbies[L].map((uid) => rowEl(uid, L)) : [h('div', { class: 'empty', style: 'padding:14px' }, t('emptyLobby'))])),
    ), (() => { const rest = pool(); return rest.length ? h('section', null, h('div', { class: 'label', style: 'margin-bottom:8px' }, t('notInLobby', { n: rest.length })), h('div', { class: 'stack', style: 'gap:6px' }, rest.map((e) => rowEl(e.uid, null)))) : null; })());
    animate ? flip(wrap, build, { stagger: 6 }) : build();
  };
  const moveSheet = (uid, from) => {
    const p = ctx.snaps[uid] || {};
    const go = (to) => { sh.close(true); LOBBIES.forEach((L) => { lobbies[L] = lobbies[L].filter((x) => x !== uid); }); if (to) lobbies[to].push(uid); haptic(8); setTimeout(() => draw(true), 60); };
    const sh = openSheet({ title: fullName(p), body: h('div', { class: 'stack', style: 'gap:8px' },
      LOBBIES.map((L) => h('button', { class: 'menu-item', type: 'button', 'aria-pressed': String(L === from), onclick: () => go(L) }, lobbyBadge(L), t('moveTo', { l: L }))),
      from ? h('button', { class: 'menu-item', type: 'button', style: 'color:var(--red)', onclick: () => go(null) }, icon('close'), t('removeFromLobby')) : null) });
  };
  const proposeBtn = h('button', { class: 'btn small', type: 'button' }, icon('bolt'), n === 1 ? t('proposeFromPq') : t('proposeFromPrev'));
  proposeBtn.addEventListener('click', () => {
    err.replaceChildren();
    if (n === 1) { lobbies = pqProposal(ctx.pqRank, size); flags = new Set(ctx.pqRank.filter((r) => r.missing).map((r) => r.uid)); }
    else {
      if (!prev) { err.replaceChildren(formError(t('prevRoundMissing'))); return; }
      flags = noShows(prev, ctx.entries); lobbies = promoteRelegate(prev, s.promote ?? 2, ctx.points, flags);
    }
    LOBBIES.forEach((L) => { lobbies[L] = lobbies[L] || []; });
    toast(flags.size ? t('proposalFlags', { n: flags.size }) : t('proposalReady'), flags.size ? 'alert' : 'check');
    draw(true);
  });
  const save = (publishIt) => async (btn) => busy(btn, async () => {
    try {
      await backend.race.roundSave(s.id, n, { lobbies, lobbiesPublished: publishIt || !!doc.lobbiesPublished, resultsState: doc.resultsState || 'none' });
      await audit(publishIt ? 'round.lobbies' : 'round.lobbiesDraft', s, { targetName: `MCSM${s.no} ${t('roundN', { n })}` });
      if (publishIt) notifySeason(s, 'lobbiesOut', { n }, `#/szezonok/${s.id}/fordulo/${n}`);
      toast(publishIt ? t('lobbiesPublished') : t('saved')); location.hash = `#/szezonok/${s.id}/fordulo/${n}`;
    } catch (e) { err.replaceChildren(formError(t(errorKey(e)))); }
  });
  const saveBtn = h('button', { class: 'btn', type: 'button' }, icon('check'), t('lobbyDraftShort'));
  saveBtn.addEventListener('click', () => save(false)(saveBtn));
  const pubBtn = h('button', { class: 'btn primary', type: 'button', 'data-haptic': '' }, icon('flag'), t('lobbyPublishShort'));
  pubBtn.addEventListener('click', () => save(true)(pubBtn));
  draw(false);
  return frag(h('h1', { class: 'display page-title' }, t('lobbiesForRound', { n })),
    h('p', { class: 'page-sub' }, n === 1 ? t('lobbyEditorIntro1') : t('lobbyEditorIntroN', { m: s.promote ?? 2 })),
    h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px' }, proposeBtn), err, wrap,
    h('div', { class: 'entry-bar wrap' }, totals, saveBtn, pubBtn));
}

/* ---------- admin: PQ times ---------- */
export function screenPqEntry({ sid, pq }) {
  const root = h('div', { class: 'narrow', style: 'max-width:640px' }, skelRows(6, 54));
  loadRace(sid).then((ctx) => {
    if (!ctx) { root.replaceChildren(empty(t('notFound'))); return; }
    const sess = (ctx.season.pq || []).find((p) => p.id === pq);
    if (!sess) { root.replaceChildren(empty(t('notFound'))); return; }
    const times = { ...((ctx.pqDocs.find((d) => d.id === pq) || {}).times || {}) };
    const other = pqConflicts(ctx.pqDocs, pq);
    const candidates = ctx.table.inList.filter((e) => !e.seeded);
    const list = h('div', { class: 'stack', style: 'gap:6px' });
    const err = h('div');
    const draw = (animate) => {
      const rows = Object.entries(times).sort((a, b) => a[1] - b[1]);
      const build = () => list.replaceChildren(...(rows.length ? rows.map(([uid, tm], i) => { const p = ctx.snaps[uid] || {}; return h('div', { class: 'row-card', dataset: { key: uid } }, h('span', { class: 'display num', style: 'width:28px;font-size:20px;color:var(--ink-3)' }, i + 1), h('span', { class: 'nm' }, h('b', null, fullName(p)), h('span', null, p.psn)), h('b', { class: 'num', style: 'font-size:16px' }, fmtLap(tm)), h('button', { class: 'icon-btn', type: 'button', style: 'color:var(--ink-3)', 'aria-label': t('delete'), onclick: () => { delete times[uid]; fillSel(); draw(true); } }, icon('close'))); }) : [empty(t('noTimesYet'))]));
      animate ? flip(list, build) : build();
    };
    const sel = h('select', { class: 'select', style: 'width:100%;min-height:50px' });
    const fillSel = () => sel.replaceChildren(h('option', { value: '' }, t('pickDriver')), ...candidates.filter((e) => !(e.uid in times)).sort((a, b) => fullName(a.snapshot).localeCompare(fullName(b.snapshot), 'hu')).map((e) => h('option', { value: e.uid, disabled: !!other[e.uid] }, fullName(e.snapshot) + (other[e.uid] ? ` (${t('alreadyIn', { pq: ((ctx.season.pq.find((x) => x.id === other[e.uid]) || {}).name) || '' })})` : ''))));
    fillSel();
    const lapIn = h('input', { class: 'input', inputmode: 'decimal', placeholder: '1:57.234', autocomplete: 'off' });
    const add = h('button', { class: 'btn primary', type: 'button', 'data-haptic': '' }, icon('plus'), t('add'));
    const doAdd = () => { const v = parseLap(lapIn.value); if (!sel.value) { toast(t('pickDriver'), 'alert'); return; } if (v == null) { toast(t('errLapFormat'), 'alert'); lapIn.focus(); return; } times[sel.value] = v; lapIn.value = ''; fillSel(); draw(true); sel.focus(); };
    add.addEventListener('click', doAdd); lapIn.addEventListener('keydown', (e) => { if (e.key === 'Enter') doAdd(); });
    const paste = h('textarea', { class: 'input', placeholder: t('pqPastePh') });
    const pasteBtn = h('button', { class: 'btn small', type: 'button' }, t('readPaste'));
    pasteBtn.addEventListener('click', () => {
      const miss = [];
      paste.value.split('\n').map((l) => l.trim()).filter(Boolean).forEach((line) => {
        const parts = line.split(/[\t;,]+|\s{2,}|\s(?=\d+:)/).map((x) => x.trim()).filter(Boolean);
        const tm = parseLap(parts[parts.length - 1]); const who = parts.slice(0, -1).join(' ').toLowerCase();
        const e = candidates.find((c) => (c.snapshot.psnLower || '') === who) || candidates.find((c) => (c.snapshot.psnLower || '').startsWith(who) && who.length > 3);
        if (!e || tm == null || other[e.uid]) miss.push(line); else times[e.uid] = tm;
      });
      paste.value = miss.join('\n'); fillSel(); draw(true);
      toast(miss.length ? t('pasteMissed', { n: miss.length }) : t('pasteOk'), miss.length ? 'alert' : 'check');
    });
    const save = h('button', { class: 'btn primary', type: 'button', 'data-haptic': '' }, icon('check'), t('save'));
    save.addEventListener('click', () => busy(save, async () => {
      try { await backend.race.pqSave(sid, pq, times); await audit('pq.save', ctx.season, { targetName: `MCSM${ctx.season.no} ${sess.name}` }); toast(t('saved')); history.back(); }
      catch (e) { err.replaceChildren(formError(t(errorKey(e)))); }
    }));
    draw(false);
    root.replaceChildren(pageTitle(t('pqTimesTitle', { pq: sess.name }), `MCSM${ctx.season.no}, ${fmtDate(sess.date, true)}`)[0], h('p', { class: 'page-sub' }, `MCSM${ctx.season.no}, ${fmtDate(sess.date, true)}`),
      err, h('div', { class: 'panel pad stack', style: 'gap:10px;margin-bottom:16px' }, field(t('driver'), sel).row, field(t('bestLap'), lapIn, { hint: t('lapHint') }).row, add),
      list, h('details', { class: 'panel', style: 'padding:0;margin-top:16px' }, h('summary', { style: 'padding:14px 16px;font-weight:700;cursor:pointer' }, t('pasteFromSheet')), h('div', { class: 'stack', style: 'gap:8px;padding:0 16px 16px' }, h('p', { class: 'note', style: 'margin:0' }, t('pqPasteHelp')), paste, pasteBtn)),
      h('div', { class: 'entry-bar' }, h('span', { class: 'prog' }, h('b', null, Object.keys(times).length), ' ', t('timesLabel')), save));
  }).catch(() => root.replaceChildren(empty(t('loadFailed'))));
  return frag(backLink(t('backToSeason'), `#/szezonok/${sid}/pq`), root);
}
