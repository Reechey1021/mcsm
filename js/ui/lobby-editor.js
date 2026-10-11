// ui/lobby-editor.js
// Editing and showing GT7 lobby settings. Dropdowns for choices, a ticker (− value +, plus a
// slider) for numbers like tyre wear or fuel, and chips for custom weather cards.
import { h, frag } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { t } from '../i18n/index.js';
import { LOBBY_FIELDS, valueText, lobbyLine, visibleFields } from '../data/lobby-settings.js';

function ticker(fd, value, onChange) {
  let v = value;
  const out = h('b', { class: 'tick-val' }, valueText(fd, v));
  const range = h('input', { type: 'range', min: fd.min, max: fd.max, step: 1, value: v, 'aria-label': fd.label });
  const set = (x) => { v = Math.max(fd.min, Math.min(fd.max, x)); out.textContent = valueText(fd, v); range.value = v; onChange(v); };
  range.addEventListener('input', () => set(Number(range.value)));
  return h('div', { class: 'ticker' }, h('div', { class: 'tick-row' },
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': '−', onclick: () => set(v - 1) }, icon('minus')), out,
    h('button', { class: 'icon-btn', type: 'button', 'aria-label': '+', onclick: () => set(v + 1) }, icon('plus'))), range);
}

function multi(fd, value, onChange) {
  const picked = new Set(value || []);
  return h('div', { class: 'choice multi lobby-chips' }, fd.options.map((o) => {
    const code = o.split(' | ')[0];
    const b = h('button', { class: 'chip', type: 'button', title: o, 'aria-pressed': String(picked.has(o)) }, code);
    b.addEventListener('click', () => { picked.has(o) ? picked.delete(o) : picked.add(o); b.setAttribute('aria-pressed', String(picked.has(o))); onChange(fd.options.filter((x) => picked.has(x))); });
    return b;
  }));
}

// values: { session: { key: value } } (edited in place). sessions: which sections, in order.
export function lobbyEditor(values, sessions, { open = 0 } = {}) {
  const box = h('div', { class: 'stack', style: 'gap:8px' });
  sessions.forEach((sk, si) => {
    const body = h('div', { class: 'stack', style: 'gap:10px;padding:8px 0 4px' });
    const draw = () => body.replaceChildren(...visibleFields(sk, values[sk]).map((fd) => {
      const cur = values[sk][fd.k];
      const lbl = h('span', null, `${fd.icon} ${fd.label || t('weatherPreset')}`);
      if (fd.type === 'mult' || fd.type === 'num') return h('div', { class: 'lobby-field' }, lbl, ticker(fd, cur, (v) => { values[sk][fd.k] = v; }));
      if (fd.type === 'multi') return h('div', { class: 'lobby-field' }, lbl, multi(fd, cur, (v) => { values[sk][fd.k] = v; }), h('span', { class: 'hint' }, t('cardsHint')));
      const sel = h('select', { class: 'select' }, fd.options.map((o) => h('option', { value: o, selected: cur === o }, o)));
      if (!fd.options.includes(cur)) sel.prepend(h('option', { value: cur, selected: true }, cur));
      sel.addEventListener('change', () => { values[sk][fd.k] = sel.value; if (LOBBY_FIELDS[sk].some((x) => x.showIf)) draw(); });
      return h('label', { class: 'lobby-field' }, lbl, sel);
    }));
    draw();
    box.append(h('details', { class: 'lobby-sec', open: si === open }, h('summary', null, t('lobbySes_' + sk), icon('down', 'chev')), body));
  });
  return box;
}

// Read-only, as the drivers see it in the practice room sheet.
export function lobbyView(values, sessions) {
  return h('div', { class: 'stack', style: 'gap:8px' }, sessions.map((sk, i) => h('details', { class: 'lobby-sec', open: i === 0 },
    h('summary', null, t('lobbySes_' + sk), icon('down', 'chev')),
    h('div', { class: 'lobby-list' }, visibleFields(sk, values[sk]).map((fd) => h('div', { class: 'lobby-line' }, lobbyLine(fd, values[sk][fd.k])))))));
}
