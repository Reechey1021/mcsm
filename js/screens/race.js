// screens/race.js
// Race screens: the season's PQ tab, the round page (results, grid, line-ups),
// the lobby editor (PQ proposal for round 1, promotion/relegation after that),
// round publishing, and PQ time entry.
import { windowState } from '../model/protest.js';
import { h, frag } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { flip, reduced, haptic, moveThumb } from '../core/motion.js';
import { seg, busy, field } from '../ui/controls.js';
import { avatar, ratingEl, empty, backLink, formError, secHead, skelRows, pageTitle, teamBadge } from '../ui/parts.js';
import { openSheet, toast } from '../ui/sheet.js';
import { t, fmtDate } from '../i18n/index.js';
import { backend, errorKey } from '../services/backend.js';
import { session, isAdmin, isStaff } from '../services/session.js';
import { loadRace } from '../core/race-data.js';
import { fullName } from '../model/profile.js';
import { LOBBIES, sessionPoints, flHolder, gpGrid, promoteRelegate, roundTotals, driverStandings, teamStandings } from '../engine/scoring.js';
import { publicRatings, lobbyAverages, fmtRating } from '../services/mcsm-rating.js';
import { buildRecap } from '../model/recap.js';
import { SESSIONS, sheetId, lobbyOf, pqProposal, pqConflicts, noShows, fmtLap, fmtRace, parseLap } from '../model/race.js';
import { roundTitle } from '../data/tracks.js';
import { roundProtests } from './protests.js';
import { notifySeason } from '../services/notify.js';
import { trackDecor } from '../ui/season-parts.js';
import { matchTrack } from '../data/track-match.js';
import { tracks as loadTracks } from '../core/data.js';
import { ROUND_SESSIONS, lobbyFor, pqLobbyFor } from '../data/lobby-settings.js';
import { lobbyView } from '../ui/lobby-editor.js';
import { confirmPublish } from '../ui/confirm.js';
import { aiImportPanel } from '../ui/ai-import.js';
import { lobbySizes, lobbyHost } from '../model/season.js';
import { notifyUsers } from '../services/notify.js';

const audit = (action, s, extra = {}) => backend.audit.add({ action, target: s.id, targetName: 'MCSM' + s.no, before: null, after: null, reason: null, ...extra });
const lobbyBadge = (L) => h('span', { class: 'lobby ' + L }, L);
const nameCell = (ctx, uid) => { const p = ctx.snaps[uid] || {}; return h('a', { href: '#/pilotak/' + encodeURIComponent(p.psnLower || '') }, h('span', { class: 'rnum faint', style: 'display:inline-block;min-width:26px' }, p.raceNumber ?? ''), h('b', null, (p.lastName || '').toLocaleUpperCase('hu')), ' ', h('span', { class: 'hide-sm' }, p.firstName || ''), p.psn ? h('span', { class: 'psn-tag' }, p.psn) : null); };

