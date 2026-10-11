// services/ratings.js
// DR/SR (and GT7 ID, career numbers) from GT GridStats, 16 drivers per request, paced to the
// API's 10-a-minute limit. Used by the GT7 data page and by the once-a-day automatic refresh,
// which runs quietly in an admin's browser the first time an admin opens the site each day.
import { backend } from './backend.js';
import { gridstatsClient, PACE_MS } from './gridstats.js';
import { users as loadUsers, invalidate } from '../core/data.js';
import { isComplete } from '../model/profile.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const DAY = 86400000;

// Which drivers to refresh: 'all', 'missing' (never synced) or 'stale' (not in the last day).
export function pickDrivers(us, mode = 'all', now = Date.now()) {
  const done = us.filter((u) => isComplete(u) && u.psn);
  if (mode === 'missing') return done.filter((u) => !u.ratingsSyncedAt);
  if (mode === 'stale') return done.filter((u) => !u.ratingsSyncedAt || now - u.ratingsSyncedAt > DAY * 0.9);
  return done;
}

export async function writeUsers(ops) {
  if (!ops.length) return;
  try { await backend.admin.call('importData', { ops }); }
  catch (e) { if (e.code === 'fn-missing') { for (const o of ops) await backend.users.save(o.path[1], o.data); } else throw e; }
}

export async function syncRatings(drivers, api, { fake = false, onBatch = () => {}, stop = () => false } = {}) {
  const byPsn = Object.fromEntries(drivers.map((u) => [u.psn.toLowerCase(), u]));
  const batches = []; for (let i = 0; i < drivers.length; i += 16) batches.push(drivers.slice(i, i + 16));
  let updated = 0; const missing = [];
  for (let b = 0; b < batches.length; b++) {
    if (stop()) break;
    const res = await api.racers(batches[b].map((u) => u.psn));
    const ops = [];
    for (const d of res.drivers || []) {
      const u = byPsn[String(d.PSN_ID || '').toLowerCase()]; if (!u) continue;
      const st = d.stats || {};
      ops.push({ path: ['users', u.uid], merge: true, data: { dr: d.DR || u.dr, sr: d.SR || u.sr, drPoints: st.dr_points ?? null, gtStats: { races: st.total_races ?? null, wins: st.victories ?? null, clean: st.clean_races ?? null, country: d.country_code || null }, ratingsSyncedAt: Date.now(), ...(d.GUID ? { gt7Guid: String(d.GUID) } : {}), ...(d.Nickname ? { gt7Nick: String(d.Nickname) } : {}) } });
      updated++;
    }
    await writeUsers(ops);
    (res.not_found || []).forEach((p) => missing.push(p));
    onBatch(b + 1, batches.length, updated);
    if (b < batches.length - 1 && !fake) await sleep(PACE_MS);
  }
  invalidate('users');
  return { updated, missing };
}

let running = false;
export async function autoDailySync() {
  if (running || backend.kind === 'fake') return;
  running = true;
  try {
    const cfg = await backend.config.get('gridstats').catch(() => null);
    if (!cfg || !cfg.token || cfg.autoDaily === false) return;
    if (Date.now() - (cfg.lastAuto || 0) < DAY * 0.95) return;
    await backend.config.save('gridstats', { ...cfg, lastAuto: Date.now() });
    const drivers = pickDrivers(await loadUsers(), 'stale');
    if (!drivers.length) return;
    const r = await syncRatings(drivers, gridstatsClient({ token: cfg.token, base: cfg.base }));
    await backend.config.save('gridstats', { ...cfg, lastAuto: Date.now(), lastAutoCount: r.updated });
    console.info(`MCSM: daily DR/SR refresh done, ${r.updated} drivers updated.`);
  } catch (e) { console.warn('MCSM: daily DR/SR refresh failed', e); }
  finally { running = false; }
}
