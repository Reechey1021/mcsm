// model/protest.js
// Protest rules from the Biblia as pure functions: the filing window, who may judge a
// case (lobby scope minus conflicts of interest), the vote tally, and the DSQ triggers.
import { shiftDay } from './time.js';

export const STATUSES = ['filed', 'review', 'decided', 'published', 'notInvestigated', 'withdrawn'];
export const OUTCOMES = ['none', 'warning', 'time', 'dsq', 'other'];
export const TIME_STEPS = [1, 3, 5, 7, 10, 15, 20, 25, 30];
export const MIN_VOTES = 3;

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

const scopeOf = (p) => (Array.isArray(p.judgeScope) && p.judgeScope.length ? p.judgeScope : ['A', 'B', 'C']);
// Judges, the judge chair, and everyone above them (admins, owners) can judge cases.
export const isJudgeProfile = (p) => !!(p && p.roles && (p.roles.judge === true || p.roles.judgeChair === true || p.roles.admin === true || p.roles.owner === true));

// Everyone who could sit on this case, and why someone is left out.
// judges: [{ uid, ...profile }], teamOf: uid -> teamId in this season.
export function eligibility(protest, judges, teamOf) {
  const complainant = protest.type === 'judge' ? null : protest.complainant || protest.by;
  const involved = new Set([complainant, ...(protest.involved || [])].filter(Boolean));
  const involvedTeams = new Set([...involved].map((u) => teamOf(u)).filter(Boolean));
  return judges.filter(isJudgeProfile).map((j) => {
    let reason = '';
    if (involved.has(j.uid)) reason = 'conflictInvolved';
    else if (teamOf(j.uid) && involvedTeams.has(teamOf(j.uid))) reason = 'conflictTeammate';
    else if (!scopeOf(j).includes(protest.L)) reason = 'outOfScope';
    return { uid: j.uid, eligible: !reason, reason };
  });
}
// Default panel: A-lobby cases go to every eligible judge; B/C to those whose scope covers it
// (eligibility already applies the scope).
export function defaultPanel(protest, judges, teamOf) {
  return eligibility(protest, judges, teamOf).filter((e) => e.eligible).map((e) => e.uid);
}

// A verdict or vote as a list of penalty lines [{ target, kind: 'warning'|'time'|'dsq'|'other', seconds, other }].
// Older data stored one { outcome, target, seconds, other }; both read the same way.
export function penaltyLines(x) {
  if (!x) return [];
  if (Array.isArray(x.penalties)) return x.penalties.filter((l) => l && l.target && l.kind);
  if (x.outcome && x.outcome !== 'none' && x.outcome !== 'penalties' && x.target) return [{ target: x.target, kind: x.outcome, seconds: x.outcome === 'time' ? x.seconds : null, other: x.outcome === 'other' ? x.other || '' : null }];
  return [];
}
const lineKey = (l) => `${l.kind}:${l.kind === 'time' ? l.seconds : ''}:${l.target}`;
const voteKey = (v) => { const ls = penaltyLines(v); return ls.length ? ls.map(lineKey).sort().join('|') : 'none'; };
// Votes from panel members only. Returns counts and the leading option.
export function tally(votes, panel) {
  const valid = votes.filter((v) => panel.includes(v.uid));
  const counts = {};
  valid.forEach((v) => { const k = voteKey(v); counts[k] = counts[k] || { n: 0, sample: v }; counts[k].n++; });
  const ranked = Object.values(counts).sort((a, b) => b.n - a.n);
  return { valid: valid.length, enough: valid.length >= MIN_VOTES, leading: ranked[0] ? ranked[0].sample : null, tie: ranked.length > 1 && ranked[0].n === ranked[1].n, options: ranked };
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
