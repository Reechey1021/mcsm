// ui/confirm.js
// "Are you sure? Everyone will be notified." in front of every publish that sends notifications.
// Resolves true only when the publish button inside is pressed; the notification fires after.
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { openSheet } from './sheet.js';
import { t } from '../i18n/index.js';
import { backend } from '../services/backend.js';

export function confirmPublish({ title, text, draftHint = true, label } = {}) {
  // automated tests in test mode only (?fakecloud&autoconfirm)
  try { if (backend.kind === 'fake' && new URLSearchParams(location.search).has('autoconfirm')) return Promise.resolve(true); } catch { /* */ }
  return new Promise((resolve) => {
    let answered = false;
    const done = (v) => { if (answered) return; answered = true; resolve(v); };
    const yes = h('button', { class: 'btn primary block confirm-publish', type: 'button', 'data-haptic': '' }, icon('flag'), label || t('publishFinal'));
    const no = h('button', { class: 'btn block', type: 'button' }, t('cancel'));
    const sh = openSheet({ title: title || t('confirmPublishTitle'), onClose: () => done(false), body: h('div', { class: 'stack', style: 'gap:12px' },
      h('div', { class: 'callout warn', style: 'display:block' }, h('b', { style: 'display:block;margin-bottom:4px' }, text || t('confirmPublishText')), draftHint ? t('confirmPublishDraft') : null),
      yes, no) });
    yes.addEventListener('click', () => { done(true); sh.close(true); });
    no.addEventListener('click', () => { done(false); sh.close(true); });
  });
}
