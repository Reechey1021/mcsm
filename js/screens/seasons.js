// screens/seasons.js
// Season list, the season page (overview, entry list, rounds) and everything a driver
// does with an entry: enter, join the waitlist, sign up as a reserve, withdraw, rejoin,
// and say "can't make it" for a round. Admin tools live in ./season-admin.js.
import { publicDriverDirectory } from '../core/data.js';
import { h, frag } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { flip, reduced, countUp, haptic } from '../core/motion.js';
import { seg, toggle, busy, choice } from '../ui/controls.js';
import { avatar, ratingEl, pageTitle, skelRows, empty, backLink, formError, secHead } from '../ui/parts.js';
import { seasonCover, seasonPill, seasonCard, seasonTitle, carLine, roundRow } from '../ui/season-parts.js';
import { openSheet, toast } from '../ui/sheet.js';
import { t, fmtDate, relTime } from '../i18n/index.js';
import { backend, errorKey } from '../services/backend.js';
import { session, signedIn, isAdmin } from '../services/session.js';
import { seasons as loadSeasons, teamMap, gtTeams, invalidateSeason } from '../core/data.js';
import { fullName } from '../model/profile.js';
import { regStatus, reserveMode, entryTable, entryBlocker, snapshotOf, nextRound, LIVE_STATES } from '../model/season.js';
import { roundTitle } from '../data/tracks.js';
import { adminSeasonCard, adminEntrySheet, addDriverSheet, exportCsv } from './season-admin.js';
import { go } from '../router.js';
import { pqTab, roundLink, roundLinkDecorated } from './race.js';
import { tracks as loadTracks } from '../core/data.js';
import { seasonPodiums } from '../ui/podium.js';
import { protestsTab } from './protests.js';
import { specSection } from './spec.js';
import { standingsBlock } from '../ui/tower.js';
import { notifyUsers, adminUids } from '../services/notify.js';
import { loadRace } from '../core/race-data.js';

/* ---------- list ---------- */
export function screenSeasons() {
  const box = h('div', null, skelRows(3, 220));
  Promise.all([loadSeasons(), loadTracks()]).then(([all, cat]) => {
    const live = all.filter((s) => LIVE_STATES.includes(s.state)).sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.no - a.no);
    const drafts = all.filter((s) => s.state === 'draft');
    const past = all.filter((s) => ['finished', 'archived'].includes(s.state));
    box.replaceChildren(...[
      isAdmin() ? h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:16px' }, h('a', { class: 'btn primary', href: '#/admin/szezon/uj' + (all[0] ? '?masol=' + all[0].id : ''), 'data-haptic': '' }, icon('plus'), t('newSeason'))) : null,
      live.length ? h('div', { class: 'season-list' }, live.map((s) => seasonCard(s, null, cat))) : empty(t('noLiveSeasons')),
      drafts.length ? frag(secHead(t('drafts')), h('div', { class: 'season-list' }, drafts.map((s) => seasonCard(s, null, cat)))) : null,
      past.length ? frag(secHead(t('archive')), h('div', { class: 'season-list' }, past.map((s) => seasonCard(s, null, cat)))) : null,
    ].filter(Boolean));
  }).catch(() => box.replaceChildren(empty(t('loadFailed'))));
  return frag(pageTitle(t('seasons'), t('seasonsSub')), box);
}

/* ---------- season page ---------- */
const TABS = ['attekintes', 'nevezesek', 'fordulok', 'pq', 'tabella', 'ovasok'];
const ui = { entryFilter: 'all' };