/* ---------- PQ tab (season page) ---------- */
export function pqTab(st) {
  const box = h('div', null, skelRows(6, 54));
  const pqBtn = h('button', { class: 'btn primary block practice-btn', type: 'button', 'data-haptic': '' }, icon('flag'), t('pqRoom'));
  pqBtn.addEventListener('click', () => pqRoomSheet(st.season));
  loadRace(st.season.id).then((ctx) => {
    const s = ctx.season, sz = lobbySizes(s);
    const cuts = [sz.A, sz.A + sz.B];
    const lobbyAt = (i) => (i < sz.A ? 'A' : i < sz.A + sz.B ? 'B' : 'C');
    const sessions = (s.pq || []).slice().sort((a, b) => a.date - b.date);
    const count = (id) => Object.keys((ctx.pqDocs.find((d) => d.id === id) || {}).times || {}).length;
    const r1 = ctx.roundDoc(1);
    const fastest = (ctx.pqRank.find((r) => r.t) || {}).t;
    const items = [];
    ctx.pqRank.forEach((r, i) => {
      if (cuts.includes(i)) items.push(h('li', { class: 'pq-cut' }, t('lobbyCut', { l: i === cuts[0] ? 'A' : 'B' })));
      const p = ctx.snaps[r.uid] || {}, tm = ctx.tmap[p.teamId];
      const L = r1 && r1.lobbiesPublished ? lobbyOf(r1.lobbies, r.uid) : lobbyAt(i);
      const pqName = r.pq ? ((sessions.find((x) => x.id === r.pq) || {}).name || '') : '';
      items.push(h('li', { dataset: { key: r.uid } }, h('a', { class: 'trow' + (session.user && r.uid === session.user.uid ? ' me' : ''), href: '#/pilotak/' + encodeURIComponent(p.psnLower || '') },
        h('span', { class: 'pos' }, i + 1), h('span'),
        h('span', { class: 'who' }, h('span', { class: 'stripe', vars: { '--t1': tm ? tm.c1 : 'var(--line-2)' } }), h('span', { class: 'nm' }, h('b', null, fullName(p)), h('span', null, p.psn ? h('span', { class: 'psn-tag', style: 'margin:0 8px 0 0' }, p.psn) : null, r.seeded ? t('seededExempt') : r.missing ? t('noPqTime') : pqName))),
        h('span', { class: 'pts' }, L ? lobbyBadge(L) : null, h('b', { style: 'font-size:16px;min-width:78px' }, r.seeded ? '★' : r.t ? fmtLap(r.t) : '–')),
        h('span', { class: 'cols' }, h('span', { style: 'width:84px' }, r.t && fastest && r.t !== fastest ? '+' + (r.t - fastest).toFixed(3) : '')))));
    });
    const ol = h('ol', { class: 'tower' }, items);
    if (!reduced()) requestAnimationFrame(() => [...ol.children].slice(0, 40).forEach((li, i) => li.animate([{ opacity: 0, transform: li.classList.contains('pq-cut') ? 'scaleX(.3)' : 'translateX(-14px)' }, { opacity: 1, transform: 'none' }], { duration: li.classList.contains('pq-cut') ? 500 : 300, delay: i * 14, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'backwards' })));
    box.replaceChildren(
      h('p', { class: 'muted', style: 'margin:6px 0 12px' }, t('pqIntro2', { n: ctx.pqRank.filter((r) => r.seeded).length, size: sz.A })),
      h('div', { class: 'stack', style: 'gap:8px;margin-bottom:16px' }, sessions.map((p) => h('div', { class: 'round-item' }, icon('clock', 'chev'),
        h('span', { class: 't' }, h('b', null, p.name), h('span', { class: 'sub' }, fmtDate(p.date, true), h('span', null, t('nTimes', { n: count(p.id) })))),
        isStaff() ? h('a', { class: 'btn small', href: `#/admin/pq/${s.id}/${p.id}` }, icon('edit'), t('enterTimes')) : null))),
      isAdmin() ? h('div', { style: 'margin-bottom:14px' }, h('a', { class: 'btn', href: `#/szezonok/${s.id}/fordulo/1?szerk=lobbyk` }, icon('grid'), t('round1Lobbies'))) : null,
      ctx.pqRank.length ? h('div', { class: 'tower-wrap' }, ol) : empty(t('noEntries')));
  }).catch(() => box.replaceChildren(empty(t('loadFailed'))));
  return frag(pqBtn, box);
}

/* ---------- round list items (season page) ---------- */
export function roundLink(s, r, docs, next, catalog) {
  const doc = docs.find((d) => d.n === r.n) || {};
  const state = doc.resultsState && doc.resultsState !== 'none' ? doc.resultsState : null;
  return h('a', { class: 'round-item' + (next ? ' next' : ''), href: `#/szezonok/${s.id}/fordulo/${r.n}` }, h('span', { class: 'no display' }, r.n),
    h('span', { class: 't' }, h('b', null, roundTitle(r)), h('span', { class: 'sub' }, fmtDate(r.date, true), r.cc ? h('span', { class: 'cc' }, r.cc) : null,
      state ? h('span', { class: 'status' + (state === 'final' ? '' : ' live') }, t(state === 'final' ? 'stFinal' : 'stProvisional')) : doc.lobbiesPublished ? h('span', { class: 'status' }, t('lobbiesOut')) : null)),
    icon('chevR', 'chev'));
}
export function roundLinkDecorated(s, r, docs, next, catalog) { return trackDecor(roundLink(s, r, docs, next), r, catalog); }

