// screens/protests.js
// Protests from both sides: drivers file and follow their cases, everyone reads published
// decisions, and the Versenybíróság works its cases (panel, votes, notes, decision,
// publishing the penalty, which then reorders the results by itself).
import { penaltyLines } from '../model/protest.js';
import { toggle } from '../ui/controls.js';
import { h, frag } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { haptic, reduced } from '../core/motion.js';
import { seg, busy, field, choice } from '../ui/controls.js';
import { avatar, empty, backLink, formError, secHead, skelRows, pageTitle } from '../ui/parts.js';
import { openSheet, toast } from '../ui/sheet.js';
import { confirmPublish } from '../ui/confirm.js';
import { t, fmtDate, relTime } from '../i18n/index.js';
import { backend, errorKey } from '../services/backend.js';
import { session, signedIn, isAdmin, roles } from '../services/session.js';
import { loadRace } from '../core/race-data.js';
import { seasons as loadSeasons, users as loadUsers, invalidate } from '../core/data.js';
import { fullName } from '../model/profile.js';
import { LIVE_STATES } from '../model/season.js';
import { lobbyOf, SESSIONS } from '../model/race.js';
import { protestWindow, windowState, eligibility, defaultPanel, tally, dsqFlags, OUTCOMES, TIME_STEPS, MIN_VOTES, isJudgeProfile } from '../model/protest.js';
import { roundTitle } from '../data/tracks.js';
import { go } from '../router.js';
import { notifyUsers, judgeUids } from '../services/notify.js';

export const isJudge = () => { const r = roles(); return !!(r.judge || r.judgeChair || r.admin || r.owner); };
export const isChair = () => { const r = roles(); return !!(r.judgeChair || r.admin || r.owner); };
const sesName = (S) => ({ Q: t('quali'), S: 'Sprint', GP: "Gran'Prix" }[S] || S);
const listOpts = () => ({ judge: isJudge(), uid: session.user ? session.user.uid : null });
const isAdminRole = () => { const r = roles(); return !!(r.admin || r.owner); };
const entrantOf = (ctx) => !!(session.user && ctx.entries.some((e) => e.uid === session.user.uid && e.status !== 'withdrawn'));
const mayView = (ctx) => isJudge() || entrantOf(ctx);
const nameOf = (ctx, uid) => fullName(ctx.snaps[uid] || {}) || uid;
// Who the protest is from. Anyone can file for anyone, so this can differ from the filer (p.by);
// stewards' own investigations have none.
export const complainantOf = (p) => (p.type === 'judge' ? null : p.complainant || p.by);

const lineText = (l, ctx) => {
  const who = nameOf(ctx, l.target);
  if (l.kind === 'time') return t('outcomeTime', { s: l.seconds, who });
  if (l.kind === 'other') return `${who}: ${l.other || t('outcome_other')}`;
  return `${who}: ${t('outcome_' + l.kind)}`;
};
export function outcomeText(d, ctx) {
  if (!d) return '';
  const ls = penaltyLines(d);
  return ls.length ? ls.map((l) => lineText(l, ctx)).join(' · ') : t('outcome_none');
}
// "#21 HORVÁTH Richárd · IGTSH_Reechey-" (PSN shown: it's what everyone sees in the game)
const driverLabel = (ctx, uid) => { const p = ctx.person ? ctx.person(uid) : ctx.snaps[uid] || {}; return `#${p.raceNumber ?? ''} ${(p.lastName || '').toLocaleUpperCase('hu')} ${p.firstName || ''}${p.psn ? ' · ' + p.psn : ''}`.replace(/\s+/g, ' ').trim(); };
// Anyone who raced in that round can be penalised; the parties come first.
function penaltyCandidates(ctx, p) {
  const doc = ctx.roundDoc(p.n) || {};
  const all = [...new Set(Object.values(doc.lobbies || {}).flat())];
  const parties = [...new Set([...(p.involved || []), complainantOf(p)])].filter(Boolean);
  const rest = all.filter((u) => !parties.includes(u)).sort((a, b) => nameOf(ctx, a).localeCompare(nameOf(ctx, b), 'hu'));
  return [...parties, ...rest];
}
// Editable list of penalty lines: driver, kind, seconds (time) or text (other). Empty = no penalty.
function penaltyEditor(ctx, p, lines, onChange) {
  const box = h('div', { class: 'stack', style: 'gap:8px' });
  const cands = penaltyCandidates(ctx, p);
  const KINDS = ['warning', 'time', 'dsq', 'other'];
  const draw = () => {
    box.replaceChildren(...lines.map((l, i) => {
      const who = h('select', { class: 'select', style: 'width:100%' }, cands.map((u) => h('option', { value: u, selected: u === l.target }, driverLabel(ctx, u))));
      who.addEventListener('change', () => { l.target = who.value; onChange(lines); });
      const extra = l.kind === 'time' ? choice(TIME_STEPS.map((x) => ({ value: x, label: '+' + x + ' s' })), l.seconds || 5, (x) => { l.seconds = x; onChange(lines); })
        : l.kind === 'other' ? (() => { const o = h('input', { class: 'input', value: l.other || '', maxlength: 120, placeholder: t('otherPh') }); o.addEventListener('input', () => { l.other = o.value; onChange(lines); }); return o; })() : null;
      return h('div', { class: 'pen-line' }, h('div', { class: 'row-between' }, h('b', null, t('penaltyN', { n: i + 1 })), h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('delete'), onclick: () => { lines.splice(i, 1); draw(); onChange(lines); } }, icon('close'))),
        who, choice(KINDS.map((k) => ({ value: k, label: t('outcome_' + k) })), l.kind, (k) => { l.kind = k; if (k === 'time' && !l.seconds) l.seconds = 5; draw(); onChange(lines); }), extra);
    }), lines.length ? null : h('p', { class: 'note', style: 'margin:0' }, t('noPenaltyYet')),
    h('button', { class: 'btn small', type: 'button', onclick: () => { lines.push({ target: cands[0] || null, kind: 'time', seconds: 5, other: '' }); draw(); onChange(lines); } }, icon('plus'), t('addPenalty')));
  };
  draw();
  return box;
}

