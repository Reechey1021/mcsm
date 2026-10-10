// ui/parts.js
// Small shared pieces: avatars, rating badges, page headings, empty states, banners.
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { initials } from '../model/profile.js';
import { t } from '../i18n/index.js';

export function teamHue(tm) { const m = tm && /hsl\((\d+)/.exec(tm.c1 || ''); return m ? +m[1] : null; }
export function avatar(p, team, cls = '') {
  const hue = teamHue(team);
  const bg = hue == null ? (team && team.c1 ? team.c1 : '#36405F') : `hsl(${hue} 42% 30%)`;
  return h('span', { class: 'avatar ' + cls, vars: { background: bg, '--t2': team ? team.c1 : 'transparent' }, 'aria-hidden': 'true' }, initials(p));
}
export const ratingEl = (p) => h('span', { class: 'rating' }, h('span', { class: 'dr' }, p.dr || '–'), h('span', { class: 'srb' }, p.sr || '–'));
export const pageTitle = (title, sub) => [h('h1', { class: 'display page-title' }, title), sub ? h('p', { class: 'page-sub' }, sub) : null];
export const secHead = (title, linkLabel, href) => h('div', { class: 'sec-head' }, h('h2', { class: 'display' }, title), linkLabel ? h('a', { class: 'link', href }, linkLabel) : null);
export const empty = (msg, extra) => h('div', { class: 'empty' }, msg, extra ? h('div', { style: 'margin-top:14px' }, extra) : null);
export const backLink = (label, href) => h('a', { class: 'btn small tap', href, style: 'margin-bottom:14px' }, icon('chevL'), label);
export const loading = () => h('div', { class: 'boot', role: 'status' }, h('span', { class: 'spin', 'aria-label': t('loading') }));
export function formError(msg) { return msg ? h('div', { class: 'form-error', role: 'alert' }, icon('alert'), h('span', null, msg)) : h('div'); }
export const skelRows = (n, hgt = 64) => h('div', { class: 'stack', style: 'gap:8px' }, Array.from({ length: n }, (_, i) => h('div', { class: 'skel', style: `height:${hgt}px;opacity:${Math.max(0.3, 1 - i * 0.08)}` })));
