// screens/drivers.js
// The public driver directory and driver profiles.
import { h, frag } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { flip } from '../core/motion.js';
import { avatar, ratingEl, pageTitle, skelRows, empty, backLink, secHead } from '../ui/parts.js';
import { t } from '../i18n/index.js';
import { users, teamMap, gtTeams } from '../core/data.js';
import { fullName, isComplete, DR_RANK } from '../model/profile.js';
import { profileHead, profileKv } from './me.js';
import { seasons as loadSeasons } from '../core/data.js';
import { loadRace } from '../core/race-data.js';
import { roundTotals } from '../engine/scoring.js';
import { roundTitle } from '../data/tracks.js';

const ui = { q: '', filter: 'all', sort: 'dr' };
let vtBack = null;

export function screenDrivers() {
  const grid = h('div', { class: 'drv-grid' }, skelRows(6, 66));
  const count = h('span', { class: 'faint' });
  const input = h('input', { type: 'search', placeholder: t('searchDrivers'), value: ui.q, 'aria-label': t('searchDrivers'), autocomplete: 'off', enterkeyhint: 'search' });
  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': t('filters') });
  const sort = h('select', { class: 'select', 'aria-label': t('sortBy') }, [['dr', t('sortDr')], ['name', t('sortName')], ['no', t('sortNo')], ['new', t('sortNew')]].map(([v, l]) => h('option', { value: v, selected: ui.sort === v }, l)));
  let data = null, tmap = {};
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
      dr: (a, b) => (DR_RANK[b.dr] || 0) - (DR_RANK[a.dr] || 0) || fullName(a).localeCompare(fullName(b), 'hu'),
      name: (a, b) => fullName(a).localeCompare(fullName(b), 'hu'),
      no: (a, b) => (a.raceNumber || 0) - (b.raceNumber || 0),
      new: (a, b) => (b.createdAt || 0) - (a.createdAt || 0),
    }[ui.sort]);
  };
  const card = (d) => {
    const tm = tmap[d.teamId];
    const av = avatar(d, tm);
    const a = h('a', { class: 'drv-card', href: '#/pilotak/' + encodeURIComponent(d.psnLower), dataset: { key: d.uid } }, av,
      h('span', { class: 'nm' }, h('b', null, fullName(d)), h('span', null, h('span', { class: 'rnum' }, '#' + d.raceNumber), '  ', tm ? tm.name : d.psn)), ratingEl(d));
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
  Promise.all([users(), teamMap(), gtTeams()]).then(([us, tm, gts]) => {
    data = us.filter(isComplete); tmap = tm;
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
  Promise.all([users(), teamMap(), gtTeams()]).then(([us, tm, gts]) => {
    const p = us.find((u) => u.psnLower === psn.toLowerCase());
    if (!p || !isComplete(p)) { box.replaceChildren(empty(t('notFound'))); return; }
    vtBack = p.uid;
    const gt = gts.find((g) => g.id === p.gtTeamId);
    const res = h('div', null, skelRows(2, 60));
    box.replaceChildren(profileHead(p, tm[p.teamId], { vt: true }), profileKv(p, tm[p.teamId], gt && gt.tag), res);
    driverResults(p.uid).then((blocks) => res.replaceChildren(...(blocks.length ? blocks : [secHead(t('results')), empty(t('resultsLater'))]))).catch(() => res.replaceChildren());
  }).catch(() => box.replaceChildren(empty(t('loadFailed'))));
  return frag(backLink(t('drivers'), '#/pilotak'), box);
}

async function driverResults(uid) {
  const all = (await loadSeasons()).filter((s) => ['pq', 'running', 'finished', 'archived'].includes(s.state)).sort((a, b) => b.no - a.no).slice(0, 4);
  const out = [];
  for (const s of all) {
    const ctx = await loadRace(s.id);
    if (!ctx || !ctx.built.some((r) => Object.values(r.lobbies).some((l) => l.includes(uid)))) continue;
    const rows = ctx.built.map((rd) => {
      const tot = roundTotals(rd, ctx.points)[uid]; if (!tot) return null;
      const st = (S) => { const r = (rd.results[tot.lobby][S] || []).find((x) => x.id === uid); return !r ? '–' : r.status === 'OK' ? 'P' + r.pos : r.status; };
      return h('tr', null, h('td', null, h('a', { href: `#/szezonok/${s.id}/fordulo/${rd.n}`, style: 'font-weight:700' }, t('roundN', { n: rd.n }))), h('td', null, h('span', { class: 'lobby ' + tot.lobby }, tot.lobby)),
        h('td', { class: 'r' }, st('Q')), h('td', { class: 'r' }, st('S')), h('td', { class: 'r' }, st('GP')), h('td', { class: 'r', style: 'font-weight:800' }, tot.total));
    }).filter(Boolean);
    out.push(secHead(`MCSM${s.no}`, t('standings'), '#/eredmenyek/' + s.id), h('div', { class: 'rtable-wrap' }, h('table', { class: 'rtable' },
      h('thead', null, h('tr', null, h('th', null, t('round')), h('th', null, t('lobby')), h('th', { class: 'r' }, t('qShort')), h('th', { class: 'r' }, 'Sprint'), h('th', { class: 'r' }, 'GP'), h('th', { class: 'r' }, t('pointsShort')))), h('tbody', null, rows))));
  }
  return out;
}
