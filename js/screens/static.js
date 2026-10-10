// screens/static.js
// Text pages: coming-soon placeholders, the editable rules page and not-found.
import { h, frag } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { seg, busy } from '../ui/controls.js';
import { pageTitle, empty, skelRows, backLink, formError } from '../ui/parts.js';
import { renderMarkdown } from '../ui/markdown.js';
import { toast } from '../ui/sheet.js';
import { t, LANG, fmtDate } from '../i18n/index.js';
import { backend, errorKey } from '../services/backend.js';
import { isAdmin } from '../services/session.js';
import { go } from '../router.js';

export function screenSoon(which) {
  return frag(pageTitle(t(which === 'seasons' ? 'navSeasons' : 'navResults')),
    empty(h('span', null, h('b', { style: 'display:block;color:var(--ink);margin-bottom:6px' }, t('soonTitle')), t(which === 'seasons' ? 'soonSeasons' : 'soonResults'))));
}

// Starting text until an admin saves the real rules (it summarises the Biblia).
export const DEFAULT_RULES = {
  hu: `# Nevezés
A nevezés az első forduló előtt 14 nappal nyílik, kizárólag ezen az oldalon. A nevezéskori profiladatokért (név, PSN ID, rajtszám, csapat) a versenyző felel.

# Prekvalifikáció
- Három PQ-alkalom van (péntek, szombat, vasárnap), mindenki **egyen** vehet részt.
- A legjobb kör számít; a kiemelt pilóták PQ nélkül kerülnek az A lobbyba.
- A PQ rangsora adja az első forduló A, B és C lobbyját.

# Pontozás
Fordulónként kvalifikáció, Sprintfutam és Gran'Prix. A futampontok lobbynként lépcsőzöttek (A: 315-től, B: 215-től, C: 115-től), a kvalifikáció 23 ponttól 1-ig, a leggyorsabb kör +3 pont mindkét futamon.

# Lobbyváltás
Minden forduló után az A lobby utolsó két helyezettje helyet cserél a B lobby első kettőjével, és ugyanígy a B és a C között. Aki nem jelent meg, a lobbyja végére kerül, és nem juthat fel.

# Csapatok
Egy fordulóban legfeljebb két pilóta indulhat egy csapatért, egy szezonban legfeljebb három különböző. Szezon közben nincs csapatváltás.

# Óvások
- Óvni a versenynap 21:30-tól hétfő 20:00-ig lehet, itt az oldalon.
- A döntést legalább három bíró hozza, és indoklással nyilvános.
- Időbüntetések: 1, 3, 5, 7, 10, 15, 20, 25, 30 mp. Egy fordulón belül három időbüntetés automatikus kizárást jelent.`,
};

export function screenRules() {
  const box = h('div', null, skelRows(5, 60));
  backend.content.get('rules').then((doc) => {
    const src = (doc && (doc[LANG] || doc.hu)) || DEFAULT_RULES.hu;
    box.replaceChildren(
      LANG === 'en' && doc && !doc.en ? h('div', { class: 'callout', style: 'margin-bottom:14px' }, icon('info'), h('span', null, t('rulesHuOnly'))) : null,
      h('section', { class: 'panel pad' }, renderMarkdown(src)),
      doc && doc.updatedAt ? h('p', { class: 'note' }, t('lastUpdated', { date: fmtDate(doc.updatedAt) })) : h('p', { class: 'note' }, t('rulesDefaultNote')));
  }).catch(() => box.replaceChildren(empty(t('loadFailed'))));
  return frag(h('div', { class: 'row-between', style: 'flex-wrap:wrap' }, h('h1', { class: 'display page-title' }, t('rules')),
    isAdmin() ? h('a', { class: 'btn small', href: '#/szabalyzat/szerkesztes' }, icon('edit'), t('edit')) : null), box);
}

export function screenRulesEdit() {
  const root = h('div', null, skelRows(4, 80));
  backend.content.get('rules').then((doc) => {
    const d = { hu: (doc && doc.hu) || DEFAULT_RULES.hu, en: (doc && doc.en) || '' };
    let lang = 'hu', mode = 'edit';
    const area = h('textarea', { class: 'input', style: 'min-height:420px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:14px;line-height:1.5' });
    const preview = h('section', { class: 'panel pad', style: 'display:none' });
    const sync = () => { area.value = d[lang]; preview.replaceChildren(renderMarkdown(d[lang] || '')); area.style.display = mode === 'edit' ? '' : 'none'; preview.style.display = mode === 'edit' ? 'none' : ''; };
    area.addEventListener('input', () => { d[lang] = area.value; });
    const err = h('div');
    const save = h('button', { class: 'btn primary', type: 'button', 'data-haptic': '' }, icon('check'), t('save'));
    save.addEventListener('click', () => busy(save, async () => {
      try {
        await backend.content.save('rules', { hu: d.hu, en: d.en.trim() ? d.en : null });
        await backend.audit.add({ action: 'content.rules', target: 'rules', targetName: t('rules'), before: null, after: null, reason: null });
        toast(t('saved')); go('/szabalyzat');
      } catch (e) { err.replaceChildren(formError(t(errorKey(e)))); }
    }));
    sync();
    root.replaceChildren(h('h1', { class: 'display page-title' }, t('editRules')), h('p', { class: 'page-sub' }, t('rulesEditHelp')),
      h('div', { style: 'display:flex;gap:10px;flex-wrap:wrap;margin-bottom:12px' },
        seg([{ value: 'hu', label: 'Magyar' }, { value: 'en', label: 'English' }], lang, (v) => { lang = v; sync(); }),
        seg([{ value: 'edit', label: t('edit') }, { value: 'preview', label: t('preview') }], mode, (v) => { mode = v; sync(); })),
      err, area, preview, h('div', { class: 'entry-bar' }, h('span', { class: 'prog' }, t('markdownHint')), save));
  }).catch(() => root.replaceChildren(empty(t('loadFailed'))));
  return frag(backLink(t('rules'), '#/szabalyzat'), root);
}

export function screenNotFound(msg) {
  return empty(typeof msg === 'string' ? msg : t('notFound'), h('a', { class: 'btn', href: '#/' }, t('navHome')));
}