// Round page banner: the track photo behind the title, the layout map beside it.
function roundBanner(info, kids) {
  const el = h('section', { class: 'round-banner' }, h('div', { class: 'rb-body' }, ...kids));
  loadTracks().then((cat) => { const m = matchTrack(info, cat); if (!m) return; if (m.photo) el.prepend(h('span', { class: 'trk-photo', vars: { 'background-image': `url("${m.photo.replace(/"/g, '')}")` } })); if (m.map) el.append(h('img', { class: 'trk-map', src: m.map, alt: '', onerror: (e) => e.target.remove() })); el.classList.add('trk'); }).catch(() => {});
  return el;
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
  const ruiKey = ctx.season.id + ':' + n;
  if (rui.key !== ruiKey || !rui.L || !(doc.lobbies || {})[rui.L]) { rui.key = ruiKey; rui.L = myL || 'A'; }
  if (built && built.legacy) {
    const me = session.user && session.user.uid;
    const fl = built.legacy.find((r) => r.fl);
    return frag(h('div', null, h('div', { class: 'row-between', style: 'flex-wrap:wrap' }, h('h1', { class: 'display page-title' }, t('roundN', { n })), h('span', { class: 'status' }, t(built.state === 'final' ? 'stFinal' : 'stProvisional'))),
      h('div', { style: 'display:flex;gap:8px;align-items:center;font-weight:650;font-size:16px' }, info.cc ? h('span', { class: 'cc' }, info.cc) : null, roundTitle(info)),
      h('p', { class: 'page-sub', style: 'margin-top:4px' }, fmtDate(info.date, true))),
      h('div', { class: 'callout', style: 'margin-bottom:12px' }, icon('info'), h('span', null, t('legacyRoundNote'))),
      h('div', { class: 'rtable-wrap' }, h('table', { class: 'rtable' }, h('thead', null, h('tr', null, h('th', { class: 'r' }, ''), h('th', null, t('driver')), h('th', { class: 'r' }, t('pointsShort')))),
        h('tbody', null, built.legacy.map((r) => h('tr', { style: r.id === me ? 'background:var(--accent-soft)' : '' }, h('td', { class: 'p' }, r.status === 'DNS' ? '–' : r.pos),
          h('td', { class: 'nm' }, nameCell(ctx, r.id), fl && fl.id === r.id ? h('span', { class: 'fl', title: t('fastestLap') }, 'FL') : null, r.status === 'DNS' ? h('span', { class: 'st dns', style: 'margin-left:6px' }, 'DNS') : null),
          h('td', { class: 'r', style: 'font-weight:800' }, r.points)))))));
  }
  const lobbies = LOBBIES.filter((L) => ((doc.lobbies || {})[L] || []).length);
  const statusTxt = doc.resultsState === 'final' ? t('stFinal') : doc.resultsState === 'provisional' ? t('stProvisional') : doc.lobbiesPublished ? t('lobbiesOut') : t('stNext');
  const head = roundBanner(info, [
    h('div', { class: 'round-head-row' }, h('h1', { class: 'display page-title' }, t('roundN', { n })), h('span', { class: 'status' + (doc.resultsState === 'provisional' ? ' live' : '') }, statusTxt)),
    h('div', { style: 'display:flex;gap:8px;align-items:center;font-weight:650;font-size:16px' }, info.cc ? h('span', { class: 'cc' }, info.cc) : null, roundTitle(info)),
    h('p', { class: 'page-sub', style: 'margin-top:4px' }, fmtDate(info.date, true), info.car ? ' · ' + info.car : '')]);
  const body = h('div');
  const sessions = showResults ? [['Q', t('quali')], ['S', 'Sprint'], ['GP', "Gran'Prix"], ['GRID', t('gpGrid')], ['ROSTER', t('roster')]] : [['ROSTER', t('roster')]];
  if (!sessions.some(([k]) => k === rui.S)) rui.S = sessions[0][0];
  const draw = (anim) => {
    body.replaceChildren(roundBody(ctx, n, rui.L, rui.S, built));
    if (anim && !reduced()) body.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 220, easing: 'cubic-bezier(.2,.8,.2,1)' });
  };
  const pills = Object.fromEntries(lobbies.map((L) => [L, h('span', { class: 'mr-pill', style: 'display:none' })]));
  const lobbySeg = seg(lobbies.map((L) => ({ value: L, label: h('span', { class: 'seg-lab' }, h('span', null, t('lobbyX', { l: L }) + (L === myL ? ' •' : '')), pills[L]) })), rui.L, (v) => { rui.L = v; draw(true); }, { label: t('lobby') });
  publicRatings().then((P) => {
    const av = lobbyAverages(P, doc.lobbies, ctx.season.no, n);
    lobbies.forEach((L) => { if (av[L]) { pills[L].textContent = fmtRating(av[L].avg); pills[L].title = t('lobbyAvgOf', { n: av[L].ranked, m: av[L].total }); pills[L].style.display = ''; } });
    const on = lobbySeg.querySelector('[aria-pressed="true"]'); if (on) moveThumb(lobbySeg, on, lobbySeg.querySelector('.thumb'), { instant: true });
  }).catch(() => {});
  const tools = lobbies.length ? h('div', { class: 'stack', style: 'gap:10px;margin-bottom:14px' },
    lobbySeg,
    seg(sessions.map(([value, label]) => ({ value, label })), rui.S, (v) => { rui.S = v; draw(true); }, { scroll: true, label: t('session') })) : null;
  if (lobbies.length) draw(); else body.replaceChildren(empty(t('noLobbiesYet')));
  const started = (info.date && Date.now() >= info.date) || windowState(info, doc) === 'open';
  const racing = session.user && ctx.entries.some((e) => e.uid === session.user.uid && e.status !== 'withdrawn');
  const finalBox = doc.resultsState === 'final' ? myRoundSummary(ctx, n, built) : null;
  const practice = finalBox ? finalBox : started && (racing || isAdmin())
    ? h('a', { class: 'btn block practice-btn protest-btn', href: `#/szezonok/${ctx.season.id}/fordulo/${n}/ovas`, 'data-haptic': '' }, icon('flag'), t('startProtest'))
    : h('button', { class: 'btn primary block practice-btn', type: 'button', 'data-haptic': '', onclick: () => practiceSheet(info, ctx.season) }, icon('flag'), t('practiceRoom'));
  const myLobby = session.user && doc.lobbiesPublished ? lobbyOf(doc.lobbies || {}, session.user.uid) : null;
  const hostUid = myLobby ? lobbyHost(ctx.season, myLobby) : null;
  const hostP = hostUid ? ctx.person(hostUid) : null;
  const hostNote = hostP && hostUid !== session.user.uid ? h('div', { class: 'callout', style: 'margin:-4px 0 14px' }, icon('users'), h('span', null, h('b', { style: 'display:block' }, t('yourHost', { l: myLobby, name: fullName(hostP) || hostP.psn || '?' })), t('addHostOnPsn', { psn: hostP.psn || '?' }))) : null;
  return frag(head, practice, hostNote, isStaff() ? adminRoundCard(ctx, n, reload) : null,
    doc.resultsState === 'provisional' ? h('div', { class: 'callout', style: 'margin-bottom:12px' }, icon('info'), h('span', null, t('provisionalNote'))) : null,
    !published && built && isStaff() ? h('div', { class: 'callout warn', style: 'margin-bottom:12px' }, icon('alert'), h('span', null, t('draftResultsNote'))) : null,
    doc.resultsState === 'final' ? driverOfTheRound(ctx, n) : null, tools, body, roundProtests(ctx, n, reload));
}

