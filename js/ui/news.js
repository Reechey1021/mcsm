// ui/news.js
// News: a feed behind the header button (newest open, older ones as rows that open on their own),
// admin writing (title, picture, formatted text with links), and the welcome carousel shown when
// someone opens the site or signs in. "Don't show again" hides the articles that were shown; a new
// carousel article still appears.
import { h, frag } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { busy, field, toggle } from './controls.js';
import { openSheet, toast } from './sheet.js';
import { formError, empty } from './parts.js';
import { renderMarkdown } from './markdown.js';
import { uploadImage, dropZone } from './upload.js';
import { t, fmtDate } from '../i18n/index.js';
import { backend, errorKey } from '../services/backend.js';
import { isAdmin, signedIn as isSignedIn } from '../services/session.js';
import { cached, invalidate } from '../core/data.js';
import { store } from '../core/storage.js';
import { emit } from '../core/bus.js';

export const loadNews = () => cached('news', () => backend.content.get('news').then((d) => ((d && d.items) || []).slice().sort((a, b) => b.at - a.at)).catch(() => []));
async function saveNews(items) { await backend.content.save('news', { items }); invalidate('news'); emit('news'); }

const seenIds = () => new Set(store.get('newsDismissed', []));
export const unreadCount = (items) => items.filter((a) => a.at > store.get('newsOpenedAt', 0)).length;
export const hasUnread = (items) => unreadCount(items) > 0;

function article(a, { full = true } = {}) {
  return h('article', { class: 'news-art' }, a.imageUrl ? h('div', { class: 'news-img', vars: { 'background-image': `url("${String(a.imageUrl).replace(/"/g, '')}")` } }) : null,
    h('div', { class: 'news-meta' }, fmtDate(a.at)), h('h3', { class: 'display news-title' }, a.title),
    full ? h('div', { class: 'md news-body' }, renderMarkdown(a.body || '')) : null);
}

export function openNewsFeed() {
  store.set('newsOpenedAt', Date.now()); emit('news');
  const body = h('div', null, h('div', { class: 'skel', style: 'height:180px' }));
  const sh = openSheet({ title: t('news'), body });
  const draw = (items) => {
    const admin = isAdmin() ? h('button', { class: 'btn primary block', type: 'button', style: 'margin-bottom:14px', onclick: () => { sh.close(true); editNews(null, items); } }, icon('plus'), t('newsNew')) : null;
    if (!items.length) { body.replaceChildren(admin || '', empty(t('newsEmpty'))); return; }
    const [first, ...rest] = items;
    const tools = (a) => (isAdmin() ? h('div', { style: 'display:flex;gap:8px;margin-top:8px' }, h('button', { class: 'btn small', type: 'button', onclick: () => { sh.close(true); editNews(a, items); } }, icon('edit'), t('edit')), a.carousel ? h('span', { class: 'status live' }, t('newsInCarousel')) : null) : null);
    body.replaceChildren(...[admin, article(first), tools(first),
      rest.length ? h('div', { class: 'label', style: 'margin:18px 0 8px' }, t('newsOlder')) : null,
      ...rest.map((a) => h('button', { class: 'row-card news-row', type: 'button', onclick: () => openSheet({ title: a.title, body: frag(article(a), tools(a)) }) },
        a.imageUrl ? h('span', { class: 'news-thumb', vars: { 'background-image': `url("${String(a.imageUrl).replace(/"/g, '')}")` } }) : h('span', { class: 'news-thumb' }, icon('news')),
        h('span', { class: 'nm' }, h('b', null, a.title), h('span', null, fmtDate(a.at))), icon('chevR', 'chev')))].filter(Boolean));
  };
  loadNews().then(draw).catch(() => body.replaceChildren(empty(t('loadFailed'))));
}

function editNews(a, items) {
  const d = a ? { ...a } : { id: 'n' + Date.now().toString(36), title: '', body: '', imageUrl: '', carousel: true, at: Date.now() };
  const title = h('input', { class: 'input', value: d.title, maxlength: 90 });
  const ta = h('textarea', { class: 'input', rows: 9, style: 'min-height:200px' }, d.body);
  const preview = h('div', { class: 'md news-body', style: 'display:none;padding:12px;border:1px dashed var(--line-2);border-radius:12px' });
  const wrap = (pre, post = pre, ph = '') => { const s = ta.selectionStart, e = ta.selectionEnd, sel = ta.value.slice(s, e) || ph; ta.setRangeText(pre + sel + post, s, e, 'end'); ta.focus(); };
  const tool = (label, fn) => h('button', { class: 'btn small', type: 'button', onclick: fn }, label);
  const bar = h('div', { class: 'md-tools' }, tool('B', () => wrap('**', '**', t('mdBold'))), tool('I', () => wrap('_', '_', t('mdItalic'))),
    tool(t('mdLink'), () => { const url = prompt('https://…', 'https://'); if (url) wrap('[', `](${url})`, t('mdLinkText')); }), tool('• ' + t('mdList'), () => wrap('\n- ', '', t('mdItem'))), tool('H', () => wrap('\n### ', '', t('mdHeading'))),
    tool(t('mdPreview'), () => { const on = preview.style.display === 'none'; preview.style.display = on ? '' : 'none'; ta.style.display = on ? 'none' : ''; preview.replaceChildren(renderMarkdown(ta.value)); }));
  const zone = dropZone({ label: d.imageUrl ? t('newsImageReplace') : t('newsImage'), hint: t('coverDropHint').split('.')[0] + '.', value: d.imageUrl, onFile: async (f) => {
    try { d.imageUrl = await uploadImage('seasons/news/img', f, { max: 1400 }); return d.imageUrl; } catch (e) { toast(t(errorKey(e)), 'alert'); return null; }
  } });
  const err = h('div');
  const save = h('button', { class: 'btn primary block', type: 'button', 'data-haptic': '' }, icon('check'), a ? t('save') : t('newsPublish'));
  const del = a ? h('button', { class: 'btn danger block', type: 'button' }, icon('trash'), t('delete')) : null;
  const car = toggle(d.carousel !== false, (v) => { d.carousel = v; }, { label: t('newsCarousel') });
  save.addEventListener('click', () => busy(save, async () => {
    d.title = title.value.trim(); d.body = ta.value.trim();
    if (!d.title) { err.replaceChildren(formError(t('newsNeedTitle'))); return; }
    // republishing to the carousel counts as new, so it shows again even for people who closed it
    if (d.carousel && (!a || !a.carousel)) d.carouselAt = Date.now();
    try { const next = [d, ...items.filter((x) => x.id !== d.id)]; await saveNews(next); sh.close(true); toast(t('saved')); openNewsFeed(); }
    catch (e) { err.replaceChildren(formError(t(errorKey(e)))); }
  }));
  if (del) del.addEventListener('click', () => busy(del, async () => { try { await saveNews(items.filter((x) => x.id !== d.id)); sh.close(true); toast(t('deleted')); } catch (e) { err.replaceChildren(formError(t(errorKey(e)))); } }));
  const sh = openSheet({ title: a ? t('newsEdit') : t('newsNew'), body: h('div', { class: 'form' }, err, field(t('newsTitle'), title).row, h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('newsImageLabel')), zone),
    h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('newsBody')), bar, ta, preview, h('span', { class: 'hint' }, t('newsBodyHint'))),
    h('div', { class: 'toggle-row' }, h('span', null, t('newsCarousel'), h('small', null, t('newsCarouselHint'))), car), save, del) });
}

