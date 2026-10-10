// screens/protests.js
// Protests from both sides: drivers file and follow their cases, everyone reads published
// decisions, and the Versenybíróság works its cases (panel, votes, notes, decision,
// publishing the penalty, which then reorders the results by itself).
import { h, frag } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { haptic, reduced } from '../core/motion.js';
import { seg, busy, field, choice } from '../ui/controls.js';
import { avatar, empty, backLink, formError, secHead, skelRows, pageTitle } from '../ui/parts.js';
import { openSheet, toast } from '../ui/sheet.js';
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

export const isJudge = () => { const r = roles(); return !!(r.judge || r.judgeChair || r.admin || r.owner); };
export const isChair = () => { const r = roles(); return !!(r.judgeChair || r.admin || r.owner); };
const sesName = (S) => ({ Q: t('quali'), S: 'Sprint', GP: "Gran'Prix" }[S] || S);
const listOpts = () => ({ judge: isJudge(), uid: session.user ? session.user.uid : null });
const nameOf = (ctx, uid) => fullName(ctx.snaps[uid] || {}) || uid;

export function outcomeText(d, ctx) {
  if (!d) return '';
  const who = d.target ? nameOf(ctx, d.target) : '';
  if (d.outcome === 'none') return t('outcome_none');
  if (d.outcome === 'time') return t('outcomeTime', { s: d.seconds, who });
  if (d.outcome === 'other') return `${who}: ${d.other || t('outcome_other')}`;
  return `${who}: ${t('outcome_' + d.outcome)}`;
}

