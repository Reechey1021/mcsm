// i18n/index.js
// Hungarian first, English second. t(name, { n }) with {placeholders}.
// {al} expands a lobby letter with the right Hungarian article: "az A", "a B".
import { hu } from './hu.js';
import { en } from './en.js';
import { store } from '../core/storage.js';

const DICTS = { hu, en };
export let LANG = store.get('lang', 'hu') === 'en' ? 'en' : 'hu';

export function t(key, vars) {
  let s = DICTS[LANG][key] ?? hu[key] ?? key;
  if (vars) {
    if (vars.l) vars = { ...vars, al: (vars.l === 'A' ? 'az ' : 'a ') + vars.l };
    s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
  }
  return s;
}
export function setLang(l) { LANG = l === 'en' ? 'en' : 'hu'; store.set('lang', LANG); document.documentElement.lang = LANG; }
export const locale = () => (LANG === 'hu' ? 'hu-HU' : 'en-GB');

export function fmtDate(ms, withTime) {
  const o = { timeZone: 'Europe/Budapest', year: 'numeric', month: 'long', day: 'numeric' };
  if (withTime) Object.assign(o, { hour: '2-digit', minute: '2-digit' });
  return new Intl.DateTimeFormat(locale(), o).format(new Date(ms));
}
export function relTime(ms) {
  const diff = (ms - Date.now()) / 1000, a = Math.abs(diff);
  const rtf = new Intl.RelativeTimeFormat(locale(), { numeric: 'auto' });
  if (a < 60) return rtf.format(0, 'second');
  if (a < 3600) return rtf.format(Math.round(diff / 60), 'minute');
  if (a < 86400) return rtf.format(Math.round(diff / 3600), 'hour');
  return rtf.format(Math.round(diff / 86400), 'day');
}