export function screenSeason({ id, tab }) {
  const root = h('div', null, skelRows(1, 260), h('div', { style: 'height:16px' }), skelRows(3, 70));
  let state = null;
  const load = async () => {
    const [season, list, tmap, gts, cat] = await Promise.all([backend.seasons.get(id), backend.entries.list(id), teamMap(), gtTeams(), loadTracks()]);
    if (!season) { root.replaceChildren(empty(t('notFound'))); return; }
    state = { season, entries: list, tmap, gts, table: entryTable(season, list), cat };
    paint();
  };
  let curTab = TABS.includes(tab) ? tab : 'attekintes';
  const content = h('div');
  const reload = async () => { invalidateSeason(id); await load(); };
  function paintTab(dir) {
    content.replaceChildren(TAB_RENDER[curTab](state, reload));
    if (dir && !reduced()) content.animate([{ opacity: 0, transform: `translateX(${dir * 22}px)` }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
  }
  function paint() {
    const s = state.season;
    const tabs = seg(TABS.map((k) => ({ value: k, label: t('tab_' + k) })), curTab, (k) => {
      const dir = TABS.indexOf(k) > TABS.indexOf(curTab) ? 1 : -1; curTab = k;
      history.replaceState(null, '', `#/szezonok/${id}/${k}`);
      paintTab(dir);
    }, { scroll: true, label: t('seasonSections') });
    paintTab();
    root.replaceChildren(seasonHero(state), h('div', { class: 'tabs-sticky' }, tabs), content);
  }
  load().catch(() => root.replaceChildren(empty(t('loadFailed'))));
  return frag(backLink(t('seasons'), '#/szezonok'), root);
}

function seasonHero({ season: s, table, cat }) {
  const filled = table.inList.length;
  const kerb = h('div', { class: 'kerb', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(s.cap), 'aria-valuenow': String(filled) }, h('i', { style: `width:${Math.min(100, (filled / (s.cap || 1)) * 100)}%` }));
  if (!reduced()) requestAnimationFrame(() => kerb.firstChild.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: 900, easing: 'cubic-bezier(.2,.8,.2,1)' }));
  const champs = [t('champDrivers'), s.championships && s.championships.teams ? t('champTeams') : null, ...((s.championships && s.championships.gt) || [])].filter(Boolean).join(', ');
  return h('section', { class: 'season-hero' }, seasonCover(s, 'img', cat),
    h('div', { class: 'body' }, seasonPill(s),
      h('h1', { class: 'display' }, 'MCSM' + s.no, h('br'), s.name || t('untitled')),
      h('dl', { class: 'facts' },
        h('dt', null, t('format')), h('dd', null, t('format_' + s.format)),
        h('dt', null, t('car')), h('dd', null, carLine(s)),
        h('dt', null, t('rounds')), h('dd', null, String((s.rounds || []).length)),
        h('dt', null, t('lobbySizeShort')), h('dd', null, t('perLobby', { n: s.lobbySize })),
        h('dt', null, t('championships')), h('dd', null, champs),
        h('dt', null, t('entries')), h('dd', null, h('div', { class: 'row-between', style: 'margin-bottom:6px' }, h('span', null, `${filled} / ${s.cap}`), table.full ? h('span', { style: 'color:#FF6B6E' }, t('full')) : null), kerb))));
}

