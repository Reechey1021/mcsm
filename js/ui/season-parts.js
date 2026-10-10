// ui/season-parts.js
// Shared season pieces: cover art, status pills, cards, round rows.
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t, fmtDate } from '../i18n/index.js';
import { regStatus } from '../model/season.js';
import { roundTitle } from '../data/tracks.js';
import { matchTrack } from '../data/track-match.js';

// Track photo faded in behind a round box, the layout map in white on the right.
export function trackDecor(el, round, catalog) {
  const m = matchTrack(round, catalog);
  if (!m) return el;
  el.classList.add('trk');
  if (m.photo) el.prepend(h('span', { class: 'trk-photo', vars: { 'background-image': `url("${m.photo.replace(/"/g, '')}")` }, 'aria-hidden': 'true' }));
  if (m.map) el.append(h('img', { class: 'trk-map', src: m.map, alt: '', loading: 'lazy', onerror: (e) => e.target.remove() }));
  const sub = el.querySelector('.sub');
  if (sub && (m.length || m.corners)) sub.append(h('span', { class: 'trk-stats' }, [m.length ? `${String(m.length).replace('.', ',')} km` : null, m.corners ? t('cornersN', { n: m.corners }) : null].filter(Boolean).join(' · ')));
  return el;
}

export function seasonCover(s, cls = 'img') {
  if (s.coverUrl) return h('div', { class: cls, vars: { 'background-image': `url("${s.coverUrl.replace(/"/g, '')}")` }, role: 'img', 'aria-label': 'MCSM' + s.no });
  return h('div', { class: cls + ' cover-ph', 'aria-hidden': 'true' }, h('span', { class: 'display' }, 'MCSM', h('b', null, s.no)));
}
export function seasonPill(s, now = Date.now()) {
  const r = regStatus(s, now);
  if (s.state === 'announced') return h('span', { class: 'status' + (r === 'open' ? ' live' : '') }, t('reg_' + r));
  return h('span', { class: 'status' + (['pq', 'running'].includes(s.state) ? ' live' : '') }, t('state_' + s.state));
}
export const seasonTitle = (s) => `MCSM${s.no}${s.name ? ' – ' + s.name : ''}`;
export function carLine(s) {
  if (s.format === 'oneMake') return s.car || '–';
  if (s.format === 'spec') return t('carPackN', { n: (s.cars || []).filter(Boolean).length });
  return t('carPerRound');
}
export function seasonCard(s, extra) {
  const first = (s.rounds || [])[0];
  return h('a', { class: 'season-card', href: '#/szezonok/' + s.id }, seasonCover(s),
    h('div', { class: 'body' }, h('div', { class: 'row-between' }, h('h3', { class: 'display' }, 'MCSM' + s.no), seasonPill(s)),
      h('div', { style: 'font-weight:650;margin-top:4px' }, s.name || t('untitled')),
      h('div', { class: 'meta' }, first ? h('span', null, icon('cal'), fmtDate(first.date)) : null, h('span', null, icon('flag'), t('nRounds', { n: (s.rounds || []).length })), extra || null)));
}
export function roundRow(r, opts = {}) {
  const el = h('div', { class: 'round-item' + (opts.next ? ' next' : '') }, h('span', { class: 'no display' }, r.n),
    h('span', { class: 't' }, h('b', null, roundTitle(r)), h('span', { class: 'sub' }, fmtDate(r.date, true), r.cc ? h('span', { class: 'cc' }, r.cc) : null, r.car ? h('span', null, r.car) : null)),
    opts.end || null);
  return opts.catalog ? trackDecor(el, r, opts.catalog) : el;
}
