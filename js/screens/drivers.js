// screens/drivers.js
// The public driver directory and driver profiles.
import { session } from '../services/session.js';
import { backend } from '../services/backend.js';
import { fmtInt } from '../core/motion.js';
import { normName } from '../model/name-match.js';
import { openSheet } from '../ui/sheet.js';
import { h, frag } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { flip } from '../core/motion.js';
import { avatar, ratingEl, pageTitle, skelRows, empty, backLink, secHead } from '../ui/parts.js';
import { t } from '../i18n/index.js';
import { users, publicDriverDirectory, teamMap, gtTeams } from '../core/data.js';
import { fullName, isComplete, DR_RANK } from '../model/profile.js';
import { profileHead, profileKv } from './me.js';
import { teamBadge } from '../ui/parts.js';
import { honours } from '../services/honours.js';
import { medalsForUser } from '../model/honours.js';
import { trophyCount } from '../ui/trophy.js';
import { publicRatings } from '../services/mcsm-rating.js';
import { seasons as loadSeasons } from '../core/data.js';
import { loadRace } from '../core/race-data.js';
import { roundTotals } from '../engine/scoring.js';
import { roundTitle } from '../data/tracks.js';

const ui = { q: '', filter: 'all', sort: 'dr' };
let vtBack = null;

export function screenDrivers() {
  const grid = h('div', { class: 'drv-grid' }, ...Array.from({ length: 9 }, () => h('div', { class: 'skel', style: 'height:66px' })));
  const count = h('span', { class: 'faint' });
  const input = h('input', { type: 'search', placeholder: t('searchDrivers'), value: ui.q, 'aria-label': t('searchDrivers'), autocomplete: 'off', enterkeyhint: 'search' });
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': t('filters') });
  const sort = h('select', { class: 'select', 'aria-label': t('sortBy') }, [['dr', t('sortDr')], ['mcsm', t('sortMcsm')], ['titles', t('sortTitles')], ['name', t('sortName')], ['no', t('sortNo')], ['new', t('sortNew')]].map(([v, l]) => h('option', { value: v, selected: ui.sort === v }, l)));
  let data = null, tmap = {}, medals = {}, mr = {};
  // the figure the current sort is about: DR points, MCSM Rating, titles; nothing for the rest
  const sortFigure = (d, m) => {
    if (ui.sort === 'dr' && d.dr === 'S') return h('span', { class: 'sort-fig' }, h('b', null, '★'), h('small', null, t('drStarShort')));
    if (ui.sort === 'dr') return d.drPoints != null ? h('span', { class: 'sort-fig' }, h('b', null, fmtInt(d.drPoints)), h('small', null, 'DR')) : d.dr ? h('span', { class: 'sort-fig' }, h('b', null, d.dr), h('small', null, 'DR')) : null;
    if (ui.sort === 'mcsm') return mrOf(d) != null ? h('span', { class: 'sort-fig' }, h('b', null, (Math.round(mrOf(d) * 10) / 10).toFixed(1).replace('.', ',')), h('small', null, 'MCSM')) : h('span', { class: 'sort-fig dim' }, h('small', null, t('mrUnranked')));
    if (ui.sort === 'titles') return m && m.medals[0] ? h('span', { class: 'sort-fig' }, trophyCount(m.medals[0], 0, 16)) : null;
    return null;
  };
  const mrOf = (u) => { const x = mr[u.uid]; return x && x.e ? x.r : null; };
  const mk = (u) => { const m = medals[u.uid]; return m ? m.medals[0] * 10000 + m.medals[1] * 100 + m.medals[2] : 0; };
  const list = () => {
    const q = ui.q.trim().toLowerCase(), f = ui.filter;
    return data.filter((d) => {
      if (f === 'wheel' && d.input !== 'wheel') return false;
      if (f === 'pad' && d.input !== 'pad') return false;
      if (f.startsWith('gt:') && d.gtTeamId !== f.slice(3)) return false;
      if (!q) return true;
      const tm = tmap[d.teamId];
      return [fullName(d), d.psn, tm ? tm.name : '', d.raceNumber, d.gtTeamId || ''].join(' ').toLowerCase().includes(q);
    }).sort({
      // S drivers first, alphabetically among themselves (their points are a fixed 150K, not real)
      dr: (a, b) => (DR_RANK[b.dr] || 0) - (DR_RANK[a.dr] || 0) || (a.dr === 'S' && b.dr === 'S' ? 0 : (b.drPoints || 0) - (a.drPoints || 0)) || fullName(a).localeCompare(fullName(b), 'hu'),
      name: (a, b) => fullName(a).localeCompare(fullName(b), 'hu'),
      no: (a, b) => (a.raceNumber || 0) - (b.raceNumber || 0),
      new: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
      titles: (a, b) => mk(b) - mk(a) || fullName(a).localeCompare(fullName(b), 'hu'),
      mcsm: (a, b) => (mrOf(b) ?? -1) - (mrOf(a) ?? -1) || fullName(a).localeCompare(fullName(b), 'hu'),
    }[ui.sort]);
  };
  const card = (d) => {
    const tm = tmap[d.teamId];
    const av = avatar(d, tm);
    const m = medals[d.uid];
    const a = h('a', { class: 'drv-card', href: '#/pilotak/' + encodeURIComponent(d.psnLower), dataset: { key: d.uid } }, av,
      h('span', { class: 'nm' }, h('b', null, fullName(d)), h('span', null, h('span', { class: 'rnum' }, '#' + d.raceNumber), ' · ', d.psn),
        tm ? h('span', { class: 'team-line' }, teamBadge(tm, 16), h('span', null, tm.name)) : null), sortFigure(d, m));
    a.addEventListener('click', () => { av.style.viewTransitionName = 'drv-hero'; });
    if (vtBack === d.uid) { av.style.viewTransitionName = 'drv-hero'; vtBack = null; setTimeout(() => { av.style.viewTransitionName = ''; }, 700); }
    return a;
  };
  const update = (animate) => {
    const items = list();
    count.textContent = t('nDrivers', { n: items.length });
    const build = () => grid.replaceChildren(...(items.length ? items.map(card) : [empty(t('noDrivers'))]));
    animate ? flip(grid, build, { stagger: 12 }) : build();
  };
  let qT; input.addEventListener('input', () => { clearTimeout(qT); qT = setTimeout(() => { ui.q = input.value; update(true); }, 90); });
  sort.addEventListener('change', () => { ui.sort = sort.value; update(true); });
  Promise.all([publicDriverDirectory(), teamMap(), gtTeams(), honours().catch(() => null), publicRatings()]).then(([us, tm, gts, H, P]) => {
    mr = (P && P.drivers) || {};
    data = us.filter(isComplete); tmap = tm;
    if (H) data.forEach((u) => { const m = medalsForUser(H.people, u); if (m) medals[u.uid] = m; });
    const filters = [['all', t('all')], ['wheel', t('wheel')], ['pad', t('pad')], ...gts.map((g) => ['gt:' + g.id, g.tag])];
    chips.replaceChildren(...filters.map(([v, l]) => {
      const c = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(ui.filter === v) }, l);
      c.addEventListener('click', () => { ui.filter = v; chips.querySelectorAll('.chip').forEach((x) => x.setAttribute('aria-pressed', String(x === c))); update(true); });
      return c;
    }));
    update(false);
  }).catch(() => grid.replaceChildren(empty(t('loadFailed'))));
  return frag(pageTitle(t('drivers'), t('driversSub')),
    h('div', { class: 'toolbar' }, h('label', { class: 'field' }, icon('search'), input), chips, h('div', { class: 'row' }, count, sort)), grid);
}

