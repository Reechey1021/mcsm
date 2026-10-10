// model/time.js
// All league times are Budapest wall-clock times, whatever the viewer's device says.
const TZ = 'Europe/Budapest';
const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
function parts(ms) { return Object.fromEntries(fmt.formatToParts(new Date(ms)).map((p) => [p.type, p.value])); }
function offset(ms) { const p = parts(ms); return Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second) - Math.floor(ms / 1000) * 1000; }

export const DAY = 86400000;

// '2026-10-25T19:00' (Budapest) -> epoch ms
export function budapestToMs(local) {
  if (!local) return null;
  const [d, tm = '00:00'] = local.split('T');
  const [y, mo, da] = d.split('-').map(Number), [hh, mi] = tm.split(':').map(Number);
  const guess = Date.UTC(y, mo - 1, da, hh, mi);
  const first = guess - offset(guess);
  return guess - offset(first);
}
// epoch ms -> '2026-10-25T19:00' (Budapest), for <input type="datetime-local">
export function msToBudapestInput(ms) {
  if (ms == null) return '';
  const p = parts(ms);
  return `${p.year}-${p.month}-${p.day}T${p.hour}:${p.minute}`;
}
// Same Budapest calendar day shifted by `days`, at wall time `hhmm`.
export function shiftDay(ms, days, hhmm) {
  const p = parts(ms);
  const base = new Date(Date.UTC(+p.year, +p.month - 1, +p.day + days));
  const iso = base.toISOString().slice(0, 10);
  return budapestToMs(`${iso}T${hhmm}`);
}
