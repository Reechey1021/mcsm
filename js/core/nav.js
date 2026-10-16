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