export function screenDriver({ psn }) {
  const box = h('div', null, skelRows(3, 120));
  const topRight = h('div');
  Promise.all([backend.users.byPsn(psn), teamMap(), gtTeams()]).then(([p, tm, gts]) => {
    if (!p || !isComplete(p)) { box.replaceChildren(empty(t('notFound'))); return; }
    vtBack = p.uid;
    const gt = gts.find((g) => g.id === p.gtTeamId);
    const res = h('div', null, skelRows(2, 60));
    topRight.replaceChildren(h('button', { class: 'btn small', type: 'button', onclick: () => users().then((us) => pickCompare(p, us)).catch(() => {}) }, icon('users'), t('compare')));
    const old = h('div');
    box.replaceChildren(profileHead(p, tm[p.teamId], { vt: true, gt }), profileKv(p, tm[p.teamId], gt && gt.tag, gt), res, old);
    driverResults(p.uid, p).then((blocks) => { res.replaceChildren(...(blocks.length ? blocks : [secHead(t('results')), empty(t('resultsLater'))])); old.replaceChildren(oldResults(p, blocks.shown)); })
      .catch(() => { res.replaceChildren(); old.replaceChildren(oldResults(p)); });
  }).catch(() => box.replaceChildren(empty(t('loadFailed'))));
  return frag(h('div', { class: 'top-row' }, backLink(t('drivers'), '#/pilotak'), topRight), box);
}

