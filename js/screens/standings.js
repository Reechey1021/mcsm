// screens/standings.js
// Eredmények: championship standings for any season with results.
import { swapIn } from '../core/motion.js';
import { h, frag } from '../core/dom.js';
import { seg } from '../ui/controls.js';
import { empty, skelRows, pageTitle } from '../ui/parts.js';
import { standingsBlock } from '../ui/tower.js';
import { t } from '../i18n/index.js';
import { seasons as loadSeasons } from '../core/data.js';
import { loadRace } from '../core/race-data.js';
import { go } from '../router.js';
import { hallView } from './hall.js';

const ui = { kind: 'drivers', upTo: null, sid: null, view: 'table' };
const RESULT_STATES = ['pq', 'running', 'finished', 'archived'];

export function screenStandings({ sid }, query) {
  if (query && query.get('nezet') === 'dicsosegfal') ui.view = 'hall';
  const viewSeg = seg([{ value: 'table', label: t('standings') }, { value: 'hall', label: t('hallOfFame') }], ui.view, (v) => { ui.view = v; history.replaceState(history.state, '', v === 'hall' ? '#/eredmenyek?nezet=dicsosegfal' : '#/eredmenyek'); paintView(true); });
  const head = h('div');
  const box = h('div', null, skelRows(10, 54));
  const wrap = h('div');
  const paintView = (anim) => { wrap.replaceChildren(...(ui.view === 'hall' ? [hallView()] : [head, box])); if (anim) swapIn(wrap); };
  loadSeasons().then(async (all) => {
    const list = all.filter((s) => RESULT_STATES.includes(s.state)).sort((a, b) => (a.state === 'running' ? -1 : 0) - (b.state === 'running' ? -1 : 0) || b.no - a.no);
    if (!list.length) { box.replaceChildren(empty(t('noResultsYet'))); return; }
    const chosen = list.find((s) => s.id === sid) || list[0];
    if (ui.sid !== chosen.id) { ui.sid = chosen.id; ui.upTo = null; }
    const sel = h('select', { class: 'select', 'aria-label': t('season') }, list.map((s) => h('option', { value: s.id, selected: s.id === chosen.id }, `MCSM${s.no}${s.name ? ' – ' + s.name : ''}`)));
    sel.addEventListener('change', () => go('/eredmenyek/' + sel.value));
    head.replaceChildren(h('div', { style: 'margin:-6px 0 16px' }, sel));
    const ctx = await loadRace(chosen.id);
    box.replaceChildren(ctx && ctx.built.length ? standingsBlock(ctx, ui, seg) : empty(t('noResultsYet')));
  }).catch(() => box.replaceChildren(empty(t('loadFailed'))));
  paintView();
  return frag(h('h1', { class: 'display page-title' }, t('navResults')), h('div', { style: 'margin-bottom:14px' }, viewSeg), wrap);
}
