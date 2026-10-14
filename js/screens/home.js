// screens/home.js
// Home: the featured season up top (countdown to whatever matters next: registration
// opening, registration closing, or the next round with the start lights), other live
// seasons in a strip, your entries, and who's already here.
import { h, frag } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { countUp, reduced, SPRING } from '../core/motion.js';
import { store } from '../core/storage.js';
import { emit } from '../core/bus.js';
import { t, fmtDate } from '../i18n/index.js';
import { backend } from '../services/backend.js';
import { session, signedIn, profileComplete } from '../services/session.js';
import { stepsDone, fullName } from '../model/profile.js';
import { LIVE_STATES, countdownTarget, entryTable, regStatus, nextRound } from '../model/season.js';
import { roundTitle } from '../data/tracks.js';
import { homeOverview, teams, teamMap, gtTeams, seasons as loadSeasons, entries as loadEntries } from '../core/data.js';
import { avatar, ratingEl, secHead, skelRows } from '../ui/parts.js';
import { seasonPill } from '../ui/season-parts.js';
import { enterSheet } from './seasons.js';
import { onLeave } from '../router.js';
import { loadRace } from '../core/race-data.js';
import { tracks as loadTracks } from '../core/data.js';
import { matchTrack } from '../data/track-match.js';
import { liveStreams } from '../ui/live-streams.js';
import { towerEl } from '../ui/tower.js';

export function screenHome() {
  const top = h('div', null, h('div', { class: 'skel', style: 'height:360px;border-radius:24px' }));
  const strip = h('div');
  const nums = h('div', { class: 'stat-row panel', style: 'margin-top:16px;overflow:hidden' });
  const latest = h('div', null, skelRows(4, 62));
  Promise.all([loadSeasons(), teamMap(), gtTeams()]).then(async ([all, tmap, gts]) => {
    const live = all.filter((s) => LIVE_STATES.includes(s.state)).sort((a, b) => (b.featured ? 1 : 0) - (a.featured ? 1 : 0) || b.no - a.no);
    const featured = live[0];
    if (!featured) { top.replaceChildren(welcomeHero()); return; }
    const [entries, cat] = await Promise.all([loadEntries(featured.id), loadTracks()]);
    top.replaceChildren(seasonHero({ season: featured, entries, tmap, gts, table: entryTable(featured, entries), cat }));
    const others = live.slice(1);
    if (others.length) strip.replaceChildren(h('div', { class: 'strip' }, others.map((s) => { const nr = nextRound(s); return h('a', { class: 'round-item', href: '#/szezonok/' + s.id }, h('span', { class: 'no display', style: 'width:auto;font-size:26px' }, s.no), h('span', { class: 't' }, h('b', null, s.name || 'MCSM' + s.no), h('span', { class: 'sub' }, nr ? t('nextRoundShort', { n: nr.n, date: fmtDate(nr.date) }) : '', seasonPill(s))), icon('chevR', 'chev')); })));
  }).catch(() => top.replaceChildren(welcomeHero()));
  const results = h('div');
  loadSeasons().then(async (all) => {
    const s = all.filter((x) => ['running', 'pq'].includes(x.state)).sort((a, b) => b.no - a.no)[0];
    if (!s) return;
    const ctx = await loadRace(s.id, { includeUsers: false });
    if (!ctx || !ctx.built.length) return;
    const last = ctx.built[ctx.built.length - 1];
    const win = (L, S) => { const r = ((last.results[L] || {})[S] || []).find((x) => x.status === 'OK'); return r ? fullName(ctx.snaps[r.id] || {}) : '–'; };
    results.replaceChildren(h('div', { class: 'grid-2' },
      h('section', null, secHead(t('roundResultsOf', { n: last.n, s: 'MCSM' + s.no }), t('allResults'), `#/szezonok/${s.id}/fordulo/${last.n}`),
        last.state !== 'final' ? h('div', { class: 'callout', style: 'margin-bottom:10px' }, icon('info'), h('span', null, t('provisionalNote'))) : null,
        h('div', { class: 'stack', style: 'gap:8px' }, Object.keys(last.results).map((L) => h('a', { class: 'round-item', href: `#/szezonok/${s.id}/fordulo/${last.n}` }, h('span', { class: 'lobby ' + L }, L),
          h('span', { class: 't' }, h('b', null, "Gran'Prix: " + win(L, 'GP')), h('span', { class: 'sub' }, 'Sprint: ' + win(L, 'S'))), icon('chevR', 'chev'))))),
      h('section', null, secHead(t('standings'), t('fullTable'), '#/eredmenyek/' + s.id), towerEl(ctx, 'drivers', ctx.built.length, { limit: 5 }).el)));
  }).catch(() => {});
  Promise.all([homeOverview(), teams(), teamMap()]).then(([stats, tms, tmap]) => {
    const sv = (v, k) => { const el = h('div', { class: 'v display num' }, '0'); requestAnimationFrame(() => countUp(el, 0, v, 900)); return h('div', null, el, h('div', { class: 'k' }, k)); };
    nums.replaceChildren(sv(stats.driverCount, t('statDrivers')), sv(tms.length, t('statTeams')), sv(stats.wheelCount, t('statWheels')));
    latest.replaceChildren(h('div', { class: 'stack', style: 'gap:8px' }, stats.recent.map((u) => h('a', { class: 'drv-card', href: '#/pilotak/' + encodeURIComponent(u.psnLower) }, avatar(u, tmap[u.teamId]),
      h('span', { class: 'nm' }, h('b', null, fullName(u)), h('span', null, h('span', { class: 'rnum' }, '#' + u.raceNumber), '  ', u.psn)), ratingEl(u)))));
  }).catch(() => latest.replaceChildren(h('div', { class: 'empty' }, t('loadFailed'))));
  const links = h('div', { class: 'tiles', style: 'margin-top:4px' },
    [['flag', 'navSeasons', '#/szezonok'], ['users', 'navDrivers', '#/pilotak'], ['grid', 'teams', '#/csapatok'], ['book', 'rules', '#/szabalyzat']].map(([ic, k, href]) => h('a', { class: 'tile', href }, icon(ic), h('b', null, t(k)))));
  return frag(liveStreams(), top, strip, results, nums, h('div', { class: 'grid-2' }, h('section', null, secHead(t('newestDrivers'), t('allDrivers'), '#/pilotak'), latest), h('section', null, secHead(t('explore')), links)));
}