// Welcome carousel: once per visit, after opening the site or signing in.
let shownThisVisit = false;
export async function showWelcomeNews(force = false) {
  if (!isSignedIn()) return;
  if (shownThisVisit && !force) return;
  try { if (sessionStorage.getItem('mcsm:newsShown') && !force) return; } catch { /* private mode */ }
  const items = (await loadNews()).filter((a) => a.carousel && !seenIds().has(a.id + ':' + (a.carouselAt || a.at))).sort((a, b) => a.at - b.at);
  if (!items.length) return;
  shownThisVisit = true;
  try { sessionStorage.setItem('mcsm:newsShown', '1'); } catch { /* */ }
  const track = h('div', { class: 'nc-track' }, items.map((a) => h('div', { class: 'nc-slide' }, article(a))));
  const dots = h('div', { class: 'nc-dots' }, items.map((_, i) => h('i', { class: i === 0 ? 'on' : '' })));
  track.addEventListener('scroll', () => { const i = Math.round(track.scrollLeft / track.clientWidth); [...dots.children].forEach((d, k) => d.classList.toggle('on', k === i)); }, { passive: true });
  const step = (dir) => track.scrollBy({ left: dir * track.clientWidth, behavior: 'smooth' });
  const never = h('input', { type: 'checkbox', id: 'nc-never' });
  const html = document.documentElement, prevOverflow = html.style.overflow;
  const close = () => {
    html.style.overflow = prevOverflow;
    if (never.checked) store.set('newsDismissed', [...seenIds(), ...items.map((a) => a.id + ':' + (a.carouselAt || a.at))]);
    overlay.classList.add('out'); setTimeout(() => overlay.remove(), 220);
  };
  const overlay = h('div', { class: 'nc-overlay', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('news') },
    h('div', { class: 'nc-card' },
      h('div', { class: 'nc-head' }, h('b', { class: 'display' }, t('newsWelcome')), h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('close'), onclick: close }, icon('close'))),
      track,
      h('div', { class: 'nc-foot' }, items.length > 1 ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': '‹', onclick: () => step(-1) }, icon('chevL')) : null, dots, items.length > 1 ? h('button', { class: 'icon-btn', type: 'button', 'aria-label': '›', onclick: () => step(1) }, icon('chevR')) : null),
      h('div', { class: 'nc-bottom' }, h('label', { class: 'nc-never' }, never, t('newsDontShow')), h('button', { class: 'btn primary', type: 'button', onclick: close }, t('close')))));
  overlay.addEventListener('click', (e) => { if (e.target === overlay) close(); });
  html.style.overflow = 'hidden';
  document.body.append(overlay);
}

// "Install the app": add to the home screen (the site's manifest makes it a standalone app).
let deferred = null;
if (typeof window !== 'undefined') window.addEventListener('beforeinstallprompt', (e) => { e.preventDefault(); deferred = e; });
export const isInstalled = () => window.matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
export function openInstall() {
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
  const direct = deferred ? h('button', { class: 'btn primary block', type: 'button', onclick: async () => { deferred.prompt(); await deferred.userChoice.catch(() => {}); deferred = null; sh.close(true); } }, icon('download'), t('installNow')) : null;
  const steps = (title, list, on) => h('section', { class: 'panel pad', style: on ? 'border-color:var(--accent-text)' : '' }, h('b', { style: 'display:block;margin-bottom:6px' }, title), h('ol', { style: 'margin:0;padding-left:20px;line-height:1.7' }, list.map((x) => h('li', null, x))));
  const sh = openSheet({ title: t('installTitle'), body: h('div', { class: 'stack', style: 'gap:12px' }, h('p', { class: 'muted', style: 'margin:0' }, t('installIntro')), direct,
    steps('iPhone / iPad (Safari)', [t('installIos1'), t('installIos2'), t('installIos3')], ios),
    steps('Android (Chrome)', [t('installAnd1'), t('installAnd2'), t('installAnd3')], !ios)) });
}