/* ---------- cards ---------- */
function decisionCard(ctx, p, opts = {}) {
  const pub = p.status === 'published';
  const showVideo = p.video && (isJudge() || (pub && p.L === 'A'));
  return h('article', { class: 'panel pad', style: 'display:grid;gap:8px' },
    h('div', { class: 'row-between', style: 'flex-wrap:wrap' }, h('div', { style: 'display:flex;gap:8px;align-items:center' }, h('span', { class: 'lobby ' + p.L }, p.L), h('b', null, p.title)),
      h('span', { class: 'status' + (pub ? '' : ' live') }, t('pst_' + p.status))),
    h('div', { class: 'faint', style: 'font-size:13px' }, t('caseMeta', { n: p.n, s: sesName(p.S), lap: p.lap || '–', corner: p.corner || '–' }), opts.season ? ` · MCSM${ctx.season.no}` : ''),
    h('div', { style: 'font-size:14px' }, t('caseParties', { by: p.type === 'judge' ? t('judgesCase') : nameOf(ctx, complainantOf(p)), vs: (p.involved || []).map((u) => nameOf(ctx, u)).join(', ') || '–' }),
      p.type !== 'judge' && p.complainant && p.complainant !== p.by ? h('span', { class: 'faint' }, ' · ' + t('filedBy', { name: nameOf(ctx, p.by) })) : null),
    pub && p.decision ? h('div', { class: 'callout', style: 'display:block' }, h('b', { style: 'display:block;margin-bottom:4px' }, outcomeText(p.decision, ctx)), h('span', { style: 'white-space:pre-line' }, p.decision.text)) : null,
    p.status === 'notInvestigated' && p.decision ? h('div', { class: 'callout warn', style: 'display:block' }, h('b', null, t('pst_notInvestigated')), h('div', null, p.decision.text || '')) : null,
    pub && p.voteSummary && p.voteSummary.length ? h('div', { class: 'vote-sum' }, h('div', { class: 'label' }, t('votes')), p.voteSummary.map((v) => h('div', null, h('b', null, v.name), ': ', outcomeText(v, ctx), v.loggedBy ? h('small', { class: 'faint' }, ' · ' + t('loggedByAdmin', { name: v.loggedByName || '' })) : null))) : null,
    showVideo ? h('a', { href: p.video, target: '_blank', rel: 'noopener', style: 'color:var(--accent-text);font-weight:650;font-size:14px' }, icon('link'), ' ', t('watchVideo')) : null,
    opts.link ? h('a', { class: 'btn small', href: `#/birosag/${ctx.season.id}/${p.id}`, style: 'justify-self:start' }, t('openCase')) : null,
    opts.withdraw && p.status === 'filed' && session.user && (p.by === session.user.uid || complainantOf(p) === session.user.uid) ? withdrawBtn(ctx, p, opts.reload) : null);
}
function withdrawBtn(ctx, p, reload) {
  const b = h('button', { class: 'btn small danger', type: 'button', style: 'justify-self:start' }, t('withdrawProtest'));
  b.addEventListener('click', () => busy(b, async () => { try { await backend.protests.save(ctx.season.id, p.id, { status: 'withdrawn' }); toast(t('protestWithdrawn')); reload && reload(); } catch (e) { toast(t(errorKey(e)), 'alert'); } }));
  return b;
}