function welcomeHero() {
  let cta;
  if (!signedIn()) cta = [h('a', { class: 'btn primary', href: '#/regisztracio', 'data-haptic': '' }, icon('plus'), t('signUp')), h('a', { class: 'btn', href: '#/belepes' }, t('signIn'))];
  else if (!profileComplete()) cta = [h('a', { class: 'btn primary', href: '#/profil', 'data-haptic': '' }, icon('user'), t('finishProfileBtn', { n: stepsDone(session.profile), total: 3 }))];
  else cta = [h('a', { class: 'btn primary', href: '#/sajat' }, icon('user'), t('myPage')), h('a', { class: 'btn', href: '#/pilotak' }, t('navDrivers'))];
  return h('section', { class: 'hero' }, h('div', { class: 'cover', vars: { 'background-image': 'url(assets/cover31_big.jpg)' } }),
    h('div', { class: 'hero-top' }, h('span', { class: 'state-pill' }, h('span', { class: 'live' }), t('heroPill'))),
    h('h1', { class: 'display' }, t('heroTitle')),
    h('p', { style: 'color:var(--chrome-ink-2);max-width:520px;margin:8px 0 0;font-size:15.5px' }, signedIn() && profileComplete() ? t('heroTextReady') : t('heroText')),
    h('div', { class: 'hero-actions' }, cta));
}

