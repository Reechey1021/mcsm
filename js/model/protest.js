// model/protest.js
// Protest rules as pure functions: the filing window, who may close a case, the penalty lines
// of a decision, and the DSQ triggers. No panels or votes: admins and judges (Bíró) log the verdict.
import { shiftDay } from './time.js';

export const STATUSES = ['filed', 'review', 'decided', 'published', 'notInvestigated', 'withdrawn'];
export const OUTCOMES = ['none', 'warning', 'time', 'dsq', 'other'];
export const TIME_STEPS = [1, 3, 5, 7, 10, 15, 20, 25, 30];

// Race night 21:30 until Monday 20:00 (Budapest). A round doc may extend it.
export function protestWindow(round, roundDoc = {}) {
  if (!round || !round.date) return null;
  return { opensAt: roundDoc.protestOpensAt ?? shiftDay(round.date, 0, '21:30'), closesAt: roundDoc.protestClosesAt ?? shiftDay(round.date, 1, '20:00') };
}
export function windowState(round, roundDoc, now = Date.now()) {
  const w = protestWindow(round, roundDoc);
  if (!w) return 'none';
  return now < w.opensAt ? 'soon' : now < w.closesAt ? 'open' : 'closed';
}

// Who logged the protest (the filer). Older cases may have a separate complainant or be a
// stewards' investigation (type 'judge', no complainant).
export const complainantOf = (p) => (p.type === 'judge' ? null : p.complainant || p.by);
export const isOpen = (p) => ['filed', 'review', 'decided'].includes(p.status);
// Everyone the case concerns: the filer, the involved drivers and anyone penalised.
export function partiesOf(p, penalties = []) {
  return [...new Set([p.by, complainantOf(p), ...(p.involved || []), ...penalties.map((l) => l.target)].filter(Boolean))];
}
// Who may close a case: admins always (full trust, even when involved); a judge (Bíró) unless they
// filed it or are one of its involved drivers.
export function mayJudge(p, uid, roles = {}) {
  if (!uid || !p) return false;
  if (roles.admin === true || roles.owner === true) return true;
  if (roles.judgeChair !== true) return false;
  return !(p.by === uid || complainantOf(p) === uid || (p.involved || []).includes(uid));
}
export const canClose = (p, uid, roles = {}) => !!p && isOpen(p) && mayJudge(p, uid, roles);
// Judges' area: admins and judges.
export const isJudgeProfile = (u) => !!(u && u.roles && (u.roles.judgeChair === true || u.roles.admin === true || u.roles.owner === true));

// A decision as a list of penalty lines [{ target, kind: 'warning'|'time'|'dsq'|'other', seconds, other }].
// Older data stored one { outcome, target, seconds, other }; both read the same way.
export function penaltyLines(x) {
  if (!x) return [];
  if (Array.isArray(x.penalties)) return x.penalties.filter((l) => l && l.target && l.kind);
  if (x.outcome && x.outcome !== 'none' && x.outcome !== 'penalties' && x.target) return [{ target: x.target, kind: x.outcome, seconds: x.outcome === 'time' ? x.seconds : null, other: x.outcome === 'other' ? x.other || '' : null }];
  return [];
}
// Biblia triggers, checked when a time penalty is about to be published for `uid` in round n.
export function dsqFlags(penalties, uid, n, next) {
  const mine = penalties.filter((p) => p.uid === uid && p.n === n && p.kind === 'time');
  const all = next && next.kind === 'time' ? [...mine, next] : mine;
  const total = all.reduce((s, p) => s + (p.seconds || 0), 0);
  return { autoDsq: all.length >= 3, dsqPossible: all.length >= 2 && total >= 30, count: all.length, total };
}

// Spec format: which cars a team has already used, and whether a pick is still allowed.
export function specUsed(picks, teamId, exceptRound) {
  return picks.filter((p) => p.teamId === teamId && p.n !== exceptRound).map((p) => p.car);
}
export function specPickError(season, picks, teamId, n, car, now = Date.now()) {
  const round = (season.rounds || []).find((r) => r.n === n);
  if (!round) return 'errGeneric';
  if (now >= round.date) return 'specLocked';
  if (!(season.cars || []).includes(car)) return 'errChoose';
  if (specUsed(picks, teamId, n).includes(car)) return 'specUsed';
  return '';
}
