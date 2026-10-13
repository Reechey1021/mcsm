// data/lobby-settings.js
// GT7 lobby settings for the practice rooms. Per round: General, Qualifying, Sprint, Gran'Prix.
// Per season: Pre-qualifying. Defaults are the league's standard settings. Weather presets and
// Time of Day come from the GTPlanet list of GT7 time/weather settings (availability varies by
// track; all options are offered for every track, as the league asked).
//
// Field types: select (options), mult (OFF, 1X–50X), num (min–max with a unit), multi (several).
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const DURATIONS = [...[1, 2, 3, 5, 10, 15, 20, 25, 30, 40, 50, 60, 90].map((m) => `${m} perc`), ...range(2, 24).map((h) => `${h} óra`)].map((d) => `${d} + 1 kör Finish Delay`);
const LAPS = range(1, 99).map((n) => `${n} kör`);
const STARTS = ['Grid Start', 'Grid Start with False Start Check', 'Rolling Start'];
const GRIDS = ['Top 8 fordított rajtrács a kvalifikáció alapján', 'Kvalifikáció sorrendje', 'Teljesen fordított rajtrács', 'Véletlenszerű'];
const SLIP = ['Off', 'Weak', 'Real', 'Strong'];
const TYRES = ['Comfort Hard', 'Comfort Medium', 'Comfort Soft', 'Sports Hard', 'Sports Medium', 'Sports Soft', 'Racing Hard', 'Racing Medium', 'Racing Soft', 'Intermediate', 'Heavy Wet'];
const TYRE_SETS = ['All', 'Racing Hard', 'Racing Medium', 'Racing Soft', 'Racing Hard, Medium', 'Racing Medium, Soft', 'Racing Hard, Soft', 'Racing Hard, Medium, Soft', 'Intermediate, Heavy Wet'];
export const TIMES = ['Early Dawn', 'Dawn', 'Sunrise', 'Early Morning', 'Late Morning', 'Afternoon', 'Evening', 'Sunset', 'Twilight', 'Night', 'Midnight'];
export const WEATHER = [
  'S01 | Dry, Cloudless and Pleasant', 'S02 | Dry and Pleasant with a Few Clouds', 'S03 | Dry, Cloudy and Pleasant', 'S04 | Dry, Cloudy and Sunny',
  'S05 | Misty, Cloudless and Sunny', 'S06 | Humid, Cloudless and Pleasant', 'S07 | Humid and Pleasant with a Few Clouds', 'S08 | Humid, Sunny and Cloudy',
  'S09 | Humid and Sunny with Lots of Clouds', 'S10 | Misty and Sunny with Lots of Clouds', 'S11 | Sunny with Alpine Mist', 'S12 | Sunny with Lots of Monsoon Clouds',
  'S13 | Sunny with a Few Monsoon Clouds', 'S14 | Sunny with Lots of Monsoon Clouds II (More Cloudy)', 'S15 | Hazy, Cloudless and Pleasant', 'S16 | Hazy and Sunny with a Few Clouds',
  'S17 | Hazy, Cloudy and Sunny', 'S18 | Hazy, Cloudy and Sunny II (More Cloudy)',
  'C01 | Cloudy and Bright', 'C02 | Cloudy and Warm', 'C03 | Cloudy and Dark', 'C04 | Cloudy and Chilly', 'C05 | Cloudy', 'C06 | Thick Clouds',
  'R01 | Light Drizzle', 'R02 | Cloudless with Warm Rain', 'R03 | Light Rain', 'R04 | Cloudy with Rain', 'R05 | Cloudy with Rain II (Blanket Cloud, No Individual Clouds)',
  'R06 | Thick Cloud with Rain', 'R07 | Cloudy with Torrential Rain', 'R08 | Thick Cloud with Torrential Rain',
];
const CARDS = ['All Random Cards', 'Custom'];
const ONOFF = ['ON', 'OFF'];
const LIMIT = ['No Limit', 'Prohibited'];

const sel = (k, icon, label, options, def) => ({ k, type: 'select', icon, label, options, def });
const mult = (k, icon, label, def) => ({ k, type: 'mult', icon, label, min: 0, max: 50, def });
const num = (k, icon, label, min, max, def, fmt) => ({ k, type: 'num', icon, label, min, max, def, fmt });
const fuelFmt = (v) => (v >= 100 ? '100 L / Default' : `${v} L`);

