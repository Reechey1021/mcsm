// Firestore notifications policy, shared by the real and fake backends.
export const NOTIFICATION_LIMIT = 50;  // 50 league-wide and 50 personal (max 100 before overlap)
export const NOTIFICATION_WINDOW_MS = 60 * 86400000;

export function selectNotifications(all, uid, now = Date.now()) {
  const recent = all.filter((n) => n && (n.at || 0) >= now - NOTIFICATION_WINDOW_MS);
  const sort = (a, b) => (b.at || 0) - (a.at || 0);
  const global = recent.filter((n) => n.kind === 'all' || n.kind === 'season').sort(sort).slice(0, NOTIFICATION_LIMIT);
  const personal = uid ? recent.filter((n) => (n.uids || []).includes(uid)).sort(sort).slice(0, NOTIFICATION_LIMIT) : [];
  const byId = new Map([...global, ...personal].map((n) => [n.id, n]));
  return [...byId.values()].sort(sort);
}
