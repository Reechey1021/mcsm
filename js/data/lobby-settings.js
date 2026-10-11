// data/lobby-settings.js
// GT7 lobby settings per session, for the practice rooms drivers open before a round.
// Defaults are the league's standard settings; the option lists are what GT7's lobby offers
// (weather preset codes other than C02 are approximate until the league sends the full list).
// Labels are kept as the drivers know them from the game.
const range = (a, b) => Array.from({ length: b - a + 1 }, (_, i) => a + i);
const MULT = ['OFF', ...range(1, 10).map((n) => n + 'X'), '15X', '20X', '25X', '30X'];
const DURATIONS = [5, 10, 15, 20, 30, 45, 60, 90, 120].map((m) => `${m} perc + 1 kör Finish Delay`);
const LAPS = [...range(1, 30), 35, 40, 45, 50, 60].map((n) => `${n} kör`);
const STARTS = ['Rolling Start', 'Lámpás állórajt', 'Lámpás állórajt (kiugrás-ellenőrzéssel)', 'Kétsoros repülőrajt'];
const GRIDS = ['Top 8 fordított rajtrács a kvalifikáció alapján', 'Kvalifikáció sorrendje', 'Teljesen fordított rajtrács', 'Véletlenszerű'];
const SLIP = ['OFF', 'Weak', 'Real', 'Strong'];
const TYRES = ['Comfort Hard', 'Comfort Medium', 'Comfort Soft', 'Sports Hard', 'Sports Medium', 'Sports Soft', 'Racing Hard', 'Racing Medium', 'Racing Soft', 'Intermediate', 'Heavy Wet'];
const TYRE_SETS = ['All', 'Racing Hard', 'Racing Medium', 'Racing Soft', 'Racing Hard, Medium', 'Racing Medium, Soft', 'Racing Hard, Soft', 'Racing Hard, Medium, Soft', 'Intermediate, Heavy Wet'];
const FUEL_INIT = ['Default', '100 L / Default', ...[90, 80, 70, 60, 50, 40, 30, 20, 10, 5].map((l) => `${l} L`)];
const REFUEL = ['Nincs tankolás', ...range(1, 10).map((n) => `${n} L/sec`)];
const TIMES = ['Random', 'Dawn', 'Sunrise', 'Early Morning', 'Morning', 'Late Morning', 'Noon', 'Afternoon', 'Late Afternoon', 'Evening', 'Sunset', 'Twilight', 'Night', 'Midnight'];
const WEATHER = ['S01 • Clear', 'S02 • Clear & Hot', 'C01 • Cloudy', 'C02 • Cloudy & Warm', 'C03 • Overcast', 'R01 • Light Rain', 'R02 • Rain', 'R03 • Heavy Rain', 'Random'];
const RATE = ['1X', '2X', '3X', '5X', '10X', '15X', '20X', '30X', '60X'];
const CARDS = ['All Random Cards', 'Fixed', 'Custom'];
const ONOFF = ['ON', 'OFF'];

const f = (k, icon, label, options, def) => ({ k, icon, label, options, def });
export const LOBBY_SESSIONS = ['pq', 'q', 's', 'gp'];
export const LOBBY_FIELDS = {
  pq: [
    f('duration', '⏱️', 'Időtartam', DURATIONS, '30 perc + 1 kör Finish Delay'), f('slipstream', '💨', 'Slipstream', SLIP, 'OFF'),
    f('tyre', '🛞', 'Gumi', TYRES, 'Racing Hard'), f('tyreWear', '🛞', 'Tyre Wear Qualifying', MULT, 'OFF'),
    f('fuel', '⛽', 'Fuel Consumption Qualifying', MULT, 'OFF'), f('fuelInit', '⛽', 'Initial Fuel', FUEL_INIT, 'Default'),
    f('time', '🌤️', 'Preset Weather', TIMES, 'Early Morning'), f('weather', '☀️', '', WEATHER, 'C02 • Cloudy & Warm'),
    f('equal', '‼️', 'Equal Conditions Mode', ONOFF, 'ON'),
  ],
  q: [
    f('duration', '⏱️', 'Időtartam', DURATIONS, '10 perc + 1 kör Finish Delay'), f('tyre', '🛞', 'Gumi', TYRES, 'Racing Hard'),
    f('tyreWear', '🛞', 'Tyre Wear', MULT, '1X'), f('fuel', '⛽', 'Fuel Consumption', MULT, '3X'), f('fuelInit', '⛽', 'Initial Fuel', FUEL_INIT, 'Default'),
  ],
  s: [
    f('laps', '🏁', 'Táv', LAPS, '10 kör'), f('start', '🚦', 'Rajt', STARTS, 'Lámpás állórajt'), f('tyre', '🛞', 'Gumi', TYRES, 'Racing Hard'),
    f('tyreWear', '🛞', 'Tyre Wear', MULT, '1X'), f('fuel', '⛽', 'Fuel Consumption', MULT, '3X'), f('fuelInit', '⛽', 'Initial Fuel', FUEL_INIT, 'Default'),
    f('time', '🌤️', 'Preset Weather', TIMES, 'Early Morning'), f('weather', '☀️', '', WEATHER, 'C02 • Cloudy & Warm'), f('rate', '⚡', 'Time Speed Rate', RATE, '1X'),
  ],
  gp: [
    f('laps', '🏁', 'Táv', LAPS, '30 kör'), f('start', '🚦', 'Rajt', STARTS, 'Rolling Start'), f('grid', '🚦', 'Rajtrács', GRIDS, 'Top 8 fordított rajtrács a kvalifikáció alapján'),
    f('tyreWear', '🛞', 'Tyre Wear', MULT, '3X'), f('usable', '🛞', 'Usable Tyres & Types', TYRE_SETS, 'All'), f('required', '🛞', 'Required Tyres & Types', TYRE_SETS, 'All'),
    f('fuel', '⛽', 'Fuel Consumption', MULT, '3X'), f('refuel', '⛽', 'Refuel Speed', REFUEL, '6 L/sec'), f('fuelInit', '⛽', 'Initial Fuel', FUEL_INIT, '100 L / Default'),
    f('custom', '🌤️', 'Custom Weather', TIMES, 'Sunrise'), f('rate', '⚡', 'Time Speed Rate', RATE, '15X'), f('cards', '☀️', 'Weather Cards', CARDS, 'All Random Cards'),
  ],
};
export function lobbyDefaults() {
  return Object.fromEntries(LOBBY_SESSIONS.map((s) => [s, Object.fromEntries(LOBBY_FIELDS[s].map((x) => [x.k, x.def]))]));
}
// A round's settings with any missing values filled from the defaults.
export function lobbyFor(round) {
  const d = lobbyDefaults(), mine = (round && round.lobby) || {};
  return Object.fromEntries(LOBBY_SESSIONS.map((s) => [s, { ...d[s], ...(mine[s] || {}) }]));
}
export const lobbyLine = (field, value) => `${field.icon} ${field.label ? field.label + ' • ' : ''}${value}`;
