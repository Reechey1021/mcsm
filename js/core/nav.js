// core/nav.js
// "Back" that returns to wherever you came from. The router stamps every history entry with its
// position in this visit (history.state.mcsmIdx); if there's an in-app page behind this one we go
// back to it, otherwise (opened directly, from a link) we use the page's usual parent.
export const canGoBack = () => !!(history.state && history.state.mcsmIdx > 0);
export function goBack(fallback) {
  if (canGoBack()) { window.__mcsmBack = true; history.back(); return true; }
  if (fallback) location.hash = fallback.startsWith('#') ? fallback : '#' + fallback;
  return false;
}

// Titles of the pages in this visit, by history position (kept for the tab's lifetime).
const KEY = 'mcsm:navTitles';
const read = () => { try { return JSON.parse(sessionStorage.getItem(KEY) || '{}'); } catch { return {}; } };
export function rememberTitle(idx, title) {
  if (idx == null || !title) return;
  const m = read(); m[idx] = title;
  try { sessionStorage.setItem(KEY, JSON.stringify(m)); } catch { /* storage full or blocked */ }
}
// The title of the page a back press would return to, or null.
export function backLabel() {
  if (!canGoBack()) return null;
  return read()[history.state.mcsmIdx - 1] || null;
}
