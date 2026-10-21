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
    tracksPage: (page) => call('/assets/tracks?page=' + page),
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
const svgUrl = (s) => 'data:image/svg+xml;utf8,' + encodeURIComponent(s);
const FAKE_PHOTO = (a, b) => svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" width="800" height="400"><defs><linearGradient id="g" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="800" height="400" fill="url(#g)"/><path d="M0 300 Q200 220 400 280 T800 240 V400 H0Z" fill="#0b1a10" opacity=".55"/></svg>`);
const FAKE_MAP = (d) => svgUrl(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100"><path d="${d}" fill="none" stroke="#000" stroke-width="5" stroke-linejoin="round"/></svg>`);
const FAKE_TRACKS = [
  { id: 1, name_short: 'Grand Valley', full_name: 'Grand Valley - Highway 1', trackphoto: FAKE_PHOTO('#3c6e91', '#c9a26b'), track_map: FAKE_MAP('M10 70 L30 20 L60 25 L90 15 L85 60 L55 85 L20 88 Z'), corner_count: 13, track_length: 5.1 },
  { id: 2, name_short: 'Kyoto Driving Park', full_name: 'Kyoto Driving Park - Yamagiwa', trackphoto: FAKE_PHOTO('#4a7a4f', '#d8c7a0'), track_map: FAKE_MAP('M15 50 C15 10 85 10 85 45 C85 70 60 60 55 85 C40 95 15 85 15 50 Z'), corner_count: 15, track_length: 4.3 },
  { id: 3, name_short: 'Dragon Trail', full_name: 'Dragon Trail - Gardens', trackphoto: FAKE_PHOTO('#7a5c3c', '#5ab0c9'), track_map: FAKE_MAP('M10 20 L80 15 L90 40 L50 50 L85 80 L20 88 Z'), corner_count: 17, track_length: 4.4 },
  { id: 4, name_short: 'Suzuka Circuit', full_name: 'Suzuka Circuit', trackphoto: FAKE_PHOTO('#5d6d8a', '#a3c27a'), track_map: FAKE_MAP('M10 60 C30 20 50 80 70 30 S95 50 80 80 L20 85 Z'), corner_count: 18, track_length: 5.81 },

  { id: 5, name_short: 'Sportland SUGO', full_name: 'Sportland SUGO', trackphoto: FAKE_PHOTO('#3f6b4a', '#b8c9d8'), track_map: FAKE_MAP('M12 60 C20 20 60 15 80 30 S90 75 60 82 L25 85 Z'), corner_count: 11, track_length: 2.26 },
  { id: 6, name_short: 'Grand Valley', full_name: 'Grand Valley - South', trackphoto: FAKE_PHOTO('#3c6e91', '#c9a26b'), track_map: FAKE_MAP('M10 70 L40 30 L80 40 L70 80 Z'), corner_count: 9, track_length: 1.5 },
];
export function fakeGridstats() {
  const quota = { limit: 1000, remaining: 1000 };
  const pause = () => new Promise((r) => setTimeout(r, 120));
  return {
    quota,
    async ping() { await pause(); return [{ code: 'hu', name: 'Hungary' }]; },
    async tracksPage(page) { await pause(); quota.remaining--; return page === 1 ? { current_page: 1, data: FAKE_TRACKS, next_page_url: null, total: FAKE_TRACKS.length } : { data: [] }; },
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
        drivers: known.map((id) => { let hsh = 0; for (const c of id) hsh = (hsh * 31 + c.charCodeAt(0)) | 0; hsh = Math.abs(hsh); const pts = 2000 + (hsh % 70000); const dr = pts >= 50000 ? 'A+' : pts >= 30000 ? 'A' : pts >= 10000 ? 'B' : pts >= 4000 ? 'C' : 'D'; return { PSN_ID: id, Nickname: id.split('_').pop(), GUID: `00000000-0000-4000-8000-${String(hsh).padStart(12, '0').slice(-12)}`, DR: dr, SR: srs[hsh % 3], country_code: 'HU', stats: { dr_points: pts, total_races: 50 + (hsh % 900), victories: hsh % 120, clean_races: 20 + (hsh % 400) } }; }) };
    },
  };
}
