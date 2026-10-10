// services/gridstats.js
// GT GridStats (unofficial GT7 data API). Called from an admin's browser with the token saved
// in the admin-only settings. If GridStats doesn't allow browser requests (CORS), every call
// fails with 'gs-blocked' and we'd move this into a small server function instead.
// Metered endpoints allow 10 requests a minute, so callers pace themselves (see PACE_MS).
export const PACE_MS = 6500;
const DEFAULT_BASES = ['https://gt-gridstats.com/api', 'https://gtgridstats.com/api'];
const fail = (code, extra) => { const e = new Error(code); e.code = code; Object.assign(e, extra || {}); throw e; };

export function gridstatsClient({ token, base }) {
  const bases = [...new Set([base, ...DEFAULT_BASES].filter(Boolean).map((b) => b.replace(/\/+$/, '')))];
  let working = null;
  const quota = { limit: null, remaining: null };
  async function call(path) {
    const tryBases = working ? [working] : bases;
    let lastNetwork = null;
    for (const b of tryBases) {
      let res;
      try { res = await fetch(b + path, { headers: { Authorization: 'Bearer ' + token, Accept: 'application/json' } }); }
      catch (e) { lastNetwork = e; continue; }
      quota.limit = res.headers.get('X-Quota-Limit') ?? quota.limit;
      quota.remaining = res.headers.get('X-Quota-Remaining') ?? quota.remaining;
      if (res.status === 401 || res.status === 403) fail('gs-auth');
      if (res.status === 429) fail('gs-quota');
      if (res.status === 404) { if (!working) continue; fail('gs-notfound'); }
      if (!res.ok) fail('gs-http', { status: res.status });
      working = b;
      return res.json();
    }
    fail('gs-blocked', { cause: lastNetwork });
  }
  return {
    quota,
    ping: () => call('/assets/regions'),
    carsPage: (page) => call('/assets/cars?page=' + page),
    racers: (ids) => call('/racers/' + ids.map((x) => encodeURIComponent(x)).join(',')),
  };
}

// Test mode: realistic-looking answers without touching the network.
const SAMPLE = [
  ['Toyota GR Supra Racing Concept \'18', 'Gr.3', 'Toyota'], ['Toyota FT-1 Vision Gran Turismo (Gr.3)', 'Gr.3', 'Toyota'], ['Porsche 911 RSR (991) \'17', 'Gr.3', 'Porsche'],
  ['BMW M6 GT3 Endurance Model \'16', 'Gr.3', 'BMW'], ['Mercedes-AMG GT3 \'20', 'Gr.3', 'Mercedes-AMG'], ['Ferrari 458 Italia GT3 \'13', 'Gr.3', 'Ferrari'],
  ['Ford GT LM Spec II Test Car', 'Gr.3', 'Ford'], ['Lexus RC F GT3 (Emil Frey Racing) \'20', 'Gr.3', 'Lexus'], ['Mazda RX-Vision GT3 Concept', 'Gr.3', 'Mazda'],
  ['Hyundai Genesis Gr.3', 'Gr.3', 'Hyundai'], ['Porsche 911 GT3 Cup (992) \'21', 'N500', 'Porsche'], ['BMW M4 Gr.4', 'Gr.4', 'BMW'],
  ['Mazda Atenza Gr.4', 'Gr.4', 'Mazda'], ['Toyota GR86 Gr.4', 'Gr.4', 'Toyota'], ['Hyundai Elantra N TCR \'19', 'Gr.4', 'Hyundai'],
  ['Honda Civic Type R (FK8) Touring Car', 'Gr.4', 'Honda'], ['Audi TT Cup \'16', 'Gr.4', 'Audi'], ['Porsche 919 Hybrid \'16', 'Gr.1', 'Porsche'],
  ['Toyota TS050 - Hybrid (Toyota Gazoo Racing) \'16', 'Gr.1', 'Toyota'], ['Subaru WRX Gr.B Rally Car', 'Gr.B', 'Subaru'],
];
export function fakeGridstats() {
  const quota = { limit: 1000, remaining: 1000 };
  const pause = () => new Promise((r) => setTimeout(r, 120));
  return {
    quota,
    async ping() { await pause(); return [{ code: 'hu', name: 'Hungary' }]; },
    async carsPage(page) {
      await pause(); quota.remaining--;
      const per = 8, data = SAMPLE.slice((page - 1) * per, page * per).map(([name, cls, maker], i) => ({ id: page * 100 + i, car_code: 1000 + page * 100 + i, name, class: cls, manufacturer: { name: maker } }));
      return { current_page: page, data, next_page_url: page * per < SAMPLE.length ? `x?page=${page + 1}` : null, total: SAMPLE.length };
    },
    async racers(ids) {
      await pause(); quota.remaining--;
      const drs = ['A+', 'A', 'B', 'C'], srs = ['S', 'A', 'B'];
      const known = ids.filter((x, i) => i % 7 !== 6);
      return { status: 'complete', count: known.length, not_found: ids.filter((x) => !known.includes(x)),
        drivers: known.map((id) => { let hsh = 0; for (const c of id) hsh = (hsh * 31 + c.charCodeAt(0)) | 0; hsh = Math.abs(hsh); const pts = 2000 + (hsh % 70000); const dr = pts >= 50000 ? 'A+' : pts >= 30000 ? 'A' : pts >= 10000 ? 'B' : pts >= 4000 ? 'C' : 'D'; return { PSN_ID: id, DR: dr, SR: srs[hsh % 3], country_code: 'HU', stats: { dr_points: pts, total_races: 50 + (hsh % 900), victories: hsh % 120, clean_races: 20 + (hsh % 400) } }; }) };
    },
  };
}