/* ---------- tabs ---------- */
const TAB_RENDER = {
  attekintes(st, reload) {
    const s = st.season;
    const pq = (s.pq || []).slice().sort((a, b) => a.date - b.date);
    const nr = nextRound(s);
    return frag(
      ['finished', 'archived'].includes(s.state) ? seasonPodiums(s, st.tmap) : null,
      isAdmin() ? adminSeasonCard(st, reload) : null,
      registrationCard(st, reload),
      s.description ? h('p', { class: 'muted', style: 'margin:18px 0 0;white-space:pre-line' }, s.description) : null,
      specSection(st),
      secHead(t('rounds')), roundsBox(st),
      pq.length ? frag(secHead(t('pqSessions')), h('div', { class: 'stack', style: 'gap:8px' }, pq.map((p) => h('div', { class: 'round-item' }, icon('clock', 'chev'), h('span', { class: 't' }, h('b', null, p.name), h('span', { class: 'sub' }, fmtDate(p.date, true))))))) : null);
  },
  nevezesek(st, reload) {
    const list = h('div', { class: 'stack', style: 'gap:8px' });
    const counts = h('span', { class: 'faint' });
    const draw = (animate) => {
      const { table, tmap } = st;
      const f = ui.entryFilter;
      const rows = [];
      if (f === 'all' || f === 'drivers') table.inList.forEach((e, i) => rows.push(entryRow(e, i + 1, 'in', tmap, st, reload)));
      if ((f === 'all' || f === 'waitlist') && table.waitlist.length) {
        if (f === 'all') rows.push(h('div', { class: 'cut', 'data-key': 'cut-wait' }, t('waitlistCut')));
        table.waitlist.forEach((e, i) => rows.push(entryRow(e, i + 1, 'waitlist', tmap, st, reload)));
      }
      if ((f === 'all' || f === 'reserves') && table.reserves.length) {
        if (f === 'all') rows.push(h('div', { class: 'cut', 'data-key': 'cut-res' }, t('reservesCut')));
        table.reserves.forEach((e, i) => rows.push(entryRow(e, i + 1, e.approved === false ? 'pending' : 'reserve', tmap, st, reload)));
      }
      counts.textContent = t('entryCounts', { n: table.inList.length, cap: st.season.cap, w: table.waitlist.length, r: table.reserves.length });
      const build = () => list.replaceChildren(...(rows.length ? rows : [empty(t('noEntries'))]));
      animate ? flip(list, build, { stagger: 8 }) : build();
    };
    const filter = seg([['all', t('all')], ['drivers', t('filterDrivers')], ['waitlist', t('es_waitlist')], ['reserves', t('filterReserves')]].map(([value, label]) => ({ value, label })), ui.entryFilter, (v) => { ui.entryFilter = v; draw(true); }, { scroll: true });
    draw(false);
    if (!Object.keys(photos).length) publicDriverDirectory().then((list) => { list.forEach((u) => { if (u.gt7Avatar) photos[u.uid] = u.gt7Avatar; }); if (list.length && list.isConnected !== false) draw(false); }).catch(() => {});
    const adminTools = isAdmin() ? h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' },
      h('button', { class: 'btn small', type: 'button', onclick: () => addDriverSheet(st, reload) }, icon('plus'), t('addDriver')),
      h('button', { class: 'btn small', type: 'button', onclick: () => exportCsv(st) }, icon('list'), 'CSV')) : null;
    return frag(h('div', { class: 'stack', style: 'gap:10px;margin:6px 0 12px' }, filter, h('div', { class: 'row-between' }, counts, adminTools)), list);
  },
  fordulok(st) { return h('div', { style: 'margin-top:6px' }, roundsBox(st)); },
  pq(st) { return pqTab(st); },
  tabella(st) {
    const box = h('div', { style: 'margin-top:6px' }, skelRows(8, 54));
    loadRace(st.season.id).then((ctx) => box.replaceChildren(ctx && ctx.built.length ? standingsBlock(ctx, tabUi, seg) : empty(t('noResultsYet')))).catch(() => box.replaceChildren(empty(t('loadFailed'))));
    return box;
  },
  ovasok(st) { return protestsTab(st); },
};

const tabUi = { kind: 'drivers', upTo: null };
function roundsBox(st) {
  const s = st.season, nr = nextRound(s);
  if (!(s.rounds || []).length) return empty(t('noRounds'));
  const box = h('div', { class: 'stack', style: 'gap:10px' }, s.rounds.map((r) => roundRow(r, { next: nr && nr.n === r.n })));
  Promise.all([backend.race.roundsList(s.id, { staff: isAdmin() }), loadTracks()]).then(([docs, cat]) => box.replaceChildren(...s.rounds.map((r) => roundLinkDecorated(s, r, docs, nr && nr.n === r.n, cat)))).catch(() => {});
  return box;
}

const photos = {};
function entryRow(e, pos, kind, tmap, st, reload) {
  const p = { ...(e.snapshot || {}), gt7Avatar: photos[e.uid] || (e.snapshot || {}).gt7Avatar };
  const tm = tmap[p.teamId];
  const mine = session.user && e.uid === session.user.uid;
  const tag = kind === 'in' ? null : h('span', { class: 'status' }, t('es_' + kind));
  const attrs = { class: 'entry-row' + (kind === 'waitlist' ? ' waitlist' : ''), dataset: { key: e.uid }, style: mine ? 'border-color:var(--accent-text)' : '' };
  const inner = [h('span', { class: 'ep' }, kind === 'in' ? pos : kind === 'waitlist' ? 'V' + pos : 'T'), avatar(p, tm),
    h('span', { class: 'nm' }, h('b', null, fullName(p), e.seeded ? h('span', { class: 'star', title: t('seeded') }, '★') : null), h('span', null, h('span', { class: 'rnum' }, '#' + (p.raceNumber ?? '–')), '  ', tm ? tm.name : t('noTeam'), e.absences && e.absences.length ? '  ' + t('absentRounds', { r: e.absences.join(', ') }) : '')),
    tag || ratingEl(p)];
  if (isAdmin()) return h('button', { ...attrs, type: 'button', onclick: () => adminEntrySheet(e, st, reload) }, inner);
  return h('a', { ...attrs, href: '#/pilotak/' + encodeURIComponent(p.psnLower || '') }, inner);
}