/* ---------- round page section ---------- */
export function roundProtests(ctx, n, reload) {
  const box = h('section', null, secHead(t('protests')));
  const round = ctx.season.rounds.find((r) => r.n === n);
  const doc = ctx.roundDoc(n) || {};
  const ws = windowState(round, doc);
  const w = protestWindow(round, doc);
  const mineEntry = signedIn() && ctx.entries.find((e) => e.uid === session.user.uid && e.status !== 'withdrawn' && e.approved !== false);
  void mineEntry;
  if (!mayView(ctx)) { box.append(h('p', { class: 'note' }, t('protestsEntrantsOnly'))); return box; }
  const actions = h('div');
  const note = h('p', { class: 'note', style: 'margin:0 0 12px' }, ws === 'open' ? t('protestOpenUntil', { date: fmtDate(w.closesAt, true), rel: relTime(w.closesAt) }) : ws === 'soon' ? t('protestOpensAt', { date: fmtDate(w.opensAt, true) }) : t('protestClosed'));
  const list = h('div', { class: 'stack', style: 'gap:10px' }, skelRows(2, 90));
  box.append(note, actions, list);
  backend.protests.list(ctx.season.id, listOpts()).then((ps) => {
    const mine = ps.filter((p) => p.n === n && p.status !== 'withdrawn' && (p.status === 'published' || p.status === 'notInvestigated' || isJudge() || (session.user && (p.by === session.user.uid || complainantOf(p) === session.user.uid || (p.involved || []).includes(session.user.uid)))))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    list.replaceChildren(...(mine.length ? mine.map((p) => decisionCard(ctx, p, { link: isJudge(), withdraw: true, reload })) : [empty(t('noProtests'))]));
  }).catch(() => list.replaceChildren(empty(t('loadFailed'))));
  return box;
}

/* ---------- season tab ---------- */
export function protestsTab(st) {
  const box = h('div', { class: 'stack', style: 'gap:10px;margin-top:6px' }, skelRows(3, 90));
  loadRace(st.season.id).then((ctx) => { if (!mayView(ctx)) { box.replaceChildren(h('p', { class: 'note' }, t('protestsEntrantsOnly'))); return null; } return backend.protests.list(st.season.id, listOpts()).then((ps) => [ctx, ps]); }).then((r) => { if (!r) return; const [ctx, ps] = r;
    const pub = ps.filter((p) => p.status === 'published' || p.status === 'notInvestigated').sort((a, b) => b.n - a.n || (b.publishedAt || 0) - (a.publishedAt || 0));
    const mine = session.user ? ps.filter((p) => p.by === session.user.uid && !['published', 'notInvestigated'].includes(p.status)) : [];
    box.replaceChildren(
      isJudge() ? h('a', { class: 'btn', href: '#/birosag', style: 'justify-self:start' }, icon('shield'), t('judgesArea')) : null,
      mine.length ? frag(h('div', { class: 'label' }, t('myProtests')), mine.map((p) => decisionCard(ctx, p, { withdraw: true, reload: () => go('/szezonok/' + st.season.id + '/ovasok') }))) : null,
      h('div', { class: 'label', style: 'margin-top:6px' }, t('decisions')),
      ...(pub.length ? pub.map((p) => decisionCard(ctx, p)) : [empty(t('noDecisions'))]));
  }).catch(() => box.replaceChildren(empty(t('loadFailed'))));
  return box;
}