function seasonHero(st) {
  const s = st.season;
  const target = countdownTarget(s);
  const r = regStatus(s);
  const mine = signedIn() ? st.entries.find((e) => e.uid === session.user.uid && e.status !== 'withdrawn') : null;
  const info = mine ? st.table.byUid[mine.uid] : null;
  // countdown
  const units = [['d', 'days'], ['h', 'hours'], ['m', 'mins'], ['s', 'secs']].map(([k, lbl]) => { const v = h('span', { class: 'v' }, '00'); return { k, v, el: h('span', { class: 'u' }, v, h('span', { class: 'k' }, t(lbl))) }; });
  const cd = h('div', { class: 'countdown', role: 'timer' });
  units.forEach((u, i) => { if (i) cd.append(h('span', { class: 'sep' }, ':')); cd.append(u.el); });
  if (target) {
    const tick = () => {
      let x = Math.max(0, Math.floor((target.at - Date.now()) / 1000));
      const d = Math.floor(x / 86400); x -= d * 86400; const hh = Math.floor(x / 3600); x -= hh * 3600; const m = Math.floor(x / 60); x -= m * 60;
      const vals = { d, h: hh, m, s: x };
      units.forEach((u) => { const txt = String(vals[u.k]).padStart(2, '0'); if (u.v.textContent !== txt) u.v.textContent = txt; });
    };
    tick(); const iv = setInterval(tick, 1000); onLeave(() => clearInterval(iv));
  }
  const lights = target && target.kind === 'round' ? h('div', { class: 'lights', 'aria-hidden': 'true' }, Array.from({ length: 5 }, () => h('i'))) : null;
  const label = !target ? null : target.kind === 'round' ? t('cdRound', { n: target.round.n }) : t(target.kind === 'regOpens' ? 'cdRegOpens' : 'cdRegCloses');
  const nr = nextRound(s);
  const prog = (s.rounds || []).length ? frag(h('div', { class: 'hero-season' }, s.rounds.map((x) => h('span', { class: 'rd ' + (x.date + 3 * 3600000 < Date.now() ? 'done' : nr && nr.n === x.n ? 'next' : '') }))),
    h('div', { class: 'hero-season-l' }, s.rounds.map((x) => h('span', null, x.track)))) : null;
  // actions
  const actions = [];
  if (r === 'open' && !mine) {
    if (!signedIn()) actions.push(h('a', { class: 'btn primary', href: '#/regisztracio', 'data-haptic': '' }, icon('plus'), t('signUpToEnter')));
    else {
      const b = h('button', { class: 'btn primary', type: 'button', 'data-haptic': '' }, icon('flag'), st.table.full && s.waitlist !== false ? t('joinWaitlist') : t('enter'));
      b.addEventListener('click', () => enterSheet(st, () => emit('rerender')));
      actions.push(b);
    }
  }
  actions.push(h('a', { class: 'btn' + (actions.length ? '' : ' primary'), href: '#/szezonok/' + s.id }, t('seasonPage')));
  const status = info ? h('span', { class: 'state-pill', style: 'background:rgba(182,240,60,.16)' }, icon('check'), info.status === 'in' ? t('heroIn', { n: info.pos, cap: s.cap }) : t('es_' + info.status) + (info.status === 'waitlist' ? ` (${info.pos}.)` : '')) : null;
  const tm = matchTrack((target && target.round) || nextRound(s) || (s.rounds || [])[0], st.cat);
  const bg = s.coverUrl || (tm && tm.photo);
  const hero = h('section', { class: 'hero', 'aria-label': `MCSM${s.no}` },
    bg ? h('div', { class: 'cover', vars: { 'background-image': `url("${bg.replace(/"/g, '')}")` } }) : null,
    tm && tm.map && target && target.kind === 'round' ? h('img', { class: 'hero-map', src: tm.map, alt: '', onerror: (e) => e.target.remove() }) : null,
    h('div', { class: 'hero-top' }, h('span', { class: 'state-pill' }, h('span', { class: 'live' }), r === 'open' ? t('reg_open') : r === 'soon' && s.state === 'announced' ? t('reg_soon') : t('state_' + s.state)), h('span', { style: 'color:var(--chrome-ink-2);font-size:13.5px;font-weight:600' }, `MCSM${s.no}${s.name ? ' – ' + s.name : ''}`), status),
    h('h1', { class: 'display' }, target && target.kind === 'round' ? t('roundN', { n: target.round.n }) : 'MCSM' + s.no),
    target && target.kind === 'round' ? h('div', { class: 'track' }, target.round.cc ? h('span', { class: 'cc' }, target.round.cc) : null, roundTitle(target.round)) : h('div', { class: 'track' }, s.name || ''),
    target ? h('div', { class: 'when' }, label + ': ' + fmtDate(target.at, true)) : null,
    lights, target ? cd : null, prog, h('div', { class: 'hero-actions' }, actions));
  if (lights) requestAnimationFrame(() => startLights(hero, lights, units.map((u) => u.v)));
  return hero;
}

function startLights(hero, lights, digits) {
  const bulbs = [...lights.children];
  if (reduced() || store.sget('lights')) return;
  store.sset('lights', '1');
  const timers = [];
  digits.forEach((d) => { d.style.opacity = '0'; });
  const finish = () => {
    timers.forEach(clearTimeout);
    lights.classList.add('out'); bulbs.forEach((b) => b.classList.remove('on'));
    digits.forEach((d, i) => { d.style.opacity = ''; d.animate([{ opacity: 0, transform: 'translateY(-18px) skewX(-8deg)' }, { opacity: 1, transform: 'none' }], { duration: SPRING.pop.duration, delay: i * 60, easing: SPRING.pop.easing, fill: 'backwards' }); });
  };
  hero.addEventListener('pointerdown', finish, { once: true });
  bulbs.forEach((b, i) => timers.push(setTimeout(() => b.classList.add('on'), 220 + i * 170)));
  timers.push(setTimeout(finish, 220 + 5 * 170 + 420));
  onLeave(() => timers.forEach(clearTimeout));
}
