// data/track-match.js
// Find a round's track in the GT GridStats track list (photo, white map, length, corners).
// Names differ slightly between sources, so we compare words, not exact strings.
// GridStats gives track_length in miles (Spa 4.35 = 7.0 km), so we convert to km.
const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const STOP = new Set(['circuit', 'de', 'the', 'course', 'layout', 'track', 'motor', 'racing', 'international', 'raceway', 'autodrome', 'autodromo', 'and', 'speedway', 'full']);
const SYN = { gp: ['grand', 'prix'], '24h': ['24', 'h'], nordschleife: ['nordschleife'], tokyo: ['tokyo'] };
const words = (s) => fold(s).replace(/\bgp\b/g, 'grand prix').split(/[^a-z0-9+]+/).filter((w) => w && !STOP.has(w));
export const MI_TO_KM = 1.609344;

export function matchTrack(round, catalog) {
  if (!round || !catalog || !catalog.length) return null;
  if (round.gsId != null) { const exact = catalog.find((tr) => tr.id === round.gsId); if (exact) return exact; }
  const place = words(round.track || '');
  const layoutWords = words(round.layout || '');
  if (!place.length) return null;
  const want = new Set([...place, ...layoutWords]);
  const scored = catalog.map((tr) => {
    const have = new Set(words(tr.full_name || tr.name_short));
    const short = words(tr.name_short || '');
    const placeHit = place.filter((w) => have.has(w)).length / place.length;
    const sameLocation = (short.length && short.every((w) => place.includes(w))) || placeHit >= 0.6;
    const layoutOk = layoutWords.length ? layoutWords.every((w) => have.has(w)) : have.size <= new Set([...place, ...short]).size + 1;
    const extra = [...have].filter((w) => !want.has(w)).length;
    let score = (sameLocation ? 1 : placeHit * 0.6) + (layoutOk ? 1 : 0) - extra * 0.05;
    if (/reverse/.test(fold(round.layout)) !== /reverse/.test(fold(tr.full_name))) score -= 0.4;
    return { tr, score, sameLocation, layoutOk };
  }).filter((x) => x.sameLocation).sort((a, b) => b.score - a.score);
  if (!scored.length) return null;
  const best = scored[0], exact = best.layoutOk ? best : null;
  const photo = (exact && exact.tr.trackphoto) || (scored.find((x) => x.tr.trackphoto) || {}).tr?.trackphoto || null;
  const t = exact ? exact.tr : null;
  return {
    photo, map: t ? t.track_map || null : null,
    lengthKm: t && t.track_length != null ? Math.round(t.track_length * MI_TO_KM * 100) / 100 : null,
    corners: t ? t.corner_count ?? null : null, name: t ? t.full_name : best.tr.name_short,
  };
}