/* ---------- filing form ---------- */
export function screenProtestForm({ id, n }, query) {
  n = Number(n);
  const NONE = '__stewards';  // stewards' own investigation (admins)
  const root = h('div', { class: 'narrow' }, skelRows(5, 70));
  loadRace(id).then((ctx) => {
    if (!ctx) { root.replaceChildren(empty(t('notFound'))); return; }
    const round = ctx.season.rounds.find((r) => r.n === n), doc = ctx.roundDoc(n) || {};
    const myL = session.user ? lobbyOf(doc.lobbies, session.user.uid) : null;
    const roundDrivers = [...new Set(Object.values(doc.lobbies || {}).flat())];
    const me = session.user ? session.user.uid : null;
    const d = { n, L: myL || 'A', S: 'GP', lap: '', corner: '', involved: [], title: '', description: '', video: '', complainant: me && roundDrivers.includes(me) ? me : (query.get('biroi') === '1' && isAdminRole() ? NONE : roundDrivers[0] || null) };
    const judgeMode = () => d.complainant === NONE;
    if (!isAdminRole() && !entrantOf(ctx)) { root.replaceChildren(empty(t('protestOnlyAffected'))); return; }
    if (!isAdminRole() && windowState(round, doc) !== 'open') { root.replaceChildren(empty(t('protestClosed'))); return; }
    const err = h('div');
    const invBox = h('div');
    const label = (u) => { const sp = ctx.snaps[u] || {}; return `#${sp.raceNumber ?? ''} ${(sp.lastName || '').toLocaleUpperCase('hu')} ${sp.firstName || ''}${sp.psn ? ' · ' + sp.psn : ''}`.replace(/\s+/g, ' ').trim(); };
    const sorted = roundDrivers.slice().sort((a, b) => (a === me ? -1 : b === me ? 1 : nameOf(ctx, a).localeCompare(nameOf(ctx, b), 'hu')));
    const compSel = h('select', { class: 'select', style: 'width:100%' }, isAdminRole() ? h('option', { value: NONE, selected: d.complainant === NONE }, t('stewardsCase')) : null,
      ...sorted.map((u) => h('option', { value: u, selected: u === d.complainant }, label(u) + (u === me ? ' (' + t('you') + ')' : ''))));
    const compHint = h('span', { class: 'hint' });
    const syncComp = () => { compHint.textContent = judgeMode() ? t('stewardsCaseHint') : d.complainant === me ? t('complainantSelfHint') : t('complainantOtherHint'); if (typeof submit !== 'undefined') submit.lastChild.textContent = judgeMode() ? t('openJudgeCase') : t('fileProtest'); };
    compSel.addEventListener('change', () => { d.complainant = compSel.value; drawInv(); syncComp(); });
    const complainantRow = h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('complainant')), compSel, compHint);
    const drawInv = () => {
      const roster = ((doc.lobbies || {})[d.L] || []).filter((u) => u !== d.complainant);
      d.involved = d.involved.filter((u) => roster.includes(u));
      invBox.replaceChildren(h('div', { class: 'choice multi' }, roster.map((u) => {
        const sp = ctx.snaps[u] || {};
        const b = h('button', { class: 'chip chip-driver', type: 'button', 'aria-pressed': String(d.involved.includes(u)) }, h('span', null, '#' + (sp.raceNumber ?? '') + ' ' + (sp.lastName || '').toLocaleUpperCase('hu')), sp.psn ? h('small', null, sp.psn) : null);
        b.addEventListener('click', () => { const on = !d.involved.includes(u); d.involved = on ? [...d.involved, u] : d.involved.filter((x) => x !== u); b.setAttribute('aria-pressed', String(on)); });
        return b;
      })));
    };
    drawInv();
    const lobbies = ['A', 'B', 'C'].filter((L) => ((doc.lobbies || {})[L] || []).length);
    if (!lobbies.includes(d.L) && lobbies.length) d.L = lobbies[0];
    const inp = (key, props) => { const el = h(props.area ? 'textarea' : 'input', { class: 'input', ...props, area: null }); el.addEventListener('input', () => { d[key] = el.value; }); return el; };
    const title = field(t('protestTitle'), inp('title', { maxlength: 80, placeholder: t('protestTitlePh') }));
    const lap = field(t('lap'), inp('lap', { inputmode: 'numeric', maxlength: 3 }));
    const corner = field(t('cornerOrTime'), inp('corner', { maxlength: 24, placeholder: t('cornerTimePh') }));
    const desc = field(t('description'), inp('description', { area: true, maxlength: 1500, placeholder: t('protestDescPh') }));
    const video = field(t('videoLink'), inp('video', { type: 'url', inputmode: 'url', placeholder: 'https://youtu.be/…' }), { hint: t('videoHint') });
    const submit = h('button', { class: 'btn primary block', type: 'button', 'data-haptic': '' }, icon('flag'), h('span', null, judgeMode() ? t('openJudgeCase') : t('fileProtest')));
    syncComp();
    submit.addEventListener('click', () => busy(submit, async () => {
      err.replaceChildren();
      const probs = [];
      if (!d.title.trim()) { title.setError(t('errRequired')); probs.push(1); }
      if (!d.description.trim() || d.description.trim().length < 20) { desc.setError(t('errDescShort')); probs.push(1); }
      if (!d.involved.length) probs.push(err.append(formError(t('errInvolved'))));
      if (!d.complainant) probs.push(err.append(formError(t('errComplainant'))));
      if (d.video && !/^https:\/\/\S+$/.test(d.video.trim())) { video.setError(t('errUrl')); probs.push(1); }
      if (d.lap && !/^\d{1,3}$/.test(d.lap)) { lap.setError(t('errNumber')); probs.push(1); }
      if (probs.length) { haptic(25); return; }
      try {
        const pid = await backend.protests.save(id, null, { n, L: d.L, S: d.S, lap: d.lap ? Number(d.lap) : null, corner: d.corner.trim(), involved: d.involved, title: d.title.trim(), description: d.description.trim(), video: d.video.trim(), by: session.user.uid, complainant: judgeMode() ? null : d.complainant, type: judgeMode() ? 'judge' : 'driver', status: judgeMode() ? 'review' : 'filed', panel: [] });
        const params = { s: 'MCSM' + ctx.season.no, n, title: d.title.trim() };
        // the drivers named, and the complainant if someone else filed it for them
        notifyUsers([...d.involved, ...(!judgeMode() && d.complainant !== session.user.uid ? [d.complainant] : [])], 'protestAgainst', params, `#/szezonok/${id}/fordulo/${n}`);
        if (!judgeMode()) judgeUids().then((js) => notifyUsers(js, 'protestNew', params, `#/birosag/${id}/${pid}`)).catch(() => {});
        toast(judgeMode() ? t('judgeCaseOpened') : t('protestFiled')); haptic(15);
        go(judgeMode() ? `/birosag/${id}/${pid}` : `/szezonok/${id}/fordulo/${n}`);
      } catch (e) { err.replaceChildren(formError(t(errorKey(e)))); }
    }));
    root.replaceChildren(h('h1', { class: 'display page-title' }, t('protestTitleH')),
      h('p', { class: 'page-sub' }, `MCSM${ctx.season.no}, ${t('roundN', { n })}: ${roundTitle(round)}`),
      h('div', { class: 'callout', style: 'margin-bottom:16px' }, icon('info'), h('span', null, t('protestRules'))),
      h('div', { class: 'form' },
        complainantRow,
        h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('lobby')), seg(lobbies.map((L) => ({ value: L, label: t('lobbyX', { l: L }) })), d.L, (v) => { d.L = v; drawInv(); })),
        h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('session')), seg(SESSIONS.map((S) => ({ value: S, label: sesName(S) })), d.S, (v) => { d.S = v; })),
        h('div', { class: 'inline' }, lap.row, corner.row),
        h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('involvedDrivers')), invBox),
        title.row, desc.row, video.row, err, submit));
  }).catch(() => root.replaceChildren(empty(t('loadFailed'))));
  return frag(backLink(t('roundN', { n }), `#/szezonok/${id}/fordulo/${n}`), root);
}

