// data/track-match.js
// Find a round's track in the GT GridStats track list (photo, white map, length, corners).
// Names differ slightly between sources, so we compare words, not exact strings.
const fold = (s) => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
const STOP = new Set(['circuit', 'de', 'the', 'course', 'layout', 'track', 'motor', 'racing', 'international', 'raceway', 'autodrome', 'autodromo', 'and']);
const words = (s) => fold(s).split(/[^a-z0-9+]+/).filter((w) => w && !STOP.has(w));

export function matchTrack(round, catalog) {
  if (!round || !catalog || !catalog.length) return null;
  const want = new Set(words(`${round.track || ''} ${round.layout || ''}`));
  const place = new Set(words(round.track || ''));
  const layoutWords = words(round.layout || '');
  if (!want.size) return null;
  let best = null;
  for (const tr of catalog) {
    const have = new Set(words(tr.full_name || tr.name_short));
    const short = words(tr.name_short || '');
    const inter = [...want].filter((w) => have.has(w)).length;
    const union = new Set([...want, ...have]).size;
    let score = inter / union;
    if (short.length && short.every((w) => place.has(w))) score += 0.25;
    if (layoutWords.length && layoutWords.every((w) => have.has(w))) score += 0.25;
    if (/reverse/.test(fold(round.layout)) !== /reverse/.test(fold(tr.full_name))) score -= 0.15;
    if (!best || score > best.score) best = { score, tr, layoutOk: layoutWords.every((w) => have.has(w)) };
  }
  if (!best || best.score < 0.4) return null;
  const t = best.tr;
  return { photo: t.trackphoto || null, map: best.layoutOk ? t.track_map || null : null, length: t.track_length ?? null, corners: t.corner_count ?? null, name: t.full_name || t.name_short };
}