// Seasons imported from the old site only kept round totals and an overall rank. Their lobby and
// within-lobby positions come from the MCSM25–30 history data (matched by PSN ID).
async function driverResults(uid, p = {}) {
  const all = (await loadSeasons()).filter((s) => ['pq', 'running', 'finished', 'archived'].includes(s.state)).sort((a, b) => b.no - a.no).slice(0, 4);
  const out = [];
  out.shown = new Set();
  const { HISTORY } = await import('../data/history-s25-30.js').catch(() => ({ HISTORY: [] }));
  for (const s of all) {
    const ctx = await loadRace(s.id, { includeUsers: false });
    if (!ctx || !ctx.built.some((r) => (r.legacy && r.legacy.some((x) => x.id === uid)) || Object.values(r.lobbies).some((l) => l.includes(uid)))) continue;
    out.shown.add(s.no);
    const names = new Set([p.psn, (ctx.snaps[uid] || {}).psn].filter(Boolean).map(normName));
    const histRow = (n) => HISTORY.find((r) => r[0] === s.no && r[1] === n && names.has(normName(r[3])));
    const rows = ctx.built.map((rd) => {
      const tot = roundTotals(rd, ctx.points)[uid]; if (!tot) return null;
      const hr = rd.legacy ? histRow(rd.n) : null;
      if (hr) tot.lobby = hr[2];
      const st = (S) => {
        if (rd.legacy) { const v = hr ? hr[{ Q: 4, S: 5, GP: 6 }[S]] : null; return v == null ? '–' : typeof v === 'number' ? 'P' + v : v; }
        const r = (rd.results[tot.lobby][S] || []).find((x) => x.id === uid); return !r ? '–' : r.status === 'OK' ? 'P' + r.pos : r.status;
      };
      return h('tr', null, h('td', null, h('a', { href: `#/szezonok/${s.id}/fordulo/${rd.n}`, style: 'font-weight:700' }, t('roundN', { n: rd.n }))), h('td', null, tot.lobby ? h('span', { class: 'lobby ' + tot.lobby }, tot.lobby) : '–'),
        h('td', { class: 'r' }, st('Q')), h('td', { class: 'r' }, st('S')), h('td', { class: 'r' }, st('GP')), h('td', { class: 'r', style: 'font-weight:800' }, tot.total));
    }).filter(Boolean);
    out.push(secHead(`MCSM${s.no}`, t('standings'), '#/eredmenyek/' + s.id), h('div', { class: 'rtable-wrap' }, h('table', { class: 'rtable' },
      h('thead', null, h('tr', null, h('th', null, t('round')), h('th', null, t('lobby')), h('th', { class: 'r' }, t('qShort')), h('th', { class: 'r' }, 'Sprint'), h('th', { class: 'r' }, 'GP'), h('th', { class: 'r' }, t('pointsShort')))), h('tbody', null, rows))));
  }
  return out;
}

// Pick someone to compare with, then open the side-by-side page.
function pickCompare(p, us) {
  const q = h('input', { class: 'input', type: 'search', placeholder: t('searchPeople'), autocomplete: 'off' });
  const list = h('div', { class: 'stack', style: 'gap:6px;max-height:360px;overflow-y:auto;margin-top:10px' });
  const draw = () => { const s = q.value.trim().toLowerCase(); const meUid = session.user && session.user.uid;
    list.replaceChildren(...us.filter((u) => u.uid !== p.uid && isComplete(u) && (!s || `${fullName(u)} ${u.psn}`.toLowerCase().includes(s))).sort((a, b) => (b.uid === meUid) - (a.uid === meUid) || fullName(a).localeCompare(fullName(b), 'hu')).slice(0, 40).map((u) => h('button', { class: 'row-card', type: 'button', onclick: () => { sh.close(true); location.hash = `#/osszevetes/${encodeURIComponent(p.psnLower)}/${encodeURIComponent(u.psnLower)}`; } }, avatar(u, null), h('span', { class: 'nm' }, h('b', null, fullName(u)), h('span', null, u.psn))))); };
  q.addEventListener('input', draw);
  const sh = openSheet({ title: t('compareWith', { name: fullName(p) }), body: h('div', null, q, list) });
  draw(); setTimeout(() => q.focus(), 300);
}

// MCSM25–30: finishing positions from before the site kept session results.
function oldResults(p, skip = new Set()) {
  const box = h('section');
  import('../data/history-s25-30.js').then(({ HISTORY }) => {
    const me = normName(p.psn);
    const rows = HISTORY.filter((r) => normName(r[3]) === me && !skip.has(r[0])).sort((a, b) => b[0] - a[0] || b[1] - a[1]);
    if (!rows.length) { box.remove(); return; }
    const pos = (v) => (v == null ? '–' : typeof v === 'number' ? 'P' + v : v);
    const ss = rows.map((r) => r[0]);
    box.replaceChildren(secHead(t('oldResultsRange', { a: Math.min(...ss), b: Math.max(...ss) }).replace(/MCSM(\d+)–MCSM?\1(?!\d)/, 'MCSM$1')), h('div', { class: 'rtable-wrap' }, h('table', { class: 'rtable' },
      h('thead', null, h('tr', null, h('th', null, t('season')), h('th', null, t('lobby')), h('th', { class: 'r' }, 'Q'), h('th', { class: 'r' }, 'S'), h('th', { class: 'r' }, 'GP'))),
      h('tbody', null, rows.map((r) => h('tr', null, h('td', null, `MCSM${r[0]} / ${r[1]}`, r[7] ? ' *' : ''), h('td', null, h('span', { class: 'lobby ' + r[2] }, r[2])), h('td', { class: 'r' }, pos(r[4])), h('td', { class: 'r' }, pos(r[5])), h('td', { class: 'r' }, pos(r[6]))))))),
      rows.some((r) => r[7]) ? h('p', { class: 'note' }, t('oldResultsEstimated')) : null);
  }).catch(() => box.remove());
  return box;
}