/* ---------- judges' area ---------- */
const jui = { filter: 'open' };
export function screenJudges() {
  const box = h('div', { class: 'stack', style: 'gap:10px' }, skelRows(4, 90));
  const filterSeg = seg([['open', t('casesOpen')], ['done', t('casesDone')], ['all', t('all')]].map(([value, label]) => ({ value, label })), jui.filter, (v) => { jui.filter = v; draw(); });
  let rows = [];
  const draw = () => {
    const f = jui.filter;
    const show = rows.filter(({ p }) => f === 'all' || (f === 'open' ? ['filed', 'review', 'decided'].includes(p.status) : ['published', 'notInvestigated', 'withdrawn'].includes(p.status)));
    box.replaceChildren(...(show.length ? show.map(({ p, ctx }) => {
      const mineToVote = p.status === 'review' && (p.panel || []).includes(session.user.uid);
      return h('a', { class: 'round-item', href: `#/birosag/${ctx.season.id}/${p.id}` }, h('span', { class: 'lobby ' + p.L }, p.L),
        h('span', { class: 't' }, h('b', null, p.title), h('span', { class: 'sub' }, `MCSM${ctx.season.no}, ${t('roundN', { n: p.n })}, ${sesName(p.S)}`, h('span', { class: 'status' + (mineToVote ? ' live' : '') }, mineToVote ? t('yourVote') : t('pst_' + p.status)))),
        icon('chevR', 'chev'));
    }) : [empty(t('noCases'))]));
  };
  loadSeasons().then(async (all) => {
    const live = all.filter((s) => LIVE_STATES.includes(s.state) || s.state === 'finished');
    for (const s of live) {
      const [ctx, ps] = await Promise.all([loadRace(s.id), backend.protests.list(s.id, listOpts())]);
      ps.forEach((p) => rows.push({ p, ctx }));
    }
    rows.sort((a, b) => (b.p.createdAt || 0) - (a.p.createdAt || 0));
    draw();
  }).catch(() => box.replaceChildren(empty(t('loadFailed'))));
  const back = h('button', { class: 'back', type: 'button', onclick: () => (history.length > 1 ? history.back() : go('/')) }, icon('chevL'), t('back'));
  return frag(back, pageTitle(t('judgesArea'), t('judgesSub')), h('div', { style: 'margin-bottom:14px' }, filterSeg), box);
}

export function screenCase({ sid, pid }) {
  const root = h('div', null, skelRows(5, 80));
  const load = async () => {
    const [ctx, ps, us] = await Promise.all([loadRace(sid), backend.protests.list(sid, listOpts()), loadUsers()]);
    const p = ps.find((x) => x.id === pid);
    if (!ctx || !p) { root.replaceChildren(empty(t('notFound'))); return; }
    const [votes, notes] = await Promise.all([backend.votes.list(sid, pid), backend.notes.list(sid, pid)]);
    root.replaceChildren(caseView(ctx, p, votes, notes, us, load));
  };
  load().catch((e) => root.replaceChildren(empty(t(errorKey(e)))));
  return frag(backLink(t('judgesArea'), '#/birosag'), root);
}