function roundBody(ctx, n, L, S, built) {
  const doc = ctx.roundDoc(n) || {};
  const ids = (doc.lobbies || {})[L] || [];
  const me = session.user && session.user.uid;
  if (S === 'ROSTER') {
    const absent = new Set(ctx.entries.filter((e) => (e.absences || []).includes(n)).map((e) => e.uid));
    return h('div', { class: 'stack', style: 'gap:8px' }, ...ids.map((uid) => {
      const p = ctx.person(uid), tm = ctx.tmap[p.teamId];
      return h('a', { class: 'drv-card', href: '#/pilotak/' + encodeURIComponent(p.psnLower || ''), style: uid === me ? 'border-color:var(--accent-text)' : '' }, avatar(p, tm),
        h('span', { class: 'nm' }, h('b', null, fullName(p)), h('span', null, h('span', { class: 'rnum' }, '#' + (p.raceNumber ?? '')), p.psn ? h('span', { class: 'psn-tag' }, p.psn) : null, '  ', tm ? tm.name : t('noTeam'), absent.has(uid) ? '  ' + t('cantComeTag') : '')), ratingEl(p));
    }));
  }
  const res = built && built.results[L];
  if (!res) return empty(t('noResultsLobby'));
  if (S === 'GRID') {
    const g = gpGrid(res.Q);
    return frag(h('p', { class: 'muted', style: 'margin:0 0 12px' }, t('gridExplain')),
      h('div', { class: 'grid-sheet' }, g.map((uid, i) => { const p = ctx.person(uid), tm = ctx.tmap[p.teamId]; return h('a', { class: 'grid-slot' + (i % 2 ? ' right' : ''), href: '#/pilotak/' + encodeURIComponent(p.psnLower || ''), style: uid === me ? 'border-color:var(--accent-text)' : '' },
        h('span', { class: 'gp display' }, i + 1), avatar(p, tm), h('span', { class: 'gs-nm' }, h('b', null, (p.lastName || '').toLocaleUpperCase('hu'), ' ', h('span', { class: 'gs-first' }, p.firstName || '')), h('span', null, '#' + (p.raceNumber ?? ''), p.psn ? h('span', { class: 'psn-tag' }, p.psn) : null))); })));
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
    const penTag = r.penalty ? h('span', { class: 'pen-tag', title: t('penaltyApplied', { s: r.penalty }) }, '+' + r.penalty + ' ' + t('secShort')) : null;
    const second = S === 'Q' ? (r === winner || r.best == null || pole == null ? '' : '+' + (r.best - pole).toFixed(3)) : fmtLap(r.best);
    return h('tr', { style: r.id === me ? 'background:var(--accent-soft)' : '' }, h('td', { class: 'p' }, r.status === 'OK' ? r.pos : '–'),
      h('td', { class: 'nm' }, nameCell(ctx, r.id), r.penalty ? h('span', { class: 'pen-dot', title: t('penaltyApplied', { s: r.penalty }) }) : null, fl === r.id ? h('span', { class: 'fl', title: t('fastestLap') }, 'FL') : null),
      h('td', { class: 'r' }, timeTxt, penTag), h('td', { class: 'r hide-sm' }, second), h('td', { class: 'r', style: 'font-weight:800' }, pts));
  });
  return h('div', { class: 'rtable-wrap' }, h('table', { class: 'rtable' }, h('thead', null, thead), h('tbody', null, body)));
}

