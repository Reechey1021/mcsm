// ui/controls.js
// Segmented controls, choice chips, switches and form fields.
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { reduced, moveThumb, haptic } from '../core/motion.js';
import { t } from '../i18n/index.js';

/* ===== Segmented control ===== */
export function seg(options, value, onChange, opts = {}) {
  const thumb = h('span', { class: 'thumb' });
  const wrap = h('div', { class: 'seg' + (opts.scroll ? ' scroll' : ''), role: 'group', 'aria-label': opts.label || '' }, thumb);
  const btns = options.map((o) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(o.value === value), dataset: { v: o.value } }, o.label);
    b.addEventListener('click', () => {
      if (b.getAttribute('aria-pressed') === 'true') return;
      btns.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      moveThumb(wrap, b, thumb);
      if (opts.scroll) b.scrollIntoView({ inline: 'nearest', block: 'nearest', behavior: reduced() ? 'auto' : 'smooth' });
      onChange(o.value);
    });
    wrap.append(b); return b;
  });
  const place = () => moveThumb(wrap, btns.find((b) => b.getAttribute('aria-pressed') === 'true'), thumb, { instant: true });
  requestAnimationFrame(place);
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(place);
  wrap._place = place;
  return wrap;
}

// Single-choice chips (wraps onto several lines; no sliding thumb).
export function choice(options, value, onChange, opts = {}) {
  const wrap = h('div', { class: 'choice', role: 'radiogroup', 'aria-label': opts.label || '' });
  const btns = options.map((o) => {
    const b = h('button', { class: 'chip', type: 'button', role: 'radio', 'aria-checked': String(o.value === value), 'aria-pressed': String(o.value === value), disabled: o.disabled || null }, o.label);
    b.addEventListener('click', () => {
      btns.forEach((x) => { const on = x === b; x.setAttribute('aria-pressed', String(on)); x.setAttribute('aria-checked', String(on)); });
      onChange(o.value);
    });
    wrap.append(b); return b;
  });
  return wrap;
}

export function toggle(checked, onChange, opts = {}) {
  const sw = h('button', { class: 'switch', type: 'button', role: 'switch', 'aria-checked': String(!!checked), 'aria-label': opts.label || '', disabled: opts.disabled || null });
  sw.addEventListener('click', () => { const v = sw.getAttribute('aria-checked') !== 'true'; sw.setAttribute('aria-checked', String(v)); haptic(6); onChange(v); });
  return sw;
}

// A labelled form row. Returns { row, input, setError }.
let fid = 0;
export function field(label, inputEl, opts = {}) {
  const id = inputEl.id || ('f' + (++fid));
  inputEl.id = id;
  const err = h('div', { class: 'err', id: id + '-err', role: 'alert' });
  inputEl.setAttribute('aria-describedby', id + '-err');
  const row = h('div', { class: 'f-row' }, h('label', { for: id }, label), inputEl, opts.hint ? h('div', { class: 'hint' }, opts.hint) : null, err);
  const setError = (msg) => { err.textContent = msg || ''; inputEl.setAttribute('aria-invalid', msg ? 'true' : 'false'); };
  // Typing clears a stale error straight away.
  inputEl.addEventListener('input', () => { if (err.textContent) setError(''); });
  return { row, input: inputEl, setError };
}

export function passwordInput(props = {}) {
  const input = h('input', { class: 'input', type: 'password', autocomplete: props.autocomplete || 'current-password', ...props });
  const eye = h('button', { type: 'button', 'aria-label': t('showPassword') }, icon('eye'));
  eye.addEventListener('click', () => {
    const show = input.type === 'password'; input.type = show ? 'text' : 'password';
    eye.replaceChildren(icon(show ? 'eyeOff' : 'eye')); eye.setAttribute('aria-label', t(show ? 'hidePassword' : 'showPassword'));
  });
  const wrap = h('div', { class: 'pw-wrap' }, input, eye);
  wrap.input = input;
  return wrap;
}

// Button with a busy state: await busy(btn, async () => ...)
export async function busy(btn, fn) {
  if (btn.disabled) return;
  const kids = [...btn.childNodes];
  btn.disabled = true; btn.setAttribute('aria-busy', 'true');
  btn.replaceChildren(h('span', { class: 'spin', 'aria-hidden': 'true' }), ...kids.filter((n) => n.nodeType === 3));
  try { return await fn(); } finally { btn.disabled = false; btn.removeAttribute('aria-busy'); btn.replaceChildren(...kids); }
}