/* ---------- registration card ---------- */
function registrationCard(st, reload) {
  const s = st.season, table = st.table;
  const r = regStatus(s);
  const wrap = h('section', { class: 'panel reg-card', style: 'margin-top:12px' });
  const num = h('b', { class: 'display num' }, '0');
  requestAnimationFrame(() => countUp(num, 0, table.inList.length, 800));
  const times = h('div', { class: 'times' },
    s.regOpensAt ? frag(h('span', null, t('regOpens')), h('b', null, fmtDate(s.regOpensAt, true))) : null,
    s.regClosesAt ? frag(h('span', null, t('regCloses')), h('b', null, fmtDate(s.regClosesAt, true), r === 'open' ? h('span', { class: 'faint', style: 'font-weight:500' }, ' (' + relTime(s.regClosesAt) + ')') : null)) : null);
  wrap.append(h('div', { class: 'head' }, h('h2', { class: 'display', style: 'font-size:26px' }, t('registration')), seasonPill(s)),
    h('div', { class: 'count' }, num, h('span', null, '/ ' + s.cap), table.waitlist.length ? h('span', null, t('plusWaitlist', { n: table.waitlist.length })) : null),
    times, h('div', { style: 'margin-top:16px' }, myEntryBlock(st, reload)));
  return wrap;
}

function myEntryBlock(st, reload) {
  const s = st.season;
  if (!signedIn()) {
    if (regStatus(s) !== 'open') return null;
    return h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, h('a', { class: 'btn primary', href: '#/regisztracio' }, t('signUpToEnter')), h('a', { class: 'btn', href: '#/belepes?next=' + encodeURIComponent('/szezonok/' + s.id) }, t('signIn')));
  }
  const mine = st.entries.find((e) => e.uid === session.user.uid);
  if (mine && mine.status !== 'withdrawn') return myEntryCard(st, mine, reload);
  const rm = reserveMode(s), r = regStatus(s);
  if (r !== 'open' && rm === 'none') return null;
  const btn = h('button', { class: 'btn primary', type: 'button', 'data-haptic': '' }, icon('flag'), mine ? t('reEnter') : (r === 'open' ? (st.table.full && s.waitlist !== false ? t('joinWaitlist') : t('enter')) : t('enterReserve')));
  btn.addEventListener('click', () => enterSheet(st, reload, mine));
  return h('div', null, btn, mine ? h('p', { class: 'note' }, t('youWithdrew')) : null);
}

function myEntryCard(st, e, reload) {
  const s = st.season;
  const info = st.table.byUid[e.uid] || {};
  const label = { in: t('youAreIn', { n: info.pos, cap: s.cap }), waitlist: t('youWait', { n: info.pos }), reserve: t('youReserve'), pending: t('youPending'), over: t('youOver') }[info.status];
  const big = info.status === 'in' ? '#' + info.pos : info.status === 'waitlist' ? 'V' + info.pos : 'T';
  const upcoming = (s.rounds || []).filter((r) => r.date + 3 * 3600000 > Date.now());
  const absRows = upcoming.map((r) => h('div', { class: 'toggle-row' }, h('span', null, t('roundN', { n: r.n }) + ': ' + roundTitle(r), h('small', null, fmtDate(r.date, true))),
    toggle(!(e.absences || []).includes(r.n), async (v) => {
      const abs = new Set(e.absences || []); v ? abs.delete(r.n) : abs.add(r.n);
      try { await backend.entries.save(s.id, e.uid, { absences: [...abs].sort((a, b) => a - b) }); e.absences = [...abs]; toast(v ? t('absentUndone') : t('absentSent'), v ? 'check' : 'info'); }
      catch (err) { toast(t(errorKey(err)), 'alert'); reload(); }
    }, { label: t('iWillRace') })));
  const withdraw = h('button', { class: 'btn small danger', type: 'button' }, t('withdraw'));
  withdraw.addEventListener('click', () => confirmWithdraw(st, e, reload));
  return h('div', { class: 'my-entry' + (info.status === 'in' ? '' : ' wait') },
    h('div', { class: 'top' }, h('span', { class: 'big display num' }, big), h('div', { style: 'flex:1;min-width:0' }, h('b', { style: 'display:block;font-size:16px' }, label), h('span', { class: 'faint', style: 'font-size:13px' }, t(e.type === 'reserve' ? 'asReserve' : 'asDriver')))),
    upcoming.length ? h('div', null, h('div', { class: 'label', style: 'margin-bottom:2px' }, t('availability')), absRows) : null,
    h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, withdraw));
}

