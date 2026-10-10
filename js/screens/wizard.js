// screens/wizard.js
// The three-step profile wizard (also the profile editor). Each step saves as you go,
// so a half-finished profile can be resumed on any device.
import { h, frag } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { reduced, haptic, SPRING } from '../core/motion.js';
import { field, choice, seg, busy } from '../ui/controls.js';
import { formError, loading } from '../ui/parts.js';
import { toast } from '../ui/sheet.js';
import { t } from '../i18n/index.js';
import { backend, errorKey } from '../services/backend.js';
import { session, isAdmin } from '../services/session.js';
import { teams as loadTeams, gtTeams as loadGt, invalidate } from '../core/data.js';
import { DR_OPTS, SR_OPTS, WHEEL_BRANDS, VIEWS, STEPS, fieldError, clean, isComplete, stepsDone, psnKey } from '../model/profile.js';
import { go } from '../router.js';

export function screenWizard(_params, query) {
  const root = h('div', { class: 'narrow' }, loading());
  Promise.all([loadTeams(), loadGt()]).then(([teams, gts]) => root.replaceChildren(build(teams, gts, query))).catch(() => root.replaceChildren(formError(t('loadFailed'))));
  return root;
}

function build(teams, gts, query) {
  const uid = session.user.uid;
  const editing = isComplete(session.profile);
  const draft = { ...(session.profile || {}) };
  if (!draft.input) draft.input = 'wheel';
  let step = Math.min(editing ? (Number(query.get('lepes')) || 0) : stepsDone(draft), 2);
  let psnState = { value: draft.psn || '', free: true };
  const errors = {};
  const setters = {};

  const title = h('h1', { class: 'display page-title' }, editing ? t('editProfile') : t('wizardTitle'));
  const sub = h('p', { class: 'page-sub' });
  const bars = h('div', { class: 'wizard-steps', 'aria-hidden': 'true' }, [0, 1, 2].map(() => h('i')));
  const body = h('div', { class: 'wizard-body form' });
  const errBox = h('div');
  const back = h('button', { class: 'btn', type: 'button' }, icon('chevL'), t('back'));
  const next = h('button', { class: 'btn primary', type: 'button', 'data-haptic': '' });
  const stepNav = editing ? seg([0, 1, 2].map((i) => ({ value: i, label: t('step' + i) })), step, (v) => { if (validateStep(step)) go_(v); }, { label: t('steps') }) : null;

  const row = (key, label, input, hint) => { const f = field(label, input, { hint }); setters[key] = f.setError; return f.row; };
  const showErrors = (keys) => keys.forEach((k) => setters[k] && setters[k](errors[k] ? t(errors[k]) : ''));
  const teammatesCtx = async () => {
    const mates = draft.teamId ? await backend.users.teammates(draft.teamId, uid) : [];
    return { teammateNumbers: mates.map((m) => m.raceNumber).filter(Boolean), isAdmin: isAdmin() };
  };

  function validateStep(i, ctx = { isAdmin: isAdmin() }) {
    let ok = true;
    for (const k of STEPS[i]) {
      errors[k] = fieldError(k, draft, ctx);
      if (k === 'psn' && !errors[k] && !psnState.free && psnKey(psnState.value) === psnKey(draft.psn)) errors[k] = 'errPsnTaken';
      if (errors[k]) ok = false;
    }
    showErrors(STEPS[i]);
    if (!ok) { const first = body.querySelector('[aria-invalid="true"]'); first && first.focus({ preventScroll: false }); haptic(25); next.animate([{ transform: 'translateX(0)' }, { transform: 'translateX(-6px)' }, { transform: 'translateX(5px)' }, { transform: 'translateX(0)' }], { duration: 300 }); }
    return ok;
  }

  const steps = [
    () => {
      const last = h('input', { class: 'input', autocomplete: 'family-name', value: draft.lastName || '', maxlength: 40 });
      const first = h('input', { class: 'input', autocomplete: 'given-name', value: draft.firstName || '', maxlength: 40 });
      const psn = h('input', { class: 'input', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', value: draft.psn || '', maxlength: 16 });
      const psnHint = h('span');
      last.addEventListener('input', () => { draft.lastName = last.value; setters.lastName(''); });
      first.addEventListener('input', () => { draft.firstName = first.value; setters.firstName(''); });
      let tm;
      psn.addEventListener('input', () => {
        draft.psn = psn.value; setters.psn(''); psnHint.textContent = '';
        clearTimeout(tm);
        if (fieldError('psn', draft)) return;
        tm = setTimeout(async () => {
          const v = psn.value; const free = await backend.users.psnFree(v, uid);
          if (v !== psn.value) return;
          psnState = { value: v, free };
          if (!free) setters.psn(t('errPsnTaken')); else psnHint.replaceChildren(h('span', { style: 'color:var(--accent-text);font-weight:700' }, '✓ ' + t('psnFree')));
        }, 380);
      });
      return frag(row('lastName', t('lastName'), last), row('firstName', t('firstName'), first), row('psn', t('psnId'), psn, h('span', null, t('psnHint'), ' ', psnHint)));
    },
    () => {
      const brandBox = h('div');
      const otherIn = h('input', { class: 'input', value: draft.wheelOther || '', maxlength: 40, placeholder: t('wheelOtherPh') });
      otherIn.addEventListener('input', () => { draft.wheelOther = otherIn.value; setters.wheelBrand(''); });
      const otherRow = h('div', { style: draft.wheelBrand === 'other' ? '' : 'display:none' }, otherIn);
      const brandChoice = choice(WHEEL_BRANDS.map((b) => ({ value: b, label: b === 'other' ? t('other') : b })), draft.wheelBrand, (v) => { draft.wheelBrand = v; setters.wheelBrand(''); otherRow.style.display = v === 'other' ? '' : 'none'; if (v === 'other') otherIn.focus(); });
      const brandRow = h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('wheelBrand')), brandChoice, otherRow, h('div', { class: 'err', role: 'alert' }));
      setters.wheelBrand = (m) => { brandRow.querySelector('.err').textContent = m || ''; };
      brandBox.append(brandRow);
      const showBrand = (on) => {
        if (on === (brandBox.style.display !== 'none')) return;
        brandBox.style.display = on ? '' : 'none';
        if (on && !reduced()) brandBox.animate([{ opacity: 0, transform: 'translateY(-6px)' }, { opacity: 1, transform: 'none' }], { duration: 240, easing: 'cubic-bezier(.2,.8,.2,1)' });
      };
      brandBox.style.display = draft.input === 'wheel' ? '' : 'none';
      const inputSeg = seg([{ value: 'wheel', label: t('wheel') }, { value: 'pad', label: t('pad') }], draft.input, (v) => { draft.input = v; showBrand(v === 'wheel'); });
      const chooseRow = (key, label, el) => { const r = h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, label), el, h('div', { class: 'err', role: 'alert' })); setters[key] = (m) => { r.querySelector('.err').textContent = m || ''; }; return r; };
      const num = h('input', { class: 'input big', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 3, value: draft.raceNumber ?? '', 'aria-label': t('raceNumber') });
      num.addEventListener('input', () => { num.value = num.value.replace(/\D/g, '').slice(0, 3); draft.raceNumber = num.value === '' ? '' : Number(num.value); setters.raceNumber(''); });
      return frag(
        h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('inputLabel')), inputSeg), brandBox,
        chooseRow('view', t('viewLabel'), choice(VIEWS.map((v) => ({ value: v, label: t('view_' + v) })), draft.view, (v) => { draft.view = v; setters.view(''); })),
        row('raceNumber', t('raceNumber'), num, t('raceNumberHint')),
        chooseRow('dr', t('drLabel'), choice(DR_OPTS.map((v) => ({ value: v, label: v })), draft.dr, (v) => { draft.dr = v; setters.dr(''); })),
        chooseRow('sr', t('srLabel'), choice(SR_OPTS.map((v) => ({ value: v, label: v })), draft.sr, (v) => { draft.sr = v; setters.sr(''); })),
        h('p', { class: 'note', style: 'margin:-4px 0 0' }, t('ratingsLater')));
    },
    () => {
      const gtChoice = choice([{ value: null, label: t('none') }, ...gts.map((g) => ({ value: g.id, label: g.tag }))], draft.gtTeamId ?? null, (v) => { draft.gtTeamId = v; });
      const pending = draft.teamRequest ? teams.find((x) => x.id === draft.teamRequest) : null;
      const note = h('p', { class: 'note', style: 'margin:0' }, pending ? t('teamRequestPending', { team: pending.name }) : '');
      const list = h('div', { class: 'team-pick', role: 'radiogroup', 'aria-label': t('mcsmTeam') });
      const opts = [{ id: null, name: t('noTeam'), status: 'free' }, ...teams.filter((x) => x.status !== 'retired')];
      const cur = () => draft.teamRequest || draft.teamId || null;
      const btns = opts.map((tm) => {
        const b = h('button', { class: 'team-opt', type: 'button', role: 'radio', 'aria-pressed': String(cur() === tm.id), 'aria-checked': String(cur() === tm.id) },
          h('span', { class: 'sw', style: `background:${tm.c1 || 'var(--line-2)'}` }), h('b', null, tm.name), tm.status === 'perm' ? h('span', { class: 'status' }, t('teamPerm')) : null);
        b.addEventListener('click', () => {
          btns.forEach((x) => { x.setAttribute('aria-pressed', String(x === b)); x.setAttribute('aria-checked', String(x === b)); });
          if (tm.status === 'perm' && !isAdmin() && tm.id !== session.profile.teamId) { draft.teamRequest = tm.id; note.textContent = t('teamRequestNote', { team: tm.name }); }
          else { draft.teamId = tm.id; draft.teamRequest = null; note.textContent = ''; }
        });
        return b;
      });
      list.append(...btns);
      const stream = h('input', { class: 'input', type: 'url', inputmode: 'url', value: draft.streamUrl || '', placeholder: 'https://twitch.tv/…' });
      stream.addEventListener('input', () => { draft.streamUrl = stream.value.trim(); setters.streamUrl(''); });
      return frag(h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('gtTeam')), gtChoice, h('span', { class: 'hint' }, t('gtTeamHint'))),
        h('div', { class: 'f-row' }, h('span', { class: 'f-label' }, t('mcsmTeam')), list, note),
        row('streamUrl', t('streamLink'), stream, t('streamHint')));
    },
  ];

  function paint(dir) {
    sub.textContent = t('stepOf', { n: step + 1, total: 3, name: t('step' + step) });
    [...bars.children].forEach((b, i) => { b.className = i < step ? 'done' : i === step ? 'on' : ''; });
    back.style.visibility = step === 0 ? 'hidden' : 'visible';
    next.replaceChildren(...(editing ? [icon('check'), t('save')] : step === 2 ? [icon('check'), t('finish')] : [t('next'), icon('chevR')]));
    body.replaceChildren(steps[step]());
    if (dir && !reduced()) body.animate([{ opacity: 0, transform: `translateX(${dir * 28}px)` }, { opacity: 1, transform: 'none' }], { duration: SPRING.move.duration, easing: SPRING.move.easing });
  }
  function go_(i) { const dir = i > step ? 1 : -1; step = i; paint(dir); window.scrollTo({ top: 0, behavior: reduced() ? 'auto' : 'smooth' }); }

  async function save() {
    const data = clean(draft);
    data.complete = isComplete({ ...draft, ...data });
    if (data.teamRequest && data.teamRequest === draft.teamId) data.teamRequest = null;
    await backend.users.save(uid, data);
    invalidate('users');
  }

  back.addEventListener('click', () => { if (step > 0) go_(step - 1); });
  next.addEventListener('click', () => busy(next, async () => {
    errBox.replaceChildren();
    const ctx = step >= 1 ? await teammatesCtx() : { isAdmin: isAdmin() };
    if (step === 0 && draft.psn && !fieldError('psn', draft) && psnKey(draft.psn) !== psnKey(psnState.value)) {
      psnState = { value: draft.psn, free: await backend.users.psnFree(draft.psn, uid) };
    }
    if (!validateStep(step, ctx)) return;
    if (step === 2 && !validateStep(1, ctx)) { go_(1); return; }
    try {
      await save();
      if (editing) { toast(t('saved')); return; }
      if (step < 2) go_(step + 1);
      else { toast(t('profileDone')); go(query.get('next') || '/sajat'); }
    } catch (err) { errBox.replaceChildren(formError(t(errorKey(err)))); if (err.code === 'psn-taken') { step = 0; paint(-1); setters.psn(t('errPsnTaken')); } }
  }));

  paint(0);
  return frag(title, sub, stepNav ? h('div', { style: 'margin:0 0 16px' }, stepNav) : bars, errBox, body, h('div', { class: 'wizard-foot' }, editing ? h('a', { class: 'btn', href: '#/sajat' }, t('done')) : back, next));
}
