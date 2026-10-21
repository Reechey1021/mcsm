// data/tracks.js
// The round picker takes its locations and layouts from GT GridStats (Admin → GT7 adatok → track refresh),
// grouped by location, so new GT7 tracks appear by themselves. This built-in list is only the fallback
// (before the first refresh) and the country lookup (GridStats has no country codes).
// Admins can also type any track by hand ("Other").
export const TRACKS = [
  ['alsace', 'Alsace', 'FRA', ['Village', 'Test Course']],
  ['maggiore', 'Autodrome Lago Maggiore', 'ITA', ['Full Course', 'Centre', 'East', 'West', 'Full Course Reverse', 'Centre Reverse', 'East Reverse', 'West Reverse']],
  ['interlagos', 'Autódromo de Interlagos', 'BRA', ['']],
  ['autopolis', 'Autopolis International Racing Course', 'JPN', ['Full Course', 'Short Course']],
  ['bluemoon', 'Blue Moon Bay Speedway', 'USA', ['Speedway', 'Infield A', 'Infield B', 'Infield A Reverse', 'Infield B Reverse']],
  ['brands', 'Brands Hatch', 'GBR', ['Grand Prix Circuit', 'Indy Circuit']],
  ['broadbean', 'Broad Bean Raceway', 'JPN', ['', 'Reverse']],
  ['catalunya', 'Circuit de Barcelona-Catalunya', 'ESP', ['Grand Prix Layout', 'National Layout', 'Rallycross Layout']],
  ['sarthe', 'Circuit de la Sarthe', 'FRA', ['', 'No Chicane']],
  ['stcroix', 'Circuit de Sainte-Croix', 'FRA', ['A', 'B', 'C', 'A Reverse', 'B Reverse', 'C Reverse']],
  ['spa', 'Circuit de Spa-Francorchamps', 'BEL', ['', '24h Layout']],
  ['villeneuve', 'Circuit Gilles-Villeneuve', 'CAN', ['']],
  ['daytona', 'Daytona International Speedway', 'USA', ['Road Course', 'Tri-Oval']],
  ['deepforest', 'Deep Forest Raceway', 'SUI', ['', 'Reverse']],
  ['dragon', 'Dragon Trail', 'CRO', ['Seaside', 'Gardens', 'Seaside Reverse', 'Gardens Reverse']],
  ['fuji', 'Fuji International Speedway', 'JPN', ['Full Course', 'Short Course']],
  ['goodwood', 'Goodwood Motor Circuit', 'GBR', ['']],
  ['grandvalley', 'Grand Valley', 'USA', ['Highway 1', 'South', 'Highway 1 Reverse', 'South Reverse']],
  ['highspeed', 'High Speed Ring', 'JPN', ['', 'Reverse']],
  ['kyoto', 'Kyoto Driving Park', 'JPN', ['Yamagiwa', 'Miyabi', 'Yamagiwa+Miyabi', 'Yamagiwa Reverse', 'Yamagiwa+Miyabi Reverse']],
  ['atlanta', 'Michelin Raceway Road Atlanta', 'USA', ['']],
  ['monza', 'Monza', 'ITA', ['', 'No Chicane']],
  ['panorama', 'Mount Panorama', 'AUS', ['']],
  ['northernisle', 'Northern Isle Speedway', 'USA', ['']],
  ['nurburgring', 'Nürburgring', 'GER', ['Nordschleife', 'Grand Prix', '24h']],
  ['redbull', 'Red Bull Ring', 'AUT', ['', 'Short Track']],
  ['sardegna', 'Sardegna – Road Track', 'ITA', ['A', 'B', 'C', 'A Reverse', 'B Reverse', 'C Reverse']],
  ['ssrx', 'Special Stage Route X', null, ['']],
  ['suzuka', 'Suzuka Circuit', 'JPN', ['', 'East Course']],
  ['tokyo', 'Tokyo Expressway', 'JPN', ['Central Outer Loop', 'Central Inner Loop', 'East Outer Loop', 'East Inner Loop', 'South Outer Loop', 'South Inner Loop']],
  ['trial', 'Trial Mountain Circuit', 'USA', ['', 'Reverse']],
  ['tsukuba', 'Tsukuba Circuit', 'JPN', ['']],
  ['watkins', 'Watkins Glen', 'USA', ['Long Course', 'Short Course']],
  ['laguna', 'WeatherTech Raceway Laguna Seca', 'USA', ['']],
  ['willow', 'Willow Springs', 'USA', ['Big Willow', 'Streets of Willow', 'Horse Thief Mile']],
].map(([id, name, cc, layouts]) => ({ id, name, cc, layouts }));

export const trackById = (id) => TRACKS.find((t) => t.id === id) || null;

// Countries for locations GridStats has but this list doesn't (yet).
const EXTRA_CC = { 'sportland sugo': 'JPN', 'sugo': 'JPN' };
const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
export function countryFor(name) {
  const f = fold(name);
  if (!f) return null;
  if (EXTRA_CC[f]) return EXTRA_CC[f];
  const hit = TRACKS.find((t) => fold(t.name) === f) || TRACKS.find((t) => { const g = fold(t.name); return g.includes(f) || f.includes(g); });
  return hit ? hit.cc : null;
}
// GridStats tracks ({ id, name_short, full_name, cc? }) -> locations with their layouts, for the picker.
// "Grand Valley - Highway 1" under "Grand Valley" becomes the layout "Highway 1"; a track with no
// separate layout name gets the default layout ('').
export function buildTrackCatalog(gs) {
  const byLoc = new Map();
  (gs || []).forEach((x) => {
    const loc = String(x.name_short || x.full_name || '').trim();
    if (!loc) return;
    const full = String(x.full_name || loc).trim();
    let layout = full;
    if (fold(full) === fold(loc)) layout = '';
    else if (full.toLowerCase().startsWith(loc.toLowerCase())) layout = full.slice(loc.length).replace(/^\s*[-–—:,]\s*/, '').trim();
    const key = fold(loc).replace(/ /g, '-');
    if (!byLoc.has(key)) byLoc.set(key, { key, name: loc, cc: x.cc || countryFor(loc), layouts: [] });
    const L = byLoc.get(key);
    if (!L.layouts.some((l) => l.name === layout)) L.layouts.push({ name: layout, gsId: x.id });
  });
  return [...byLoc.values()].sort((a, b) => a.name.localeCompare(b.name, 'en'));
}
export const roundTitle = (r) => (r ? [r.track, r.layout].filter(Boolean).join(' – ') : '');