/* ---------- cards ---------- */
function decisionCard(ctx, p, opts = {}) {
  const pub = p.status === 'published';
  const showVideo = p.video && (isJudge() || (pub && p.L === 'A'));
  return h('article', { class: 'panel pad', style: 'display:grid;gap:8px' },
    h('div', { class: 'row-between', style: 'flex-wrap:wrap' }, h('div', { style: 'display:flex;gap:8px;align-items:center' }, h('span', { class: 'lobby ' + p.L }, p.L), h('b', null, p.title)),
      h('span', { class: 'status' + (pub ? '' : ' live') }, t('pst_' + p.status))),
    h('div', { class: 'faint', style: 'font-size:13px' }, t('caseMeta', { n: p.n, s: sesName(p.S), lap: p.lap || '–', corner: p.corner || '–' }), opts.season ? ` · MCSM${ctx.season.no}` : ''),
    h('div', { style: 'font-size:14px' }, t('caseParties', { by: p.type === 'judge' ? t('judgesCase') : nameOf(ctx, p.by), vs: (p.involved || []).map((u) => nameOf(ctx, u)).join(', ') || '–' })),
    pub && p.decision ? h('div', { class: 'callout', style: 'display:block' }, h('b', { style: 'display:block;margin-bottom:4px' }, outcomeText(p.decision, ctx)), h('span', { style: 'white-space:pre-line' }, p.decision.text)) : null,
    p.status === 'notInvestigated' && p.decision ? h('div', { class: 'callout warn', style: 'display:block' }, h('b', null, t('pst_notInvestigated')), h('div', null, p.decision.text || '')) : null,
    showVideo ? h('a', { href: p.video, target: '_blank', rel: 'noopener', style: 'color:var(--accent-text);font-weight:650;font-size:14px' }, icon('link'), ' ', t('watchVideo')) : null,
    opts.link ? h('a', { class: 'btn small', href: `#/birosag/${ctx.season.id}/${p.id}`, style: 'justify-self:start' }, t('openCase')) : null,
    opts.withdraw && p.status === 'filed' && session.user && p.by === session.user.uid ? withdrawBtn(ctx, p, opts.reload) : null);
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
  const actions = h('div', { style: 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px' },
    ws === 'open' && mineEntry ? h('a', { class: 'btn primary', href: `#/szezonok/${ctx.season.id}/fordulo/${n}/ovas`, 'data-haptic': '' }, icon('flag'), t('fileProtest')) : null,
    isJudge() ? h('a', { class: 'btn', href: `#/szezonok/${ctx.season.id}/fordulo/${n}/ovas?biroi=1` }, icon('shield'), t('judgeCase')) : null);
  const note = h('p', { class: 'note', style: 'margin:0 0 12px' }, ws === 'open' ? t('protestOpenUntil', { date: fmtDate(w.closesAt, true), rel: relTime(w.closesAt) }) : ws === 'soon' ? t('protestOpensAt', { date: fmtDate(w.opensAt, true) }) : t('protestClosed'));
  const list = h('div', { class: 'stack', style: 'gap:10px' }, skelRows(2, 90));
  box.append(note, actions, list);
  backend.protests.list(ctx.season.id, listOpts()).then((ps) => {
    const mine = ps.filter((p) => p.n === n && p.status !== 'withdrawn' && (p.status === 'published' || isJudge() || (session.user && (p.by === session.user.uid || (p.involved || []).includes(session.user.uid)))))
      .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    list.replaceChildren(...(mine.length ? mine.map((p) => decisionCard(ctx, p, { link: isJudge(), withdraw: true, reload })) : [empty(t('noProtests'))]));
  }).catch(() => list.replaceChildren(empty(t('loadFailed'))));
  return box;
}

/* ---------- season tab ---------- */
export function protestsTab(st) {
  const box = h('div', { class: 'stack', style: 'gap:10px;margin-top:6px' }, skelRows(3, 90));
  Promise.all([loadRace(st.season.id), backend.protests.list(st.season.id, listOpts())]).then(([ctx, ps]) => {
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
  const judgeMode = query.get('biroi') === '1' && isJudge();
  const root = h('div', { class: 'narrow' }, skelRows(5, 70));
  loadRace(id).then((ctx) => {
    if (!ctx) { root.replaceChildren(empty(t('notFound'))); return; }
    const round = ctx.season.rounds.find((r) => r.n === n), doc = ctx.roundDoc(n) || {};
    const myL = session.user ? lobbyOf(doc.lobbies, session.user.uid) : null;
    const d = { n, L: myL || 'A', S: 'GP', lap: '', corner: '', involved: [], title: '', description: '', video: '' };
    if (!judgeMode && windowState(round, doc) !== 'open') { root.replaceChildren(empty(t('protestClosed'))); return; }
    const err = h('div');
    const invBox = h('div');
    const drawInv = () => {
      const roster = ((doc.lobbies || {})[d.L] || []).filter((u) => !session.user || u !== session.user.uid || judgeMode);
      d.involved = d.involved.filter((u) => roster.includes(u));
      invBox.replaceChildren(h('div', { class: 'choice multi' }, roster.map((u) => {
        const b = h('button', { class: 'chip', type: 'button', 'aria-pressed': String(d.involved.includes(u)) }, '#' + ((ctx.snaps[u] || {}).raceNumber ?? '') + ' ' + ((ctx.snaps[u] || {}).lastName || '').toLocaleUpperCase('hu'));
        b.addEventListener('click', () => { const on = !d.involved.includes(u); d.involved = on ? [...d.involved, u] : d.involved.filter((x) => x !== u); b.setAttribute('aria-pressed', String(on)); });
        return b;
      })));
    };
    drawInv();
    const lobbies = ['A', 'B', 'C'].filter((L) => ((doc.lobbies || {})[L] || []).length);
    const inp = (key, props) => { const el = h(props.area ? 'textarea' : 'input', { class: 'input', ...props, area: null }); el.addEventListener('input', () => { d[key] = el.value; }); return el; };
    const title = field(t('protestTitle'), inp('title', { maxlength: 80, placeholder: t('protestTitlePh') }));
    const lap = field(t('lap'), inp('lap', { inputmode: 'numeric', maxlength: 3 }));
    const corner = field(t('corner'), inp('corner', { maxlength: 20, placeholder: t('cornerPh') }));
    const desc = field(t('description'), inp('description', { area: true, maxlength: 1500, placeholder: t('protestDescPh') }));
    const video = field(t('videoLink'), inp('video', { type: 'url', inputmode: 'url', placeholder: 'https://youtu.be/…' }), { hint: t('videoHint') });
    const submit = h('button', { class: 'btn primary block', type: 'button', 'data-haptic': '' }, icon('flag'), judgeMode ? t('openJudgeCase') : t('fileProtest'));
    submit.addEventListener('click', () => busy(submit, async () => {
      err.replaceChildren();
      const probs = [];
      if (!d.title.trim()) { title.setError(t('errRequired')); probs.push(1); }
      if (!d.description.trim() || d.description.trim().length < 20) { desc.setError(t('errDescShort')); probs.push(1); }
      if (!d.involved.length) probs.push(err.append(formError(t('errInvolved'))));
      if (d.video && !/^https:\/\/\S+$/.test(d.video.trim())) { video.setError(t('errUrl')); probs.push(1); }
      if (d.lap && !/^\d{1,3}$/.test(d.lap)) { lap.setError(t('errNumber')); probs.push(1); }
      if (probs.length) { haptic(25); return; }
      try {
        const pid = await backend.protests.save(id, null, { n, L: d.L, S: d.S, lap: d.lap ? Number(d.lap) : null, corner: d.corner.trim(), involved: d.involved, title: d.title.trim(), description: d.description.trim(), video: d.video.trim(), by: session.user.uid, type: judgeMode ? 'judge' : 'driver', status: judgeMode ? 'review' : 'filed', panel: [] });
        toast(judgeMode ? t('judgeCaseOpened') : t('protestFiled')); haptic(15);
        go(judgeMode ? `/birosag/${id}/${pid}` : `/szezonok/${id}/fordulo/${n}`);
      } catch (e) { err.replaceChildren(formError(t(errorKey(e)))); }
    }));
    root.replaceChildren(h('h1', { class: 'display page-title' }, judgeMode ? t('judgeCaseTitle') : t('protestTitleH')),
      h('p', { class: 'page-sub' }, `MCSM${ctx.season.no}, ${t('roundN', { n })}: ${roundTitle(round)}`),
      judgeMode ? null : h('div', { class: 'callout', style: 'margin-bottom:16px' }, icon('info'), h('span', null, t('protestRules'))),
      h('div', { class: 'form' },
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
  return frag(pageTitle(t('judgesArea'), t('judgesSub')), h('div', { style: 'margin-bottom:14px' }, filterSeg), box);
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
    !panel.length ? empty(t('noPanelYet')) : null,
    elig.filter((e) => !e.eligible).length ? h('p', { class: 'note', style: 'margin:4px 0 0' }, t('excluded') + ': ' + elig.filter((e) => !e.eligible).map((e) => `${userName(e.uid)} (${t(e.reason)})`).join(', ')) : null));
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
  if (isChair()) sections.push(chairTools(ctx, p, tl, judges, teamOf, reload));
  return frag(...sections);
}

function voteForm(ctx, p, mine, reload) {
  const v = { outcome: mine ? mine.outcome : 'none', target: mine ? mine.target : (p.involved || [])[0] || null, seconds: mine ? mine.seconds : 5, other: mine ? mine.other || '' : '', reason: mine ? mine.reason || '' : '' };
  const detail = h('div', { class: 'stack', style: 'gap:12px' });
  const drawDetail = () => {
    const parts = [];
    if (v.outcome !== 'none') parts.push(h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('penalisedDriver')), choice((p.involved || []).concat(p.type === 'judge' ? [] : [p.by]).filter((x, i, a) => a.indexOf(x) === i).map((u) => ({ value: u, label: nameOf(ctx, u) })), v.target, (x) => { v.target = x; })));
    if (v.outcome === 'time') parts.push(h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('seconds')), choice(TIME_STEPS.map((x) => ({ value: x, label: '+' + x + ' s' })), v.seconds, (x) => { v.seconds = x; })));
    if (v.outcome === 'other') { const o = h('input', { class: 'input', value: v.other, maxlength: 120, placeholder: t('otherPh') }); o.addEventListener('input', () => { v.other = o.value; }); parts.push(field(t('outcome_other'), o).row); }
    detail.replaceChildren(...parts);
  };
  const reason = h('textarea', { class: 'input', maxlength: 600, placeholder: t('reasonVotePh') }); reason.value = v.reason;
  reason.addEventListener('input', () => { v.reason = reason.value; });
  const save = h('button', { class: 'btn primary block', type: 'button', 'data-haptic': '' }, icon('check'), mine ? t('updateVote') : t('castVote'));
  save.addEventListener('click', () => busy(save, async () => {
    if (v.outcome !== 'none' && !v.target) { toast(t('pickPenalised'), 'alert'); return; }
    try { await backend.votes.save(ctx.season.id, p.id, { ...v, outcome: v.outcome, seconds: v.outcome === 'time' ? v.seconds : null }); toast(t('voteSaved')); haptic(12); reload(); } catch (e) { toast(t(errorKey(e)), 'alert'); }
  }));
  drawDetail();
  return h('div', { class: 'panel pad stack', style: 'gap:12px' },
    h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('outcome')), choice(OUTCOMES.map((o) => ({ value: o, label: t('outcome_' + o) })), v.outcome, (x) => { v.outcome = x; drawDetail(); })),
    detail, field(t('reasonShort'), reason).row, save);
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
    const lead = p.decision || tl.leading || { outcome: 'none' };
    const d = { outcome: lead.outcome, target: lead.target || null, seconds: lead.seconds || 5, other: lead.other || '', text: (p.decision && p.decision.text) || '' };
    const flagsBox = h('div');
    const drawFlags = () => {
      if (d.outcome !== 'time' || !d.target) { flagsBox.replaceChildren(); return; }
      const f = dsqFlags(ctx.penalties, d.target, p.n, { kind: 'time', seconds: d.seconds });
      flagsBox.replaceChildren(f.autoDsq ? h('div', { class: 'callout warn' }, icon('alert'), h('span', null, t('flagAutoDsq', { n: f.count }))) : f.dsqPossible ? h('div', { class: 'callout warn' }, icon('alert'), h('span', null, t('flagDsqPossible', { s: f.total }))) : h('span'));
    };
    const txt = h('textarea', { class: 'input', maxlength: 1500, placeholder: t('decisionTextPh') }); txt.value = d.text; txt.addEventListener('input', () => { d.text = txt.value; });
    const targetChoice = choice((p.involved || []).concat(p.type === 'judge' ? [] : [p.by]).filter((x, i, a) => a.indexOf(x) === i).map((u) => ({ value: u, label: nameOf(ctx, u) })), d.target, (x) => { d.target = x; drawFlags(); });
    const secChoice = choice(TIME_STEPS.map((x) => ({ value: x, label: '+' + x + ' s' })), d.seconds, (x) => { d.seconds = x; drawFlags(); });
    const otherIn = h('input', { class: 'input', value: d.other, maxlength: 120, placeholder: t('otherPh') }); otherIn.addEventListener('input', () => { d.other = otherIn.value; });
    const detail = h('div', { class: 'stack', style: 'gap:12px' });
    const drawDetail = () => { detail.replaceChildren(...[d.outcome !== 'none' ? h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('penalisedDriver')), targetChoice) : null, d.outcome === 'time' ? h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('seconds')), secChoice) : null, d.outcome === 'other' ? field(t('outcome_other'), otherIn).row : null].filter(Boolean)); drawFlags(); };
    const publish = h('button', { class: 'btn primary block', type: 'button', 'data-haptic': '', disabled: !tl.enough }, icon('flag'), t('publishDecision'));
    publish.addEventListener('click', () => busy(publish, async () => {
      if (!d.text.trim()) { toast(t('decisionNeedsText'), 'alert'); return; }
      if (d.outcome !== 'none' && !d.target) { toast(t('pickPenalised'), 'alert'); return; }
      const decision = { outcome: d.outcome, target: d.outcome === 'none' ? null : d.target, seconds: d.outcome === 'time' ? d.seconds : null, other: d.outcome === 'other' ? d.other : null, text: d.text.trim() };
      try {
        if (['time', 'dsq', 'warning', 'other'].includes(d.outcome)) {
          await backend.penalties.save(s.id, { protestId: p.id, n: p.n, L: lobbyOf((ctx.roundDoc(p.n) || {}).lobbies, d.target) || p.L, S: p.S, uid: d.target, kind: d.outcome, seconds: decision.seconds, note: decision.other });
        }
        await backend.protests.save(s.id, p.id, { status: 'published', decision, decidedAt: Date.now(), publishedAt: Date.now() });
        await audit('protest.publish', { after: decision });
        invalidate('race:' + s.id); toast(t('decisionPublished')); haptic(15); reload();
      } catch (e) { toast(t(errorKey(e)), 'alert'); }
    }));
    drawDetail();
    box.append(h('div', { class: 'label' }, t('finalDecision')),
      choice(OUTCOMES.map((o) => ({ value: o, label: t('outcome_' + o) })), d.outcome, (x) => { d.outcome = x; drawDetail(); }), detail, flagsBox,
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
