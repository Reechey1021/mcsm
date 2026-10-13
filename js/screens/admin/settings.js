// screens/admin/settings.js
// Connections that are set once: the admin function's address and the Web Push key.
import { h, frag } from '../../core/dom.js';
import { icon } from '../../core/icons.js';
import { busy, field } from '../../ui/controls.js';
import { pageTitle, backLink } from '../../ui/parts.js';
import { toast } from '../../ui/sheet.js';
import { t } from '../../i18n/index.js';
import { backend, errorKey } from '../../services/backend.js';
import { isOwner } from '../../services/session.js';

export function screenSettings() {
  const urlIn = h('input', { class: 'input', type: 'url', placeholder: 'https://mcsm-admin-….run.app' });
  const vapidIn = h('input', { class: 'input', placeholder: 'BL…', autocomplete: 'off' });
  backend.admin.functionsConfig().then((c) => { if (c && c.url && !String(c.url).startsWith('fake:')) urlIn.value = c.url; });
  backend.content.get('push').then((c) => { if (c && c.vapidKey) vapidIn.value = c.vapidKey; }).catch(() => {});
  const saveUrl = h('button', { class: 'btn small', type: 'button' }, icon('check'), t('save'));
  saveUrl.addEventListener('click', () => busy(saveUrl, async () => { try { await backend.config.save('functions', { url: urlIn.value.trim() }); await backend.content.save('endpoints', { fn: urlIn.value.trim() }); toast(t('saved')); } catch (e) { toast(t(errorKey(e)), 'alert'); } }));
  const ping = h('button', { class: 'btn small', type: 'button', disabled: !isOwner() }, icon('bolt'), t('gsTest'));
  ping.addEventListener('click', () => busy(ping, async () => { try { await backend.admin.call('ping', {}); toast(t('fnOk')); } catch (e) { toast(t(errorKey(e)), 'alert'); } }));
  const saveVapid = h('button', { class: 'btn small', type: 'button' }, icon('check'), t('save'));
  saveVapid.addEventListener('click', () => busy(saveVapid, async () => { try { await backend.content.save('push', { vapidKey: vapidIn.value.trim() }); toast(t('saved')); } catch (e) { toast(t(errorKey(e)), 'alert'); } }));
  const modelIn = h('input', { class: 'input', placeholder: 'gemini-flash-lite-latest', autocomplete: 'off' });
  backend.config.get('ai').then((c) => { if (c && c.model) modelIn.value = c.model; }).catch(() => {});
  const saveModel = h('button', { class: 'btn small', type: 'button' }, icon('check'), t('save'));
  saveModel.addEventListener('click', () => busy(saveModel, async () => { try { await backend.config.save('ai', { model: modelIn.value.trim() }); toast(t('saved')); } catch (e) { toast(t(errorKey(e)), 'alert'); } }));
  return frag(backLink(t('admin'), '#/admin'), pageTitle(t('settingsTitle'), t('settingsSub')),
    h('section', { class: 'panel pad stack', style: 'gap:12px' }, h('h2', { class: 'display', style: 'font-size:24px' }, t('fnTitle')), h('p', { class: 'note', style: 'margin:0' }, t('fnHelp')),
      field(t('fnUrl'), urlIn, { hint: t('fnUrlHint') }).row, h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, saveUrl, ping)),
    h('section', { class: 'panel pad stack', style: 'gap:12px;margin-top:14px' }, h('h2', { class: 'display', style: 'font-size:24px' }, t('pushTitle')), h('p', { class: 'note', style: 'margin:0' }, t('pushAdminHelp')),
      field(t('vapidKey'), vapidIn, { hint: t('vapidHint') }).row, h('div', null, saveVapid)),
    h('section', { class: 'panel pad stack', style: 'gap:12px;margin-top:14px' }, h('h2', { class: 'display', style: 'font-size:24px' }, t('aiSettingsTitle')), h('p', { class: 'note', style: 'margin:0' }, t('aiSettingsHelp')),
      field(t('aiModel'), modelIn, { hint: t('aiModelHint') }).row, h('div', null, saveModel)));
}
