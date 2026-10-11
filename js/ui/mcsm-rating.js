// ui/mcsm-rating.js
// The MCSM Rating box on driver profiles, and the "how is it calculated" explainer.
import { h, frag } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { openSheet } from './sheet.js';
import { t } from '../i18n/index.js';
import { publicRatings } from '../services/mcsm-rating.js';
import { RATING_CFG } from '../engine/rating.js';

const f1 = (v) => (v == null ? '–' : (Math.round(v * 10) / 10).toFixed(1).replace('.', ','));
const signed = (v) => (v > 0 ? '+' : v < 0 ? '−' : '±') + f1(Math.abs(v));

function spark(hist) {
  if (!hist || hist.length < 2) return null;
  const vals = hist.map((x) => x[1]), min = Math.min(...vals), max = Math.max(...vals), span = Math.max(1, max - min);
  const W = 240, H = 46;
  const pts = vals.map((v, i) => `${((i / (vals.length - 1)) * W).toFixed(1)},${(H - 4 - ((v - min) / span) * (H - 8)).toFixed(1)}`).join(' ');
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', `0 0 ${W} ${H}`); s.setAttribute('class', 'mr-spark'); s.setAttribute('preserveAspectRatio', 'none');
  s.innerHTML = `<polyline points="${pts}" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`;
  return s;
}
const bar = (label, v) => h('div', { class: 'mr-sub' }, h('span', null, label), h('div', { class: 'mr-bar' }, h('i', { style: `width:${Math.max(4, Math.min(100, ((v - 50) / 150) * 100))}%` })), h('b', null, f1(v)));

export function mcsmRatingBox(uid) {
  const box = h('section', { class: 'panel mr-box' });
  const how = h('button', { class: 'linkish', type: 'button', onclick: explainRating }, icon('info'), t('mrHow'));
  publicRatings().then((P) => {
    const x = (P.drivers || {})[uid];
    const head = h('div', { class: 'row-between', style: 'margin-bottom:8px' }, h('span', { class: 'label' }, 'MCSM Rating'), how);
    if (!x || !x.e) {
      const n = x ? x.n : 0;
      box.replaceChildren(head, h('div', { class: 'mr-prov' }, h('b', { class: 'display' }, t('mrProvisional')), h('span', null, t('mrRounds', { n, total: RATING_CFG.provisionalRounds })),
        h('div', { class: 'mr-progress' }, Array.from({ length: RATING_CFG.provisionalRounds }, (_, i) => h('i', { class: i < n ? 'on' : '' }))), h('p', { class: 'note', style: 'margin:6px 0 0' }, t('mrProvHint'))));
      return;
    }
    box.replaceChildren(head,
      h('div', { class: 'mr-main' }, h('b', { class: 'display mr-num' }, f1(x.r)), h('span', { class: 'mr-delta ' + (x.dl > 0 ? 'up' : x.dl < 0 ? 'down' : '') }, signed(x.dl)), spark(x.h)),
      h('div', { class: 'mr-subs' }, bar(t('mrPace'), x.q), bar(t('mrRace'), x.rr), bar(t('mrDiscipline'), x.d)),
      h('div', { class: 'mr-facts' },
        h('div', null, h('b', null, x.rel == null ? '–' : Math.round(x.rel) + '%'), h('span', null, t('mrReliability'))),
        h('div', null, h('b', null, f1(x.hi)), h('span', null, t('mrHighest'))),
        h('div', null, h('b', null, f1(x.pf)), h('span', null, t('mrLastPerf'))),
        h('div', null, h('b', null, x.n), h('span', null, t('mrRoundsDone')))));
  }).catch(() => box.remove());
  return box;
}

export function explainRating() {
  const c = RATING_CFG;
  const p = (k, v) => h('p', null, t(k, v));
  openSheet({ title: t('mrHowTitle'), body: h('div', { class: 'md mr-explain' },
    p('mrX1'), h('div', { class: 'mr-formula' }, 'MCSM Rating = 0,25 × Pace + 0,65 × Race + 0,10 × Discipline'),
    h('h3', null, t('mrPace')), p('mrX2', { k: c.kQ }),
    h('h3', null, t('mrRace')), p('mrX3', { s: Math.round(c.sprintShare * 100), m: Math.round(c.mainShare * 100) }),
    h('h3', null, t('mrDiscipline')), p('mrX4', { p: c.penalty }),
    h('h3', null, t('mrHowFair')), p('mrX5', { min: c.min, max: c.max, ce: c.capEstablished, cp: c.capProvisional }),
    h('h3', null, t('mrProvisional')), p('mrX6', { n: c.provisionalRounds }),
    h('h3', null, t('mrReliability')), p('mrX7')) });
}
