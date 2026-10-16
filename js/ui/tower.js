// ui/tower.js
// The timing tower: championship standings with position deltas, team stripes,
// count-up points and FLIP reordering between rounds.
import { publicRatings, lobbyAverages, fmtRating } from '../services/mcsm-rating.js';
import { h, frag } from '../core/dom.js';
import { flip, countUp, fmtInt, moveThumb } from '../core/motion.js';
import { t } from '../i18n/index.js';
import { driverStandings, teamStandings } from '../engine/scoring.js';
import { lobbyOf } from '../model/race.js';
import { fullName } from '../model/profile.js';
import { session } from '../services/session.js';

export function championshipKinds(ctx) {
  const ch = ctx.season.championships || {};
  return [['drivers', t('champDrivers')], ch.teams !== false ? ['teams', t('champTeams')] : null, ...((ch.gt || []).map((g) => ['gt:' + g, g]))].filter(Boolean);
}

export function standingsRows(ctx, kind, upTo) {
  const rounds = ctx.built.slice(0, upTo);
  if (kind === 'teams') return teamStandings(rounds, ctx.teams, { table: ctx.points }).map((r) => ({ ...r, team: ctx.tmap[r.id] || { name: r.id, c1: 'var(--line-2)' }, members: (ctx.teams.find((x) => x.id === r.id) || {}).members || [] }));
  const filter = kind.startsWith('gt:') ? (uid) => (ctx.snaps[uid] || {}).gtTeamId === kind.slice(3) : null;
  return driverStandings(rounds, ctx.ids, { table: ctx.points, filter }).map((r) => ({ ...r, p: ctx.snaps[r.id] || {} }));
}

const delta = (d) => (d == null ? h('span', { class: 'delta' }) : d > 0 ? h('span', { class: 'delta up', title: t('up', { n: d }) }, '▲' + d) : d < 0 ? h('span', { class: 'delta down', title: t('down', { n: -d }) }, '▼' + -d) : h('span', { class: 'delta same' }, '–'));

function row(ctx, r, upTo, prevPos, oldTotal) {
  const posCls = 'pos' + (r.pos <= 3 ? ' p' + r.pos : '');
  const cols = h('span', { class: 'cols' }, ctx.season.rounds.map((rd, i) => h('span', null, i < upTo && r.per[i] != null ? fmtInt(typeof r.per[i] === 'number' ? r.per[i] : r.per[i].total) : '–')));
  const ptsB = h('b', null, fmtInt(oldTotal != null ? oldTotal : r.total));
  if (oldTotal != null && oldTotal !== r.total) requestAnimationFrame(() => countUp(ptsB, oldTotal, r.total, 700));
  let who, href, lobby = null, me = false;
  if (r.team) {
    who = h('span', { class: 'who' }, h('span', { class: 'stripe', vars: { '--t1': r.team.c1 } }), h('span', { class: 'nm' }, h('b', null, r.team.name), h('span', null, r.members.map((id) => (ctx.snaps[id] || {}).lastName || '').join(', '))));
    href = '#/csapatok'; me = session.user && r.members.includes(session.user.uid);
  } else {
    const tm = ctx.tmap[r.p.teamId];
    const last = ctx.built[upTo - 1];
    lobby = last ? lobbyOf(last.lobbies, r.id) : null;
    who = h('span', { class: 'who' }, h('span', { class: 'stripe', vars: { '--t1': tm ? tm.c1 : 'var(--line-2)' } }), h('span', { class: 'nm' }, h('b', null, fullName(r.p)), h('span', null, h('span', { class: 'rnum' }, '#' + (r.p.raceNumber ?? '–')), r.p.psn ? h('span', { class: 'psn-tag' }, r.p.psn) : null, tm ? '  · ' + tm.name : '')));
    href = '#/pilotak/' + encodeURIComponent(r.p.psnLower || ''); me = session.user && r.id === session.user.uid;
  }
  return h('li', { dataset: { key: r.id } }, h('a', { class: 'trow' + (me ? ' me' : ''), href }, h('span', { class: posCls }, r.pos), delta(prevPos != null ? prevPos - r.pos : null), who,
    h('span', { class: 'pts' }, lobby ? h('span', { class: 'lobby ' + lobby }, lobby) : null, ptsB), cols));
}

