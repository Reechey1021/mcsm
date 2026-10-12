// model/name-match.js
// Match a name as GT7 shows it ("MGTK_Hoppá", "R. Borbély", "Borbély Renátó") to one of the
// drivers we know are in that lobby. Never guesses: anything not clear-cut is marked unsure.
const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
export const normName = (s) => fold(s).replace(/[^a-z0-9]+/g, '');
const words = (s) => fold(s).split(/[^a-z0-9]+/).filter(Boolean);

function lev(a, b) {
  if (Math.abs(a.length - b.length) > 3) return 9;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length][b.length];
}

// people: [{ uid, psn, firstName, lastName }]. Returns { uid, how, sure }.
export function matchName(display, people) {
  const n = normName(display);
  if (!n) return { uid: null, how: 'empty', sure: false };
  const one = (list, how, sure = true) => (list.length === 1 ? { uid: list[0].uid, how, sure } : list.length > 1 ? { uid: null, how: how + '-ambiguous', sure: false } : null);
  const w = words(display);
  return (
    one(people.filter((p) => normName(p.psn) === n), 'psn')
    || one(people.filter((p) => normName(`${p.firstName} ${p.lastName}`) === n || normName(`${p.lastName} ${p.firstName}`) === n), 'name')
    // "R. Borbély" / "Borbély R."
    || (w.length === 2 ? one(people.filter((p) => { const f = normName(p.firstName), l = normName(p.lastName); return (w[0].length === 1 && f.startsWith(w[0]) && l === w[1]) || (w[1].length === 1 && f.startsWith(w[1]) && l === w[0]); }), 'initial') : null)
    || one(people.filter((p) => normName(p.lastName) === n), 'surname')
    // PSN without its team prefix ("Hoppá" for "MGTK_Hoppá")
    || one(people.filter((p) => { const m = /^[A-Za-z0-9]{2,6}_(.+)$/.exec(p.psn || ''); return m && normName(m[1]) === n; }), 'psn-core')
    // close but not exact: offered, flagged for review
    || one(people.filter((p) => n.length >= 5 && lev(normName(p.psn), n) <= 2), 'psn-fuzzy', false)
    || { uid: null, how: 'none', sure: false }
  );
}

// Match a whole table; a driver can only be used once (later duplicates become unsure).
export function matchRows(rows, people) {
  const used = new Set();
  return rows.map((r) => {
    const m = matchName(r.displayName, people);
    if (m.uid && used.has(m.uid)) return { ...r, uid: null, how: 'duplicate', sure: false };
    if (m.uid) used.add(m.uid);
    const lowConf = typeof r.confidence === 'number' && r.confidence < 0.8;
    return { ...r, uid: m.uid, how: m.how, sure: m.sure && !lowConf && !(r.warnings || []).length };
  });
}