export const ROUND_SESSIONS = ['general', 'q', 's', 'gp'];
export const LOBBY_FIELDS = {
  general: [
    sel('bop', '⚖️', 'BOP / Tuning Prohibited', ONOFF, 'ON'),
    sel('counter', '🛠️', 'Countersteering Assistance', LIMIT, 'No Limit'), sel('asm', '🛠️', 'Active Stability Management (ASM)', LIMIT, 'No Limit'),
    sel('line', '🛠️', 'Driving Line Assistance', LIMIT, 'No Limit'), sel('tcs', '🛠️', 'Traction Control', LIMIT, 'No Limit'),
    sel('abs', '🛠️', 'ABS', LIMIT, 'No Limit'), sel('autodrive', '🛠️', 'Auto-drive', LIMIT, 'Prohibited'),
    sel('settings', '🛠️', 'Settings Options', ['Brake Balance only', 'No Limit', 'Prohibited'], 'Brake Balance only'),
    sel('boost', '🚀', 'Boost', ['OFF', 'Weak', 'Strong'], 'OFF'), sel('slip', '🏎️', 'Slipstream Strength', SLIP, 'Real'),
    sel('visDamage', '🚑', 'Visible Damage', ONOFF, 'ON'), sel('mechDamage', '🚑', 'Mechanical Damage', ['None', 'Light', 'Heavy', 'Championship'], 'Light'),
    sel('grip', '🛞', 'Grip Reduction Off Track', ['Real', 'Low'], 'Real'), sel('category', '🚘', 'Filter by Category', ['No Limit', 'Gr.1', 'Gr.2', 'Gr.3', 'Gr.4', 'Gr.B'], 'Gr.3'),
    sel('year', '🗓️', 'Year', ['No Limit'], 'No Limit'), sel('drivetrain', '🚀', 'Drivetrain', ['Unrestricted', 'FR', 'FF', '4WD', 'MR', 'RR', '---'], 'FF'),
    sel('aspiration', '🚀', 'Aspiration', ['Unrestricted', 'NA', 'TC', 'SC', 'TC + SC', 'EV', '---'], 'TC'),
    sel('shortcut', '📈', 'Shortcut Penalty', ['Off', 'Weak', 'Strong'], 'Weak'), sel('pitPenalty', '📉', 'Pit Lane Penalty', ONOFF, 'ON'),
    sel('flags', '🏴', 'Flag Rules', ONOFF, 'ON'),
  ],
  pq: [
    sel('duration', '⏱️', 'Időtartam', DURATIONS, '30 perc + 1 kör Finish Delay'), sel('slip', '💨', 'Slipstream', SLIP, 'Off'),
    sel('tyre', '🛞', 'Gumi', TYRES, 'Racing Hard'), mult('tyreWear', '🛞', 'Tyre Wear Qualifying', 0), mult('fuel', '⛽', 'Fuel Consumption Qualifying', 0),
    num('fuelInit', '⛽', 'Initial Fuel', 1, 100, 100, (v) => (v >= 100 ? 'Default' : `${v} L`)),
    sel('time', '🌤️', 'Time of Day', TIMES, 'Early Morning'), sel('weather', '☀️', '', WEATHER, 'C02 | Cloudy and Warm'),
    sel('equal', '‼️', 'Equal Conditions Mode', ONOFF, 'ON'),
  ],
  q: [
    sel('duration', '⏱️', 'Időtartam', DURATIONS, '10 perc + 1 kör Finish Delay'), sel('tyre', '🛞', 'Gumi', TYRES, 'Racing Hard'),
    mult('tyreWear', '🛞', 'Tyre Wear', 1), mult('fuel', '⛽', 'Fuel Consumption', 3), num('fuelInit', '⛽', 'Initial Fuel', 1, 100, 100, (v) => (v >= 100 ? 'Default' : `${v} L`)),
  ],
  s: [
    sel('laps', '🏁', 'Táv', LAPS, '10 kör'), sel('start', '🚦', 'Rajt', STARTS, 'Grid Start'), sel('tyre', '🛞', 'Gumi', TYRES, 'Racing Hard'),
    mult('tyreWear', '🛞', 'Tyre Wear', 1), mult('fuel', '⛽', 'Fuel Consumption', 3), num('fuelInit', '⛽', 'Initial Fuel', 1, 100, 100, (v) => (v >= 100 ? 'Default' : `${v} L`)),
    sel('time', '🌤️', 'Time of Day', TIMES, 'Early Morning'), sel('weather', '☀️', '', WEATHER, 'C02 | Cloudy and Warm'),
    num('rate', '⚡', 'Time Speed Rate', 1, 30, 1, (v) => `${v}X`), sel('flags', '🏴', 'Flag Rules', ONOFF, 'OFF'),
  ],
  gp: [
    sel('laps', '🏁', 'Táv', LAPS, '30 kör'), sel('start', '🚦', 'Rajt', STARTS, 'Rolling Start'), sel('grid', '🚦', 'Rajtrács', GRIDS, 'Top 8 fordított rajtrács a kvalifikáció alapján'),
    mult('tyreWear', '🛞', 'Tyre Wear', 3), sel('usable', '🛞', 'Usable Tyres & Types', TYRE_SETS, 'All'), sel('required', '🛞', 'Required Tyres & Types', TYRE_SETS, 'All'),
    mult('fuel', '⛽', 'Fuel Consumption', 3), num('refuel', '⛽', 'Refuel Speed', 1, 20, 6, (v) => `${v} L/sec`), num('fuelInit', '⛽', 'Initial Fuel', 1, 100, 100, fuelFmt),
    sel('custom', '🌤️', 'Custom Weather', TIMES, 'Sunrise'), num('rate', '⚡', 'Time Speed Rate', 1, 30, 15, (v) => `${v}X`),
    sel('cards', '☀️', 'Weather Cards', CARDS, 'All Random Cards'), { k: 'cardList', type: 'multi', icon: '☀️', label: 'Custom Weather Cards', options: WEATHER, def: [], showIf: (v) => v.cards === 'Custom' },
  ],
};

