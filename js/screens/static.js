// screens/static.js
// Pages that are mostly text: coming-soon placeholders, rules, not found.
import { h, frag } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../i18n/index.js';
import { pageTitle, empty } from '../ui/parts.js';

export function screenSoon(which) {
  return frag(pageTitle(t(which === 'seasons' ? 'navSeasons' : 'navResults')),
    empty(h('span', null, h('b', { style: 'display:block;color:var(--ink);margin-bottom:6px' }, t('soonTitle')), t(which === 'seasons' ? 'soonSeasons' : 'soonResults'))));
}

export function screenRules() {
  const secs = ['entry', 'pq', 'scoring', 'teams', 'protests'];
  return frag(pageTitle(t('rules'), t('rulesSub')),
    h('div', { class: 'stack', style: 'gap:8px' }, secs.map((k) => h('details', { class: 'panel', style: 'padding:0' },
      h('summary', { style: 'padding:16px;font-weight:700;cursor:pointer;list-style:none;display:flex;justify-content:space-between;align-items:center' }, t('rule_' + k), icon('down', 'chev')),
      h('p', { class: 'muted', style: 'margin:0;padding:0 16px 16px' }, t('rule_' + k + '_txt'))))));
}

export function screenNotFound(msg) {
  return empty(typeof msg === 'string' ? msg : t('notFound'), h('a', { class: 'btn', href: '#/' }, t('navHome')));
}