export function towerEl(ctx, kind, upTo, opts = {}) {
  const prev = upTo > 1 && !opts.noDelta ? Object.fromEntries(standingsRows(ctx, kind, upTo - 1).map((r) => [r.id, r.pos])) : null;
  const rows = standingsRows(ctx, kind, upTo).slice(0, opts.limit || 999);
  const head = h('div', { class: 'tower-head' }, h('span', { class: 'p' }, t('posShort')), h('span'), h('span', null, kind === 'teams' ? t('team') : t('driver')), h('span', { class: 'pt' }, t('points')),
    h('span', { class: 'cols' }, ctx.season.rounds.map((rd) => h('span', null, t('rShort', { n: rd.n })))));
  const ol = h('ol', { class: 'tower' }, rows.map((r) => row(ctx, r, upTo, prev ? prev[r.id] : null, opts.oldTotals ? opts.oldTotals[r.id] : null)));
  return { el: h('div', { class: 'tower-wrap' }, head, ol), rows };
}

// Full interactive standings block: championship tabs, round scrubber, replay.
export function standingsBlock(ctx, ui, segFn) {
  const done = ctx.built.length;
  if (!done) return h('div', { class: 'empty' }, t('noResultsYet'));
  const kinds = championshipKinds(ctx);
  if (!kinds.some(([k]) => k === ui.kind)) ui.kind = 'drivers';
  const finished = ['finished', 'archived'].includes(ctx.season.state);
  if (ui.sid !== ctx.season.id || !ui.upTo || ui.upTo > done) { ui.sid = ctx.season.id; ui.upTo = done; ui.final = finished; }
  if (!finished) ui.final = false;
  const avgRow = h('div', { class: 'lobby-avgs' });
  const drawAvgs = () => publicRatings().then((P) => {
    const rd = ctx.built[ui.upTo - 1];
    const av = rd ? lobbyAverages(P, rd.lobbies, ctx.season.no, rd.n) : {};
    const Ls = ['A', 'B', 'C'].filter((L) => av[L]);
    avgRow.replaceChildren(...(Ls.length ? [h('span', { class: 'k' }, t('lobbyAvgShort')), ...Ls.map((L) => h('span', { class: 'la' }, h('span', { class: 'lobby ' + L }, L), h('span', { class: 'mr-pill', title: t('lobbyAvgOf', { n: av[L].ranked, m: av[L].total }) }, fmtRating(av[L].avg))))] : []));
  }).catch(() => avgRow.replaceChildren());
  const box = h('div');
  const note = h('span', { class: 'status' });
  let current = null;
  const draw = (animate, extra = {}) => {
    const oldTotals = current && current.kind === ui.kind ? Object.fromEntries(current.rows.map((r) => [r.id, r.total])) : null;
    const build = () => {
      const tw = towerEl(ctx, ui.kind, ui.upTo, { oldTotals: animate ? oldTotals : null, noDelta: ui.final });
      drawAvgs();
      box.replaceChildren(tw.el);
      current = { kind: ui.kind, rows: tw.rows };
      const st = ctx.built[ui.upTo - 1].state;
      note.textContent = st === 'final' ? t('stFinal') : t('stProvisional'); note.className = 'status' + (st === 'final' ? ' live' : '');
    };
    animate ? flip(box, build, { stagger: extra.stagger || 10, extra: extra.extra || 0 }) : build();
  };
  const tabs = segFn(kinds.map(([value, label]) => ({ value, label })), ui.kind, (v) => { ui.kind = v; draw(true); }, { label: t('championships') });
  // value 0 = the final standings (no movement arrows); shown once the season is over
  const rounds = segFn([...ctx.built.map((r) => ({ value: r.n, label: t('afterRound', { n: r.n }) })), ...(finished ? [{ value: 0, label: t('finalStandings') }] : [])], ui.final ? 0 : ctx.built[ui.upTo - 1].n,
    (v) => { if (v === 0) { ui.final = true; ui.upTo = done; } else { ui.final = false; ui.upTo = ctx.built.findIndex((r) => r.n === v) + 1; } draw(true); }, { scroll: true, label: t('afterRoundLabel') });
  const replay = h('button', { class: 'btn small', type: 'button', 'data-haptic': '', 'aria-label': t('replay'), title: t('replay'), disabled: done < 2 }, h('span', { 'aria-hidden': 'true' }, '▶'), h('span', { class: 'hide-sm' }, t('replay')));
  const pressRound = (n) => { rounds.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(+b.dataset.v === n))); moveThumb(rounds, rounds.querySelector('[aria-pressed="true"]'), rounds.querySelector('.thumb')); };
  replay.addEventListener('click', () => {
    ui.final = false; ui.upTo = done - 1; pressRound(ctx.built[done - 2].n); draw(false);
    setTimeout(() => { ui.upTo = done; pressRound(ctx.built[done - 1].n); draw(true, { stagger: 14, extra: 260 }); }, 650);
  });
  draw(false);
  return frag(h('div', { class: 'tower-tools' }, tabs, h('div', { style: 'display:flex;gap:8px;align-items:center;max-width:100%' }, rounds, replay)), h('div', { class: 'tower-meta' }, note, avgRow), box);
}
