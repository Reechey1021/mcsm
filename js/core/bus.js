// core/bus.js
// A minimal event bus so modules can talk without importing each other in circles.
const subs = new Map();
export function on(evt, fn) {
  if (!subs.has(evt)) subs.set(evt, new Set());
  subs.get(evt).add(fn);
  return () => subs.get(evt).delete(fn);
}
export function emit(evt, data) {
  (subs.get(evt) || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });
}
