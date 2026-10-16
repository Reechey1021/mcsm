// ui/parts.js
// Small shared pieces: avatars, rating badges, page headings, empty states, banners.
import { canGoBack, goBack } from '../core/nav.js';
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { initials } from '../model/profile.js';
import { t } from '../i18n/index.js';
import { avatarUrl } from '../data/gt7-images.js';
import { trophy } from './trophy.js';

export function teamHue(tm) { const m = tm && /hsl\((\d+)/.exec(tm.c1 || ''); return m ? +m[1] : null; }
export function avatar(p, team, cls = '') {
  const bg = '#36405F';
  const url = avatarUrl(p);
  const photo = url ? h('img', { src: url, alt: '', loading: 'lazy', decoding: 'async', class: 'gt7', onerror: (e) => e.target.remove(), onload: (e) => e.target.classList.add('img-loaded') }) : null;
  if (photo) setTimeout(() => photo.classList.add('img-loaded'), 2500);   // never leave a photo hidden
  return h('span', { class: 'avatar ' + cls + (photo ? ' has-photo' : ''), vars: { background: bg, '--t2': team ? team.c1 : 'transparent' }, 'aria-hidden': 'true' }, initials(p), photo);
}
// A team's logo, or its colour as a small rounded square when there's no logo yet.
export function teamBadge(team, size = 20) {
  if (!team) return null;
  const st = `width:${size}px;height:${size}px;flex:0 0 auto;border-radius:${Math.round(size / 4)}px;`;
  if (team.logoUrl) return h('img', { class: 'team-badge', src: team.logoUrl, alt: '', loading: 'lazy', style: st + 'object-fit:contain', onerror: (e) => { e.target.replaceWith(h('span', { class: 'team-badge', style: st + `background:${team.c1 || 'var(--line-2)'}` })); } });
  return h('span', { class: 'team-badge', style: st + `background:${team.c1 || 'var(--line-2)'}` });
}
export function medalRow(m, opts = {}) {
  if (!m) return null;
  const cell = (i, label) => h('div', { class: 'medal m' + i + (m.medals[i] ? '' : ' none') },
    h('div', { class: 'm-top' }, trophy(i, 30), h('b', { class: 'display num' }, m.medals[i])),
    h('span', { class: 'k' }, label), opts.seasons && m.seasons[i].length ? h('span', { class: 'm-list' }, m.seasons[i].map((n) => 'MCSM' + n).join(', ')) : null);
  return h('div', { class: 'medals' }, cell(0, t('medalGold')), cell(1, t('medalSilver')), cell(2, t('medalBronze')));
}
export const ratingEl = (p) => h('span', { class: 'rating' }, h('span', { class: 'dr' }, p.dr || '–'), h('span', { class: 'srb' }, p.sr || '–'));
export const pageTitle = (title, sub) => [h('h1', { class: 'display page-title' }, title), sub ? h('p', { class: 'page-sub' }, sub) : null];
export const secHead = (title, linkLabel, href) => h('div', { class: 'sec-head' }, h('h2', { class: 'display' }, title), linkLabel ? h('a', { class: 'link', href }, linkLabel) : null);
export const empty = (msg, extra) => h('div', { class: 'empty' }, msg, extra ? h('div', { style: 'margin-top:14px' }, extra) : null);
export const backLink = (label, href) => h('a', { class: 'btn small tap back-link', href, style: 'margin-bottom:14px', onclick: (e) => { if (canGoBack()) { e.preventDefault(); goBack(); } } }, icon('chevL'), label);
export const loading = () => h('div', { class: 'boot', role: 'status' }, h('span', { class: 'spin', 'aria-label': t('loading') }));
export function formError(msg) { return msg ? h('div', { class: 'form-error', role: 'alert' }, icon('alert'), h('span', null, msg)) : h('div'); }
export const skelRows = (n, hgt = 64) => h('div', { class: 'stack', style: 'gap:8px' }, Array.from({ length: n }, (_, i) => h('div', { class: 'skel', style: `height:${hgt}px;opacity:${Math.max(0.3, 1 - i * 0.08)}` })));