function caseView(ctx, p, votes, notes, us, reload) {
  const s = ctx.season;
  const teamOf = (uid) => (ctx.snaps[uid] || {}).teamId || null;
  const judges = us.filter(isJudgeProfile);
  const elig = eligibility(p, judges, teamOf);
  const panel = p.panel && p.panel.length ? p.panel : [];
  const tl = tally(votes, panel);
  const me = session.user.uid;
  const mine = votes.find((v) => v.uid === me);
  const canVote = panel.includes(me) && ['review'].includes(p.status);
  const userName = (uid) => { const u = us.find((x) => x.uid === uid); return u ? fullName(u) : uid; };
  const sections = [];
  sections.push(h('h1', { class: 'display page-title' }, p.title), decisionCard(ctx, p),
    h('div', { class: 'panel pad', style: 'margin-top:10px;white-space:pre-line' }, h('div', { class: 'label', style: 'margin-bottom:6px' }, t('description')), p.description));
  // panel
  sections.push(secHead(t('panel')), h('div', { class: 'stack', style: 'gap:6px' },
    (panel.length ? panel : []).map((uid) => h('div', { class: 'row-card' }, h('span', { class: 'nm' }, h('b', null, userName(uid)), h('span', null, votes.some((v) => v.uid === uid) ? t('voted') : t('notVotedYet'))), votes.some((v) => v.uid === uid) ? icon('check') : icon('clock'))),
    !panel.length ? empty(t('noPanelYet')) : null));
  const notOn = elig.filter((e) => e.eligible && !panel.includes(e.uid));
  const excludedJ = elig.filter((e) => !e.eligible);
  if (notOn.length || excludedJ.length) sections.push(h('details', { class: 'lobby-sec', style: 'margin-top:10px' }, h('summary', null, t('panelOthers', { a: notOn.length, b: excludedJ.length }), icon('down', 'chev')),
    h('div', { class: 'stack', style: 'gap:6px;padding:6px 0 4px' },
      notOn.map((e) => h('div', { class: 'row-card' }, h('span', { class: 'nm' }, h('b', null, userName(e.uid)), h('span', null, t('eligibleNotOnPanel'))),
        isChair() && ['filed', 'review'].includes(p.status) ? h('button', { class: 'btn small', type: 'button', onclick: (ev) => busy(ev.currentTarget, async () => { try { await backend.protests.save(s.id, p.id, { panel: [...panel, e.uid], status: 'review' }); reload(); } catch (x) { toast(t(errorKey(x)), 'alert'); } }) }, icon('plus'), t('addToPanel')) : null)),
      excludedJ.map((e) => h('div', { class: 'row-card', style: 'opacity:.7' }, h('span', { class: 'nm' }, h('b', null, userName(e.uid)), h('span', null, t(e.reason))))),
      h('p', { class: 'note', style: 'margin:4px 0 0' }, t('panelWhyHint')))));
  // tally
  sections.push(h('div', { class: 'callout' + (tl.enough ? '' : ' warn'), style: 'margin-top:12px' }, icon(tl.enough ? 'check' : 'info'),
    h('span', null, t('voteCount', { n: tl.valid, min: MIN_VOTES }), tl.leading ? ' ' + t('leadingOption', { o: outcomeText(tl.leading, ctx) }) : '', tl.tie ? ' ' + t('tieNote') : '')));
  // my vote
  if (canVote) sections.push(secHead(t('yourVoteTitle')), voteForm(ctx, p, mine, reload));
  // votes detail (judges only)
  if (votes.length) sections.push(secHead(t('votes')), h('div', { class: 'stack', style: 'gap:6px' }, votes.map((v) => h('div', { class: 'audit-row' }, h('b', null, userName(v.uid)), ': ', outcomeText(v, ctx), v.reason ? h('div', { class: 'faint', style: 'font-size:13px' }, v.reason) : null))));
  // notes
  const noteIn = h('textarea', { class: 'input', maxlength: 1000, placeholder: t('notePh2') });
  const noteBtn = h('button', { class: 'btn small', type: 'button' }, t('addNote'));
  noteBtn.addEventListener('click', () => busy(noteBtn, async () => { if (!noteIn.value.trim()) return; try { await backend.notes.add(s.id, p.id, noteIn.value.trim()); reload(); } catch (e) { toast(t(errorKey(e)), 'alert'); } }));
  sections.push(secHead(t('discussion')), h('div', { class: 'stack', style: 'gap:6px' }, notes.map((nn) => h('div', { class: 'audit-row' }, h('time', null, fmtDate(nn.at, true)), h('b', null, userName(nn.by)), h('div', { style: 'white-space:pre-line' }, nn.text))), notes.length ? null : h('p', { class: 'note', style: 'margin:0' }, t('noNotes'))),
    h('div', { class: 'stack', style: 'gap:8px;margin-top:10px' }, noteIn, noteBtn));
  if (isAdminRole() && ['filed', 'review'].includes(p.status)) {
    const eligible = elig.filter((e) => e.eligible).map((e) => e.uid);
    let who = eligible[0] || null;
    const holder = h('div');
    const drawFor = () => { const existing = votes.find((v) => v.uid === who); holder.replaceChildren(who ? voteForm(ctx, p, existing, reload, { forUid: who, panel }) : empty(t('noEligibleJudges'))); };
    const pick = h('select', { class: 'select', style: 'width:100%' }, eligible.map((uid) => h('option', { value: uid }, userName(uid) + (votes.some((v) => v.uid === uid) ? ' ✓' : ''))));
    pick.addEventListener('change', () => { who = pick.value; drawFor(); });
    drawFor();
    sections.push(h('section', { class: 'panel pad stack', style: 'gap:12px;margin-top:16px' }, h('h2', { class: 'display', style: 'font-size:22px;margin:0' }, t('logOnBehalf')), h('p', { class: 'note', style: 'margin:0' }, t('logOnBehalfHint')),
      h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('judge')), pick), holder));
  }
  if (isChair()) sections.push(chairTools(ctx, p, tl, judges, teamOf, reload));
  return frag(...sections);
}