/* ---------- practice room settings ---------- */
export function practiceSheet(info, season) {
  openSheet({ title: t('practiceRoom'), body: frag(h('p', { class: 'muted', style: 'margin:0 0 12px' }, `MCSM${season.no}, ${t('roundN', { n: info.n })}: ${roundTitle(info)}${info.car ? ' · ' + info.car : ''}`), lobbyView(lobbyFor(info), ROUND_SESSIONS)) });
}
export function pqRoomSheet(season) {
  openSheet({ title: t('pqRoom'), body: frag(h('p', { class: 'muted', style: 'margin:0 0 12px' }, `MCSM${season.no} · ${t('lobbySes_pq')}`), lobbyView({ pq: pqLobbyFor(season) }, ['pq'])) });
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
  if (publish) publish.addEventListener('click', async () => { if (!(await confirmPublish({ text: doc.resultsState === 'provisional' ? t('confirmResultsAgain', { n }) : t('confirmResults', { n }), draftHint: false }))) return; busy(publish, async () => {
    try {
      for (const x of roundSheets) if (x.state !== 'published') await backend.race.sheetSave(s.id, x.id, { state: 'published' });
      await backend.race.roundSave(s.id, n, { resultsState: 'provisional' });
      await audit('round.publish', s, { targetName: `MCSM${s.no} ${t('roundN', { n })}` });
      if (doc.resultsState !== 'provisional') notifySeason(s, 'resultsOut', { n }, `#/szezonok/${s.id}/fordulo/${n}`);
      toast(t('resultsPublished')); haptic(15); reload();
    } catch (e) { toast(t(errorKey(e)), 'alert'); }
  }); });
  const finalize = isAdmin() && doc.resultsState === 'provisional' ? h('button', { class: 'btn small', type: 'button' }, icon('check'), t('finalize')) : null;
  if (finalize) finalize.addEventListener('click', () => busy(finalize, async () => { try { await backend.race.roundSave(s.id, n, { resultsState: 'final' }); if (isAdmin()) import('../services/mcsm-rating.js').then((m) => m.computeAndPublish({ recap: { sid: s.id, n } })).catch(() => {}); await audit('round.final', s, { targetName: `MCSM${s.no} ${t('roundN', { n })}` }); toast(t('saved')); reload(); } catch (e) { toast(t(errorKey(e)), 'alert'); } }));
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
  const s = ctx.season, sz = lobbySizes(s), size = sz;
  const pqOf = Object.fromEntries((ctx.pqRank || []).map((r, i) => [r.uid, { t: r.t, seeded: r.seeded, pos: i + 1 }]));
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
    return h('button', { class: 'row-card lobby-row', type: 'button', dataset: { key: uid }, onclick: () => moveSheet(uid, L) }, avatar(p, tm),
      h('span', { class: 'nm' }, h('b', null, fullName(p)), h('span', null, '#' + (p.raceNumber ?? ''), p.psn ? h('span', { class: 'psn-tag' }, p.psn) : null, tm ? '  · ' + tm.name : '', flags.has(uid) ? '  ' + t('noShowTag') : '')),
      pqOf[uid] ? h('span', { class: 'pq-chip' }, pqOf[uid].seeded ? '★' : pqOf[uid].t ? fmtLap(pqOf[uid].t) : '–', h('small', null, 'P' + pqOf[uid].pos)) : null,
      mv ? h('span', { class: 'mv-arrow ' + mv, title: mv === 'up' ? t('promoted') : t('relegated'), 'aria-label': mv === 'up' ? t('promoted') : t('relegated') }, mv === 'up' ? '▲' : '▼') : null);
  };
  const totals = h('span', { class: 'prog' });
  const draw = (animate) => {
    totals.textContent = t('lobbyTotals', { a: lobbies.A.length, b: lobbies.B.length, c: lobbies.C.length });
    const build = () => wrap.replaceChildren(...LOBBIES.map((L) => h('section', null,
      h('div', { class: 'row-between', style: 'margin-bottom:8px' }, h('div', { style: 'display:flex;gap:10px;align-items:center' }, lobbyBadge(L), h('b', { style: 'font-size:17px' }, t('lobbyX', { l: L })), lobbies[L].length ? lobbyAverage(lobbies[L]) : null), h('span', { class: 'faint', style: lobbies[L].length > sz[L] ? 'color:var(--red);font-weight:700' : '' }, `${lobbies[L].length} / ${sz[L]}`, lobbyHost(s, L) ? ` · host: ${fullName(ctx.person(lobbyHost(s, L))) || '?'}` : '')),
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
  const save = (publishIt) => async (btn) => {
    if (publishIt && !(await confirmPublish({ text: t('confirmLobbies', { n }) }))) return;
    return busy(btn, async () => {
    try {
      await backend.race.roundSave(s.id, n, { lobbies, lobbiesPublished: publishIt || !!doc.lobbiesPublished, resultsState: doc.resultsState || 'none' });
      await audit(publishIt ? 'round.lobbies' : 'round.lobbiesDraft', s, { targetName: `MCSM${s.no} ${t('roundN', { n })}` });
      if (publishIt) {
        notifySeason(s, 'lobbiesOut', { n }, `#/szezonok/${s.id}/fordulo/${n}`);
        LOBBIES.forEach((L) => { const hu = lobbyHost(s, L); const hp = hu ? ctx.person(hu) : null; if (hp && lobbies[L].length) notifyUsers(lobbies[L].filter((u) => u !== hu), 'lobbyHost', { n, l: L, name: fullName(hp), psn: hp.psn || '' }, `#/szezonok/${s.id}/fordulo/${n}`); });
      }
      toast(publishIt ? t('lobbiesPublished') : t('saved')); location.hash = `#/szezonok/${s.id}/fordulo/${n}`;
    } catch (e) { err.replaceChildren(formError(t(errorKey(e)))); }
    });
  };
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
    const countEl = h('b', null, '0');
    const draw = (animate) => {
      const rows = Object.entries(times).sort((a, b) => a[1] - b[1]);
      countEl.textContent = String(rows.length);
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
    const pqPeople = candidates.map((e) => ({ uid: e.uid, psn: e.snapshot.psn || '', firstName: e.snapshot.firstName || '', lastName: e.snapshot.lastName || '' }));
    const ai = aiImportPanel({ session: 'PQ', people: pqPeople, onApply: (rows) => {
      let n = 0;
      rows.forEach((r) => { const v = parseLap(r.bestLap); if (v != null && !other[r.uid]) { times[r.uid] = v; n++; } });
      fillSel(); draw(true); void n;
    } });
    const save = h('button', { class: 'btn primary', type: 'button', 'data-haptic': '' }, icon('check'), t('save'));
    save.addEventListener('click', () => busy(save, async () => {
      try { await backend.race.pqSave(sid, pq, times); await audit('pq.save', ctx.season, { targetName: `MCSM${ctx.season.no} ${sess.name}` }); toast(t('saved')); history.back(); }
      catch (e) { err.replaceChildren(formError(t(errorKey(e)))); }
    }));
    draw(false);
    root.replaceChildren(pageTitle(t('pqTimesTitle', { pq: sess.name }), `MCSM${ctx.season.no}, ${fmtDate(sess.date, true)}`)[0], h('p', { class: 'page-sub' }, `MCSM${ctx.season.no}, ${fmtDate(sess.date, true)}`),
      err, h('div', { style: 'margin-bottom:16px' }, ai), h('div', { class: 'panel pad stack', style: 'gap:10px;margin-bottom:16px' }, field(t('driver'), sel).row, field(t('bestLap'), lapIn, { hint: t('lapHint') }).row, add),
      list, h('details', { class: 'panel', style: 'padding:0;margin-top:16px' }, h('summary', { style: 'padding:14px 16px;font-weight:700;cursor:pointer' }, t('pasteFromSheet')), h('div', { class: 'stack', style: 'gap:8px;padding:0 16px 16px' }, h('p', { class: 'note', style: 'margin:0' }, t('pqPasteHelp')), paste, pasteBtn)),
      h('div', { class: 'entry-bar' }, h('span', { class: 'prog' }, countEl, ' ', t('timesLabel')), save));
  }).catch(() => root.replaceChildren(empty(t('loadFailed'))));
  return frag(backLink(t('backToSeason'), `#/szezonok/${sid}/pq`), root);
}

// The average MCSM Rating of the ranked drivers in a lobby (filled in once the ratings load).
function lobbyAverage(ids) {
  const el = h('span', { class: 'mr-pill', style: 'display:none' });
  publicRatings().then((P) => {
    const vals = ids.map((u) => (P.drivers || {})[u]).filter((x) => x && x.e).map((x) => x.r);
    if (!vals.length) return;
    el.textContent = fmtRating(vals.reduce((a, b) => a + b, 0) / vals.length); el.title = t('lobbyAvgOf', { n: vals.length, m: ids.length }); el.style.display = '';
  }).catch(() => {});
  return el;
}

// Results are final: a box with the signed-in driver's own round (only if they raced it).
function myRoundSummary(ctx, n, built) {
  const uid = session.user && session.user.uid;
  const recapBtn = h('button', { class: 'btn small primary fh-recap', type: 'button', style: 'display:none' }, icon('bolt'), t('recapBtn'));
  const box = h('section', { class: 'panel final-box' }, h('div', { class: 'final-head' },
    h('span', { class: 'fh-ic' }, icon('check')),
    h('span', { class: 'fh-txt' }, h('b', null, t('resultsFinalTitle')), h('small', null, `MCSM${ctx.season.no} · ${t('roundN', { n })}`)),
    recapBtn));
  if (uid) publicRatings().then((P) => {
    const note = buildRecap(ctx, n, uid, P, { calibRounds: 3 });
    if (!note) return;
    recapBtn.style.display = '';
    recapBtn.addEventListener('click', () => import('../ui/rank-reveal.js').then((m) => m.playRecap(note)));
  }).catch(() => {});
  if (!uid || !built) return box;
  const idx = ctx.built.findIndex((r) => r.n === n);
  const rd = ctx.built[idx];
  const tot = rd ? roundTotals(rd, ctx.points)[uid] : null;
  if (!tot) return box;
  const p = ctx.person(uid), tm = ctx.tmap[p.teamId];
  const upTo = ctx.built.slice(0, idx + 1);
  const ds = driverStandings(upTo, ctx.ids, { table: ctx.points });
  const myPos = ds.findIndex((r) => r.id === uid) + 1, myRow = ds[myPos - 1];
  const ts = p.teamId ? teamStandings(upTo, ctx.teams, { table: ctx.points }) : [];
  const tPos = ts.findIndex((r) => r.id === p.teamId) + 1, tRow = ts[tPos - 1];
  const teamRound = p.teamId ? Object.entries(roundTotals(rd, ctx.points)).filter(([id]) => (ctx.snaps[id] || {}).teamId === p.teamId).reduce((a, [, x]) => a + (x.total || 0), 0) : null;
  const res = (S, pos, pts) => h('div', { class: 'fs-cell' }, h('span', { class: 'k' }, S), h('b', null, pos ? 'P' + pos : '–'), h('small', null, (pts ?? 0) + ' ' + t('pointsShort')));
  const mr = h('div', { class: 'fs-cell' }, h('span', { class: 'k' }, 'MCSM Rating'), h('b', null, '…'), h('small', null, ''));
  publicRatings().then((P) => {
    const x = (P.drivers || {})[uid];
    const label = `MCSM${ctx.season.no} / ${n}`;
    const hist = x && x.e ? (x.h || []).map((e) => (Array.isArray(e) ? { l: e[0], r: e[1] } : e)) : [];
    const i = hist.findIndex((e) => e.l === label);
    if (i > 0) { const d = hist[i].r - hist[i - 1].r; mr.children[1].textContent = (d >= 0 ? '+' : '−') + (Math.round(Math.abs(d) * 10) / 10).toFixed(1).replace('.', ','); mr.children[1].className = d >= 0 ? 'up' : 'down'; mr.children[2].textContent = (Math.round(hist[i].r * 10) / 10).toFixed(1).replace('.', ','); }
    else { mr.children[1].textContent = x && x.e ? '–' : t('mrUnranked'); }
  }).catch(() => { mr.children[1].textContent = '–'; });
  box.append(
    h('div', { class: 'fs-who' }, avatar(p, tm), h('span', { class: 'nm' }, h('b', null, fullName(p)), h('span', null, '#' + (p.raceNumber ?? ''), p.psn ? h('span', { class: 'psn-tag' }, p.psn) : null, tot.lobby ? ' · ' + t('lobbyX', { l: tot.lobby }) : ''))),
    h('div', { class: 'fs-grid' }, res(t('quali'), tot.qPos, tot.q), res('Sprint', tot.sPos, tot.s), res("Gran'Prix", tot.gpPos, tot.gp), mr),
    h('div', { class: 'fs-grid fs-2' },
      h('div', { class: 'fs-cell' }, h('span', { class: 'k' }, t('fsRoundTotal')), h('b', null, tot.total), h('small', null, t('pointsShort'))),
      h('div', { class: 'fs-cell' }, h('span', { class: 'k' }, t('fsChampionship')), h('b', null, myPos ? myPos + '.' : '–'), h('small', null, (myRow ? myRow.total : 0) + ' ' + t('pointsShort'))),
      tm ? h('div', { class: 'fs-cell' }, h('span', { class: 'k' }, tm.name), h('b', null, tPos ? tPos + '.' : '–'), h('small', null, t('fsTeamRound', { n: teamRound ?? 0, total: tRow ? tRow.total : 0 }))) : null));
  return box;
}

// "A forduló pilótája": whoever gained the most MCSM Rating in this round, across all lobbies.
// Ranked drivers only (their first round as a ranked driver has no change, so it doesn't count).
function driverOfTheRound(ctx, n) {
  const box = h('section', { class: 'dotr', style: 'display:none' });
  const label = `MCSM${ctx.season.no} / ${n}`;
  publicRatings().then((P) => {
    let best = null;
    Object.entries(P.drivers || {}).forEach(([uid, x]) => {
      if (!x || !x.e || !ctx.snaps[uid]) return;
      const hist = (x.h || []).map((e) => (Array.isArray(e) ? { l: e[0], r: e[1] } : e));
      const i = hist.findIndex((e) => e.l === label);
      if (i < 1) return;
      const gain = hist[i].r - hist[i - 1].r;
      if (gain > 0 && (!best || gain > best.gain)) best = { uid, gain, after: hist[i].r };
    });
    if (!best) { box.remove(); return; }
    const p = ctx.person(best.uid), tm = ctx.tmap[p.teamId];
    const rd = ctx.built.find((r) => r.n === n);
    const tot = rd ? roundTotals(rd, ctx.points)[best.uid] : null;
    const fmt = (v) => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
    const res = (k, v) => h('span', { class: 'dotr-res' }, h('small', null, k), h('b', null, v ? 'P' + v : '–'));
    box.replaceChildren(
      h('div', { class: 'dotr-head' }, h('span', { class: 'dotr-star' }, icon('bolt')), h('b', null, t('dotrTitle')), h('span', { class: 'dotr-sub' }, t('dotrSub'))),
      h('a', { class: 'dotr-main', href: '#/pilotak/' + encodeURIComponent(p.psnLower || '') },
        avatar(p, tm, 'lg'),
        h('span', { class: 'dotr-who' },
          h('b', { class: 'dotr-name' }, fullName(p)),
          h('span', { class: 'dotr-meta' }, '#' + (p.raceNumber ?? ''), p.psn ? h('span', { class: 'psn-tag' }, p.psn) : null),
          tm ? h('span', { class: 'dotr-team' }, teamBadge(tm, 16), tm.name) : null,
          tot ? h('span', { class: 'dotr-results' }, tot.lobby ? h('span', { class: 'lobby ' + tot.lobby }, tot.lobby) : null, res(t('quali'), tot.qPos), res('Sprint', tot.sPos), res('GP', tot.gpPos)) : null),
        h('span', { class: 'dotr-gain' }, h('b', { class: 'display' }, '+' + fmt(best.gain)), h('small', null, 'MCSM Rating'), h('span', { class: 'mr-pill' }, fmt(best.after)))));
    box.style.display = '';
    if (!reduced()) box.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], { duration: 360, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }).catch(() => box.remove());
  return box;
}