function confirmWithdraw(st, e, reload) {
  const s = st.season;
  const closed = regStatus(s) !== 'open';
  const yes = h('button', { class: 'btn danger block', type: 'button' }, t('withdrawConfirm'));
  const sh = openSheet({ title: t('withdrawTitle'), body: frag(h('p', { class: 'muted', style: 'margin:0 0 16px' }, closed ? t('withdrawClosedText') : t('withdrawText')), yes) });
  yes.addEventListener('click', () => busy(yes, async () => {
    try {
      const before = entryTable(s, st.entries);
      await backend.entries.save(s.id, e.uid, { status: 'withdrawn', withdrawnAt: Date.now() });
      notifyPromoted(s, before, st.entries.map((x) => (x.uid === e.uid ? { ...x, status: 'withdrawn' } : x)));
      sh.close(true); toast(t('withdrawn')); haptic(15); reload();
    }
    catch (err) { toast(t(errorKey(err)), 'alert'); }
  }));
}

function enterSheet(st, reload, previous) {
  const s = st.season, p = session.profile;
  const r = regStatus(s), rm = reserveMode(s);
  let type = r === 'open' ? 'driver' : 'reserve';
  const avail = new Set((s.rounds || []).map((x) => x.n));
  const err = h('div');
  const tm = st.tmap[p.teamId], gt = st.gts.find((g) => g.id === p.gtTeamId);
  const cell = (k, v) => h('div', null, h('div', { class: 'label' }, k), h('b', null, v));
  const snap = h('div', { class: 'snap' }, cell(t('name'), fullName(p)), cell(t('psnId'), p.psn), cell(t('raceNumber'), '#' + p.raceNumber), cell(t('ratings'), `${p.dr} / ${p.sr}`), cell(t('mcsmTeam'), tm ? tm.name : t('noTeam')), cell(t('gtTeam'), gt ? gt.tag : t('none')));
  const reserveBox = h('div', { class: 'f-row', style: 'display:none' }, h('span', { class: 'f-label' }, t('whichRounds')),
    h('div', { class: 'choice multi' }, (s.rounds || []).map((x) => {
      const b = h('button', { class: 'chip', type: 'button', 'aria-pressed': 'true' }, t('roundN', { n: x.n }));
      b.addEventListener('click', () => { const on = b.getAttribute('aria-pressed') !== 'true'; b.setAttribute('aria-pressed', String(on)); on ? avail.add(x.n) : avail.delete(x.n); });
      return b;
    })), rm === 'approval' ? h('span', { class: 'hint' }, t('reserveNeedsApproval')) : null);
  const typeSeg = seg([{ value: 'driver', label: t('asDriverShort') }, { value: 'reserve', label: t('asReserveShort') }], type, (v) => { type = v; reserveBox.style.display = v === 'reserve' ? '' : 'none'; refreshBtn(); });
  if (r !== 'open') { typeSeg.querySelectorAll('button')[0].disabled = true; reserveBox.style.display = ''; }
  const note = h('textarea', { class: 'input', maxlength: 300, placeholder: t('notePh') });
  const submit = h('button', { class: 'btn primary block', type: 'button', 'data-haptic': '' });
  const refreshBtn = () => { submit.replaceChildren(icon('check'), type === 'driver' ? (st.table.full && s.waitlist !== false ? t('joinWaitlist') : t('enter')) : t('enterReserve')); };
  refreshBtn();
  const blocker = entryBlocker(s, { user: session.user, profile: p, entries: st.entries, type });
  const fix = { entryErrProfile: ['#/profil', 'finishProfileBtnShort'], entryErrVerify: ['#/sajat', 'myPage'], errNumberTeam: ['#/profil?lepes=1', 'editProfile'], errNumberOne: ['#/profil?lepes=1', 'editProfile'] }[blocker];
  const sh = openSheet({ title: t('enterTitle', { s: 'MCSM' + s.no }), body: frag(
    blocker && blocker !== 'entryErrClosed' ? h('div', { class: 'callout warn', style: 'margin-bottom:14px;display:flex' }, icon('alert'), h('span', { style: 'flex:1' }, t(blocker)), fix ? h('a', { class: 'btn small', href: fix[0], onclick: () => sh.close(true) }, t(fix[1])) : null) : null,
    h('div', { class: 'form' }, h('div', { class: 'f-row' }, h('div', { class: 'row-between' }, h('span', { class: 'f-label' }, t('enterWith')), h('a', { href: '#/profil?lepes=0', style: 'color:var(--accent-text);font-weight:650;font-size:14px', onclick: () => sh.close(true) }, t('edit'))), snap, h('span', { class: 'hint' }, t('snapshotHint'))),
      h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('entryType')), typeSeg), reserveBox,
      h('div', { class: 'f-row' }, h('label', null, t('noteToAdmins')), note), err, submit)) });
  submit.addEventListener('click', () => busy(submit, async () => {
    err.replaceChildren();
    const fresh = await backend.entries.list(s.id);
    const b = entryBlocker(s, { user: session.user, profile: session.profile, entries: fresh, type });
    if (b) { err.replaceChildren(formError(t(b))); haptic(25); return; }
    const now = Date.now();
    const data = { uid: session.user.uid, type, status: 'entered', order: now, snapshot: snapshotOf(session.profile), note: note.value.trim(), absences: [], availability: type === 'reserve' ? [...avail].sort((a, b) => a - b) : [] };
    if (!previous) Object.assign(data, { seeded: false, approved: !(type === 'reserve' && rm === 'approval'), createdAt: now });
    else { delete data.uid; if (previous.type === type) delete data.type; }
    try {
      await backend.entries.save(s.id, session.user.uid, data);
      const merged = { ...(previous || {}), ...data, uid: session.user.uid, type };
      const after = entryTable(s, [...fresh.filter((x) => x.uid !== session.user.uid), merged]).byUid[session.user.uid];
      sh.close(true); haptic(12);
      if (after.status === 'pending') adminUids().then((as) => notifyUsers(as, 'reservePending', { s: 'MCSM' + s.no, name: fullName(session.profile) }, `#/szezonok/${s.id}/nevezesek`)).catch(() => {});
      toast(after.status === 'in' ? t('enteredOk', { n: after.pos }) : after.status === 'waitlist' ? t('waitlistOk', { n: after.pos }) : t('reserveOk'));
      reload();
    } catch (e2) { err.replaceChildren(formError(t(errorKey(e2)))); }
  }));
}

// Whoever moved from the waitlist into the field because of a withdrawal hears about it.
export function notifyPromoted(s, before, entriesAfter) {
  const after = entryTable(s, entriesAfter);
  const up = Object.keys(after.byUid).filter((uid) => after.byUid[uid].status === 'in' && before.byUid[uid] && before.byUid[uid].status === 'waitlist');
  if (up.length) notifyUsers(up, 'promoted', { s: 'MCSM' + s.no }, '#/szezonok/' + s.id);
}

/* ---------- used by home & me ---------- */
export { registrationCard, enterSheet };
export async function myEntries() {
  if (!signedIn()) return [];
  const all = (await loadSeasons()).filter((s) => LIVE_STATES.includes(s.state));
  const rows = await Promise.all(all.map(async (s) => { const list = await backend.entries.list(s.id); const e = list.find((x) => x.uid === session.user.uid && x.status !== 'withdrawn'); return e ? { season: s, entry: e, info: entryTable(s, list).byUid[e.uid] } : null; }));
  return rows.filter(Boolean);
}
