// ui/car-picker.js
// A text field with suggestions from the GT7 car list (imported once by an admin from
// GT GridStats). Typing anything else is still allowed.
import { h } from '../core/dom.js';
import { t } from '../i18n/index.js';
import { cars as loadCars } from '../core/data.js';

export function carField(value, onChange, opts = {}) {
  const input = h('input', { class: 'input', value: value || '', maxlength: 90, placeholder: opts.placeholder || t('carSearchPh'), autocomplete: 'off', 'aria-autocomplete': 'list' });
  const list = h('div', { class: 'car-sugg', role: 'listbox', style: 'display:none' });
  const wrap = h('div', { class: 'car-pick' }, input, list);
  let catalog = null;
  loadCars().then((c) => { catalog = c; }).catch(() => { catalog = []; });
  const close = () => { list.style.display = 'none'; };
  const pick = (name) => { input.value = name; onChange(name); close(); input.dispatchEvent(new Event('change')); };
  const show = () => {
    const q = input.value.trim().toLowerCase();
    if (!catalog || !catalog.length || q.length < 2) { close(); return; }
    const words = q.split(/\s+/);
    const found = catalog.filter((c) => (!opts.cls || c.cls === opts.cls) && words.every((w) => (c.name + ' ' + (c.maker || '') + ' ' + (c.cls || '')).toLowerCase().includes(w))).slice(0, 8);
    if (!found.length) { close(); return; }
    list.replaceChildren(...found.map((c) => h('button', { type: 'button', role: 'option', onmousedown: (e) => e.preventDefault(), onclick: () => pick(c.name) }, h('span', null, c.name), c.cls ? h('span', { class: 'cls' }, c.cls) : null)));
    list.style.display = '';
  };
  input.addEventListener('input', () => { onChange(input.value); show(); });
  input.addEventListener('focus', show);
  input.addEventListener('blur', () => setTimeout(close, 150));
  input.addEventListener('keydown', (e) => { if (e.key === 'Escape') close(); if (e.key === 'Enter' && list.style.display !== 'none' && list.firstChild) { e.preventDefault(); list.firstChild.click(); } });
  wrap.input = input;
  return wrap;
}
