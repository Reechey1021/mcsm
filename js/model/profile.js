// model/profile.js
// What a driver profile is, how it's validated, and when it counts as complete.
// Pure functions: used by the wizard, the admin editor and the tests.

export const DR_OPTS = ['A+', 'A', 'B', 'C', 'D', 'E'];
export const SR_OPTS = ['S', 'A', 'B', 'C', 'D', 'E'];
export const DR_RANK = { 'A+': 6, A: 5, B: 4, C: 3, D: 2, E: 1 };
export const INPUTS = ['wheel', 'pad'];
export const WHEEL_BRANDS = ['Fanatec', 'Logitech', 'Thrustmaster', 'Moza', 'Simagic', 'other'];
// Open question: camera view vs display (TV/monitor/PSVR2). Easy to change here.
export const VIEWS = ['cockpit', 'bonnet', 'bumper', 'chase', 'tv'];
export const ROLE_KEYS = ['owner', 'admin', 'judgeChair', 'judge', 'resultsEditor'];

const NAME_RE = /^[\p{L}][\p{L}' .-]{0,39}$/u;
const PSN_RE = /^[A-Za-z][A-Za-z0-9_-]{2,15}$/;
const STREAM_RE = /^https:\/\/(www\.)?(twitch\.tv|youtube\.com|youtu\.be)\/\S+$/i;

export const psnKey = (psn) => String(psn || '').trim().toLowerCase();

// Each validator returns an error key (for t()) or '' when valid.
export const validate = {
  name: (v) => (!v || !v.trim() ? 'errRequired' : NAME_RE.test(v.trim()) ? '' : 'errName'),
  psn: (v) => (!v || !v.trim() ? 'errRequired' : PSN_RE.test(v.trim()) ? '' : 'errPsn'),
  input: (v) => (INPUTS.includes(v) ? '' : 'errChoose'),
  wheelBrand: (v, p) => (p.input !== 'wheel' ? '' : !v ? 'errChoose' : v === 'other' && !(p.wheelOther || '').trim() ? 'errWheelOther' : ''),
  view: (v) => (VIEWS.includes(v) ? '' : 'errChoose'),
  raceNumber: (v, p, ctx = {}) => {
    const n = Number(v);
    if (v === '' || v == null || !Number.isInteger(n) || n < 1 || n > 999) return 'errNumber';
    if (n === 1 && !ctx.isChampion && !ctx.isAdmin) return 'errNumberOne';
    if (ctx.teammateNumbers && ctx.teammateNumbers.includes(n)) return 'errNumberTeam';
    return '';
  },
  dr: (v) => (DR_OPTS.includes(v) ? '' : 'errChoose'),
  sr: (v) => (SR_OPTS.includes(v) ? '' : 'errChoose'),
  stream: (v) => (!v || STREAM_RE.test(v.trim()) ? '' : 'errStream'),
};

export const STEPS = [
  ['lastName', 'firstName', 'psn'],
  ['input', 'wheelBrand', 'view', 'raceNumber', 'dr', 'sr'],
  ['gtTeamId', 'teamId', 'streamUrl'],
];

const REQUIRED = ['lastName', 'firstName', 'psn', 'input', 'wheelBrand', 'view', 'raceNumber', 'dr', 'sr'];
const VALIDATOR_FOR = { lastName: 'name', firstName: 'name', psn: 'psn', input: 'input', wheelBrand: 'wheelBrand', view: 'view', raceNumber: 'raceNumber', dr: 'dr', sr: 'sr', streamUrl: 'stream' };

export function fieldError(key, p, ctx) {
  const vk = VALIDATOR_FOR[key];
  return vk ? validate[vk](p[key], p, ctx) : '';
}

export function isComplete(p) {
  if (!p) return false;
  return REQUIRED.every((k) => !fieldError(k, p, { isAdmin: true }));
}

// How many wizard steps are fully valid (for the progress banner).
export function stepsDone(p) {
  if (!p) return 0;
  let n = 0;
  for (const keys of STEPS) {
    if (keys.every((k) => !REQUIRED.includes(k) || !fieldError(k, p, { isAdmin: true }))) n++; else break;
  }
  return n;
}

export const fullName = (p) => (p && p.lastName ? `${p.lastName.toLocaleUpperCase('hu')} ${p.firstName || ''}`.trim() : '');
export const initials = (p) => ((p && p.firstName ? p.firstName[0] : '') + (p && p.lastName ? p.lastName[0] : '')).toUpperCase() || '?';

// Only these keys may be written by a driver to their own profile (mirrors firestore.rules).
export const SELF_KEYS = ['firstName', 'lastName', 'psn', 'psnLower', 'input', 'wheelBrand', 'wheelOther', 'view', 'raceNumber', 'dr', 'sr', 'gtTeamId', 'teamId', 'teamRequest', 'streamUrl', 'lang', 'complete', 'updatedAt', 'createdAt', 'notifReadAt'];

export function clean(p) {
  const out = {};
  for (const k of SELF_KEYS) if (p[k] !== undefined) out[k] = p[k];
  if (out.firstName) out.firstName = out.firstName.trim();
  if (out.lastName) out.lastName = out.lastName.trim();
  if (out.psn) { out.psn = out.psn.trim(); out.psnLower = psnKey(out.psn); }
  if (out.raceNumber !== undefined && out.raceNumber !== '') out.raceNumber = Number(out.raceNumber);
  if (out.input === 'pad') { out.wheelBrand = null; out.wheelOther = null; }
  if (out.wheelBrand !== 'other') out.wheelOther = null;
  return out;
}
