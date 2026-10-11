// services/honours.js
// Every season's podiums: MCSM 1–29 from the hall-of-fame sheet, later finished seasons from the
// site's own standings (drivers, teams, MGTK). Cached; shared by the hall of fame, profiles,
// team pages and the "by titles" sort.
import { cached } from '../core/data.js';
import { seasons as loadSeasons, teamMap } from '../core/data.js';
import { loadRace } from '../core/race-data.js';
import { driverStandings, teamStandings } from '../engine/scoring.js';
import { HALL } from '../data/hall-of-fame.js';
import { driverMedals, teamMedals } from '../model/honours.js';

async function computed() {
  const all = (await loadSeasons()).filter((s) => ['finished', 'archived'].includes(s.state) && s.no > Math.max(...HALL.map((x) => x.no)));
  const tmap = await teamMap();
  const out = [];
  for (const s of all) {
    const ctx = await loadRace(s.id).catch(() => null);
    if (!ctx || !ctx.built.length) continue;
    const person = (r) => { const p = ctx.snaps[r.id] || {}; return { uid: r.id, psn: p.psn || '', name: `${p.lastName || ''} ${p.firstName || ''}`.trim() }; };
    const d = driverStandings(ctx.built, ctx.ids, { table: ctx.points }).slice(0, 3).map(person);
    const tm = teamStandings(ctx.built, ctx.teams, { table: ctx.points }).slice(0, 3).map((r) => (tmap[r.id] || {}).name || null);
    const mg = driverStandings(ctx.built, ctx.ids, { table: ctx.points, filter: (uid) => (ctx.snaps[uid] || {}).gtTeamId === 'MGTK' }).slice(0, 3).map(person);
    out.push({ no: s.no, sid: s.id, date: '', title: s.name, drivers: d, teams: tm, mgtk: mg, live: true });
  }
  return out;
}
export const honours = () => cached('honours', async () => {
  const seasons = [...HALL, ...(await computed().catch(() => []))].sort((a, b) => b.no - a.no);
  return { seasons, people: driverMedals(seasons), teams: teamMedals(seasons) };
});
