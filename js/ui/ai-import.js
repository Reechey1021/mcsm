// ui/ai-import.js
// "Read from screenshots": pick the screenshots of one result (e.g. P1–8 and P9–16), the AI reads
// them, every row is matched to a driver we know, and the admin checks it before anything is used.
// Nothing is saved here: "Apply" only fills the editor below, which still needs Save.
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { busy } from './controls.js';
import { formError } from './parts.js';
import { toast } from './sheet.js';
import { t } from '../i18n/index.js';
import { errorKey } from '../services/backend.js';
import { readResultShots } from '../services/ai-results.js';
import { matchRows } from '../model/name-match.js';
import { fullName } from '../model/profile.js';

// people: [{ uid, psn, firstName, lastName }]; onApply(rows with uid) -> fills the editor
export function aiImportPanel({ session, people, onApply }) {
  let files = [];
  const thumbs = h('div', { class: 'ai-thumbs' });
  const input = h('input', { type: 'file', accept: 'image/*', multiple: true, style: 'display:none' });
  const drawThumbs = () => thumbs.replaceChildren(...files.map((f, i) => {
    const url = URL.createObjectURL(f);
    return h('div', { class: 'ai-thumb', style: `background-image:url("${url}")` }, h('span', null, i + 1), h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('delete'), onclick: () => { files.splice(i, 1); drawThumbs(); read.disabled = !files.length; } }, icon('close')));
  }));
  const zone = h('button', { class: 'dropzone ai-zone', type: 'button' }, icon('plus'), h('b', null, t('aiPick')), h('small', null, t('aiPickHint')));
  const take = (list) => { files = [...files, ...[...list].filter((f) => /^image\//.test(f.type))].slice(0, 6); drawThumbs(); read.disabled = !files.length; };
  zone.addEventListener('click', () => input.click());
  input.addEventListener('change', () => { take(input.files); input.value = ''; });
  ['dragenter', 'dragover'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.add('drag'); }));
  ['dragleave', 'drop'].forEach((ev) => zone.addEventListener(ev, (e) => { e.preventDefault(); zone.classList.remove('drag'); }));
  zone.addEventListener('drop', (e) => take(e.dataTransfer.files));
  const out = h('div');
  const read = h('button', { class: 'btn primary', type: 'button', disabled: true, 'data-haptic': '' }, icon('bolt'), t('aiRead'));
  read.addEventListener('click', () => busy(read, async () => {
    out.replaceChildren(h('p', { class: 'note' }, t('aiReading')));
    try {
      const res = await readResultShots(session, files, { hint: people });
      review(matchRows(res.results || [], people), res);
    } catch (e) { out.replaceChildren(formError(t({ 'ai-missing': 'aiMissing', 'ai-quota': 'aiQuota', 'ai-error': 'aiError' }[e.code] || errorKey(e)) + (e.message ? ` (${e.message})` : ''))); }
  }));

  function review(rows, res) {
    const byUid = Object.fromEntries(people.map((p) => [p.uid, p]));
    const missing = () => people.filter((p) => !rows.some((r) => r.uid === p.uid));
    const list = h('div', { class: 'ai-rows' });
    const miss = h('p', { class: 'note' });
    const draw = () => {
      list.replaceChildren(...rows.map((r) => {
        const sel = h('select', { class: 'select' }, h('option', { value: '' }, t('aiNoMatch')), ...people.slice().sort((a, b) => fullName(a).localeCompare(fullName(b), 'hu')).map((p) => h('option', { value: p.uid, selected: r.uid === p.uid }, `${fullName(p)} (${p.psn})`)));
        sel.addEventListener('change', () => { const other = rows.find((x) => x !== r && x.uid === sel.value); if (other) { other.uid = null; other.sure = false; } r.uid = sel.value || null; r.sure = !!r.uid; draw(); });
        const time = [r.bestLap, r.totalTime || r.gap].filter(Boolean).join('  ·  ');
        return h('div', { class: 'ai-row ' + (!r.uid ? 'bad' : r.sure ? 'ok' : 'check') },
          h('b', { class: 'display num ai-pos' }, r.position),
          h('div', { class: 'ai-read' }, h('span', { class: 'ai-name' }, r.displayName || '?'), h('small', null, [time, r.status !== 'finished' ? r.status.toUpperCase() : ''].filter(Boolean).join('  ·  ')),
            (r.warnings || []).length ? h('small', { class: 'ai-warn' }, '⚠ ' + r.warnings.join(' · ')) : null),
          sel);
      }));
      const m = missing();
      miss.textContent = m.length ? t('aiMissingDrivers', { list: m.map((p) => p.psn).join(', ') }) : '';
    };
    draw();
    const apply = h('button', { class: 'btn primary block', type: 'button', 'data-haptic': '' }, icon('check'), t('aiApply'));
    apply.addEventListener('click', () => {
      const ok = rows.filter((r) => r.uid);
      if (!ok.length) { toast(t('aiNothing'), 'alert'); return; }
      onApply(ok.slice().sort((a, b) => a.position - b.position));
      toast(t('aiApplied', { n: ok.length }));
    });
    const unsure = rows.filter((r) => !r.sure).length;
    out.replaceChildren(h('div', { class: 'callout' + (unsure ? ' warn' : ''), style: 'display:block;margin-top:8px' }, h('b', null, t('aiReadDone', { n: rows.length })), ' ', unsure ? t('aiCheckRows', { n: unsure }) : t('aiAllMatched')),
      res && res.title ? h('p', { class: 'note' }, t('aiTitle', { title: res.title })) : null, list, miss, apply);
    void byUid;
  }

  return h('details', { class: 'panel ai-panel', open: true }, h('summary', null, icon('bolt'), t('aiTitleBox')),
    h('div', { class: 'stack', style: 'gap:10px;padding:0 16px 16px' }, h('p', { class: 'note', style: 'margin:0' }, t('aiIntro')), zone, input, thumbs, h('div', null, read), out));
}