export const multLabel = (v) => (!v ? 'OFF' : `${v}X`);
// Older saved values ("3X", "OFF", "6 L/sec", "Default") are read as numbers where needed.
function normalise(field, v) {
  if (v == null) return field.def;
  if (field.type === 'mult') { if (typeof v === 'number') return v; if (/^off$/i.test(v)) return 0; const n = parseInt(v, 10); return Number.isFinite(n) ? Math.min(50, n) : field.def; }
  if (field.type === 'num') { if (typeof v === 'number') return v; if (/default/i.test(v)) return field.max; const n = parseInt(v, 10); return Number.isFinite(n) ? n : field.def; }
  if (field.type === 'multi') return Array.isArray(v) ? v : field.def;
  if (field.k === 'weather' && typeof v === 'string' && v.includes('•')) return v.replace(/\s*•\s*/, ' | ').replace('Cloudy & Warm', 'Cloudy and Warm');
  if (field.k === 'start' && v === 'Lámpás állórajt') return 'Grid Start';
  return v;
}
const fill = (sk, saved) => Object.fromEntries(LOBBY_FIELDS[sk].map((f) => [f.k, normalise(f, saved ? saved[f.k] : undefined)]));
export const sessionDefaults = (sk) => fill(sk, null);
// A round's settings with any missing values filled from the defaults.
export function lobbyFor(round) { const mine = (round && round.lobby) || {}; return Object.fromEntries(ROUND_SESSIONS.map((s) => [s, fill(s, mine[s])])); }
export const pqLobbyFor = (season) => fill('pq', (season && season.pqLobby) || (season && season.rounds && season.rounds[0] && season.rounds[0].lobby && season.rounds[0].lobby.pq) || null);

export function valueText(field, v) {
  if (field.type === 'mult') return multLabel(v);
  if (field.type === 'num') return field.fmt ? field.fmt(v) : String(v);
  if (field.type === 'multi') return (v || []).map((w) => w.split(' | ')[0]).join(' → ') || '–';
  return String(v);
}
export const lobbyLine = (field, value) => `${field.icon} ${field.label ? field.label + ' • ' : ''}${valueText(field, value)}`;
export const visibleFields = (sk, values) => LOBBY_FIELDS[sk].filter((f) => !f.showIf || f.showIf(values));
