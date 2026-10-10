// screens/spec.js
// Spec format: each team picks a car from the season's pack for every round, never the same
// car twice, both drivers on it, editable until that round's start. Other teams' picks stay
// hidden until then.
import { h, frag } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { secHead, empty, skelRows } from '../ui/parts.js';
import { toast } from '../ui/sheet.js';
import { t, fmtDate, relTime } from '../i18n/index.js';
import { backend, errorKey } from '../services/backend.js';
import { session, isAdmin } from '../services/session.js';
import { specUsed } from '../model/protest.js';
import { roundTitle } from '../data/tracks.js';

export function specSection(st) {
  const s = st.season;
  if (s.format !== 'spec') return null;
  const mine = session.user ? st.entries.find((e) => e.uid === session.user.uid && e.status !== 'withdrawn') : null;
  const myTeam = mine && mine.snapshot ? mine.snapshot.teamId : null;
  const box = h('div', null, skelRows(2, 60));
  const load = () => backend.picks.list(s.id, { teamId: myTeam, admin: isAdmin() }).then((picks) => {
    const now = Date.now();
    const parts = [];
    if (myTeam) {
      const tm = st.tmap[myTeam];
      parts.push(h('p', { class: 'muted', style: 'margin:0 0 10px' }, t('specMine', { team: tm ? tm.name : '' })),
        h('div', { class: 'stack', style: 'gap:8px' }, s.rounds.map((r) => {
          const cur = picks.find((p) => p.n === r.n && p.teamId === myTeam);
          const used = specUsed(picks, myTeam, r.n);
          const locked = now >= r.date;
          const sel = h('select', { class: 'select', style: 'min-width:0;width:100%', disabled: locked, 'aria-label': t('roundN', { n: r.n }) },
            h('option', { value: '' }, t('specPick')), (s.cars || []).map((c) => h('option', { value: c, selected: cur && cur.car === c, disabled: used.includes(c) }, c + (used.includes(c) ? ` (${t('specUsedShort')})` : ''))));
          sel.addEventListener('change', async () => {
            if (!sel.value) return;
            try { await backend.picks.save(s.id, r.n, myTeam, sel.value); toast(t('specSaved', { n: r.n })); load(); }
            catch (e) { toast(t(e.code === 'spec-used' ? 'specUsed' : errorKey(e)), 'alert'); load(); }
          });
          return h('div', { class: 'round-item', style: 'flex-wrap:wrap' }, h('span', { class: 'no display' }, r.n),
            h('span', { class: 't', style: 'flex:1 1 160px' }, h('b', null, roundTitle(r)), h('span', { class: 'sub' }, locked ? t('specLockedAt') : t('specLocksIn', { rel: relTime(r.date) }))),
            h('div', { style: 'flex:1 1 200px' }, sel));
        })));
    } else parts.push(h('p', { class: 'muted', style: 'margin:0 0 10px' }, t('specInfo')));
    const lockedRounds = s.rounds.filter((r) => now >= r.date);
    if (lockedRounds.length) parts.push(...lockedRounds.map((r) => {
      const ps = picks.filter((p) => p.n === r.n);
      return h('div', { style: 'margin-top:14px' }, h('div', { class: 'label', style: 'margin-bottom:6px' }, t('specPicksOf', { n: r.n })),
        ps.length ? h('div', { class: 'stack', style: 'gap:6px' }, ps.map((p) => h('div', { class: 'row-card' }, h('span', { style: `width:6px;height:28px;border-radius:3px;background:${(st.tmap[p.teamId] || {}).c1 || 'var(--line-2)'}` }), h('span', { class: 'nm' }, h('b', null, (st.tmap[p.teamId] || {}).name || p.teamId)), h('b', null, p.car)))) : h('p', { class: 'note', style: 'margin:0' }, t('specNone')));
    }));
    box.replaceChildren(...parts);
  }).catch(() => box.replaceChildren(empty(t('loadFailed'))));
  load();
  return frag(secHead(t('specTitle')), h('p', { class: 'note', style: 'margin:-6px 0 12px' }, t('specRules', { cars: (s.cars || []).join(', ') })), box);
}
