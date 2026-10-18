// services/protest-numbers.js
// Protests are numbered like tickets (#1, #2, … across all seasons) so judges can refer to them.
// New ones get their number when filed; this numbers any older case once, oldest first.
import { backend } from './backend.js';
import { seasons as loadSeasons } from '../core/data.js';
import { isAdmin } from './session.js';

let ran = false;
export async function ensureProtestNumbers() {
  if (ran || !isAdmin()) return 0;
  ran = true;
  const c = await backend.protests.counter();
  if (c && c.backfilled) return 0;
  const all = [];
  for (const s of await loadSeasons()) {
    const ps = await backend.protests.list(s.id, { judge: true }).catch(() => []);
    ps.filter((p) => !p.no).forEach((p) => all.push({ sid: s.id, id: p.id, at: p.createdAt || 0 }));
  }
  all.sort((a, b) => a.at - b.at || (a.id < b.id ? -1 : 1));
  for (const p of all) await backend.protests.assignNo(p.sid, p.id);
  await backend.protests.markNumbered();
  return all.length;
}