function voteForm(ctx, p, mine, reload, opts = {}) {
  const lines = penaltyLines(mine).map((l) => ({ ...l }));
  const v = { reason: mine ? mine.reason || '' : '' };
  const reason = h('textarea', { class: 'input', maxlength: 600, placeholder: t('reasonVotePh') }); reason.value = v.reason;
  reason.addEventListener('input', () => { v.reason = reason.value; });
  const save = h('button', { class: 'btn primary block', type: 'button', 'data-haptic': '' }, icon('check'), mine ? t('updateVote') : t('castVote'));
  save.addEventListener('click', () => busy(save, async () => {
    if (lines.some((l) => !l.target)) { toast(t('pickPenalised'), 'alert'); return; }
    try {
      const clean = lines.map((l) => ({ target: l.target, kind: l.kind, seconds: l.kind === 'time' ? l.seconds || 5 : null, other: l.kind === 'other' ? (l.other || '').trim() : null }));
      const data = { penalties: clean, outcome: clean.length ? 'penalties' : 'none', reason: v.reason };
      if (opts.forUid) {
        // on a judge's behalf: recorded as theirs, with who logged it; they join the panel
        await backend.votes.saveFor(ctx.season.id, p.id, opts.forUid, { ...data, loggedBy: session.user.uid });
        if (!(opts.panel || []).includes(opts.forUid)) await backend.protests.save(ctx.season.id, p.id, { panel: [...(opts.panel || []), opts.forUid], status: 'review' });
      } else await backend.votes.save(ctx.season.id, p.id, data);
      toast(t('voteSaved')); haptic(12); reload();
    } catch (e) { toast(t(errorKey(e)), 'alert'); }
  }));
  return h('div', { class: 'panel pad stack', style: 'gap:12px' },
    h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('penaltiesLabel')), penaltyEditor(ctx, p, lines, () => {})),
    field(t('reasonShort'), reason).row, save);
}

function chairTools(ctx, p, tl, judges, teamOf, reload) {
  const s = ctx.season;
  const box = h('section', { class: 'panel pad', style: 'margin-top:20px;display:grid;gap:12px' }, h('div', { class: 'row-between' }, h('h2', { class: 'display', style: 'font-size:24px' }, t('chairTools')), h('span', { class: 'status' }, icon('shield'), t('role_judgeChair'))));
  const audit = (action, extra = {}) => backend.audit.add({ action, target: s.id, targetName: `MCSM${s.no}: ${p.title}`, before: null, after: null, reason: null, ...extra });
  if (['filed', 'review'].includes(p.status)) {
    const sugg = defaultPanel(p, judges, teamOf);
    const assign = h('button', { class: 'btn small', type: 'button' }, icon('users'), p.panel && p.panel.length ? t('resetPanel') : t('assignPanel', { n: sugg.length }));
    assign.addEventListener('click', () => busy(assign, async () => { try { await backend.protests.save(s.id, p.id, { panel: sugg, status: 'review' }); await audit('protest.panel'); toast(t('saved')); reload(); } catch (e) { toast(t(errorKey(e)), 'alert'); } }));
    const reject = h('button', { class: 'btn small danger', type: 'button' }, t('markNotInvestigated'));
    reject.addEventListener('click', () => {
      const txt = h('textarea', { class: 'input', maxlength: 400, placeholder: t('notInvestigatedPh') });
      const ok = h('button', { class: 'btn danger block', type: 'button' }, t('markNotInvestigated'));
      const sh = openSheet({ title: t('pst_notInvestigated'), body: h('div', { class: 'stack', style: 'gap:12px' }, txt, ok) });
      ok.addEventListener('click', () => busy(ok, async () => { try { await backend.protests.save(s.id, p.id, { status: 'notInvestigated', decision: { outcome: 'none', text: txt.value.trim() }, publishedAt: Date.now() }); await audit('protest.reject'); sh.close(true); toast(t('saved')); reload(); } catch (e) { toast(t(errorKey(e)), 'alert'); } }));
    });
    box.append(h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap' }, assign, reject));
  }
  if (p.status === 'review' || p.status === 'decided') {
    const lines = penaltyLines(p.decision || tl.leading).map((l) => ({ ...l }));
    const d = { text: (p.decision && p.decision.text) || '' };
    const flagsBox = h('div', { class: 'stack', style: 'gap:6px' });
    const drawFlags = () => flagsBox.replaceChildren(...lines.filter((l) => l.kind === 'time' && l.target).map((l) => {
      const f = dsqFlags(ctx.penalties, l.target, p.n, { kind: 'time', seconds: l.seconds });
      return f.autoDsq ? h('div', { class: 'callout warn' }, icon('alert'), h('span', null, nameOf(ctx, l.target) + ': ' + t('flagAutoDsq', { n: f.count })))
        : f.dsqPossible ? h('div', { class: 'callout warn' }, icon('alert'), h('span', null, nameOf(ctx, l.target) + ': ' + t('flagDsqPossible', { s: f.seconds }))) : null;
    }));
    const txt = h('textarea', { class: 'input', maxlength: 1500, placeholder: t('decisionTextPh') }); txt.value = d.text; txt.addEventListener('input', () => { d.text = txt.value; });
    const publish = h('button', { class: 'btn primary block', type: 'button', 'data-haptic': '', disabled: !tl.enough }, icon('flag'), t('publishDecision'));
    publish.addEventListener('click', async () => {
      if (!d.text.trim()) { toast(t('decisionNeedsText'), 'alert'); return; }
      if (lines.some((l) => !l.target)) { toast(t('pickPenalised'), 'alert'); return; }
      if (!(await confirmPublish({ text: t('confirmDecision'), draftHint: false }))) return;
      busy(publish, async () => {
        const clean = lines.map((l) => ({ target: l.target, kind: l.kind, seconds: l.kind === 'time' ? l.seconds || 5 : null, other: l.kind === 'other' ? (l.other || '').trim() : null }));
        const decision = { outcome: clean.length ? 'penalties' : 'none', penalties: clean, text: d.text.trim() };
        try {
          const lobbies = (ctx.roundDoc(p.n) || {}).lobbies;
          for (const l of clean) await backend.penalties.save(s.id, { protestId: p.id, n: p.n, L: lobbyOf(lobbies, l.target) || p.L, S: p.S, uid: l.target, kind: l.kind, seconds: l.seconds, note: l.other });
          const people = await loadUsers().catch(() => []);
          const nm = (uid) => { const u = people.find((x) => x.uid === uid); return u ? fullName(u) : uid; };
          const voteSummary = (await backend.votes.list(s.id, p.id).catch(() => [])).filter((v) => (p.panel || []).includes(v.uid))
            .map((v) => ({ uid: v.uid, name: nm(v.uid), outcome: penaltyLines(v).length ? 'penalties' : 'none', penalties: penaltyLines(v), loggedBy: v.loggedBy || null, loggedByName: v.loggedBy ? nm(v.loggedBy) : null }));
          await backend.protests.save(s.id, p.id, { status: 'published', decision, voteSummary, decidedAt: Date.now(), publishedAt: Date.now() });
          await audit('protest.publish', { after: decision });
          const told = [...new Set([complainantOf(p), p.type === 'judge' ? null : p.by, ...(p.involved || []), ...clean.map((l) => l.target)].filter(Boolean))];
          notifyUsers(told, 'decision', { s: 'MCSM' + s.no, n: p.n, title: p.title }, `#/szezonok/${s.id}/fordulo/${p.n}`);
          invalidate('race:' + s.id); toast(t('decisionPublished')); haptic(15); reload();
        } catch (e) { toast(t(errorKey(e)), 'alert'); }
      });
    });
    drawFlags();
    box.append(h('div', { class: 'label' }, t('finalDecision')),
      penaltyEditor(ctx, p, lines, () => drawFlags()), flagsBox,
      field(t('decisionText'), txt, { hint: t('decisionTextHint') }).row, publish, tl.enough ? null : h('p', { class: 'note', style: 'margin:0' }, t('needVotes', { min: MIN_VOTES })));
  }
  if (p.status === 'published') {
    const undo = h('button', { class: 'btn small danger', type: 'button' }, icon('undo'), t('withdrawDecision'));
    undo.addEventListener('click', () => busy(undo, async () => {
      try { for (const pen of ctx.penalties.filter((x) => x.protestId === p.id)) await backend.penalties.remove(s.id, pen.id); await backend.protests.save(s.id, p.id, { status: 'review' }); await audit('protest.unpublish'); toast(t('saved')); reload(); }
      catch (e) { toast(t(errorKey(e)), 'alert'); }
    }));
    box.append(h('p', { class: 'muted', style: 'margin:0' }, t('publishedNote')), undo);
  }
  return box;
}
