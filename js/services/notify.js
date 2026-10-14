// services/notify.js
// In-app notifications: league-wide news (lobbies out, results out, entries open) and personal
// notices (a protest naming you, a decision, a waitlist place). Unread = newer than the
// notifReadAt stamp on your profile. A same-day race reminder is added on the fly.
import { backend } from './backend.js';
import { session, signedIn } from './session.js';
import { emit, on } from '../core/bus.js';
import { store } from '../core/storage.js';
import { seasons as loadSeasons, users as loadUsers } from '../core/data.js';
import { isJudgeProfile } from '../model/protest.js';
import { lobbyOf } from '../model/race.js';
import { hu } from '../i18n/hu.js';
import { deliver } from './push.js';

export const notes = { items: [], unread: 0, loadedAt: 0, error: null };
let rawItems = [];
let watchingUid = null;
let unwatch = null;
let syntheticCache = { key: null, loadedAt: 0, items: [], pending: null };
const budapestDate = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }).format(Date.now());
const sameDay = (a, b) => { const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Budapest' }); return f.format(new Date(a)) === f.format(new Date(b)); };

async function raceToday(uid) {
  const out = [];
  const live = (await loadSeasons()).filter((s) => s.state === 'running' || s.state === 'pq');
  for (const s of live) {
    const today = (s.rounds || []).find((r) => sameDay(r.date, Date.now()) && r.date + 3 * 3600000 > Date.now());
    if (!today) continue;
    const docs = await backend.race.roundsList(s.id, {});
    const doc = docs.find((d) => d.n === today.n);
    const L = doc ? lobbyOf(doc.lobbies, uid) : null;
    if (L) out.push({ id: `today-${s.id}-${today.n}`, type: 'raceToday', params: { s: 'MCSM' + s.no, n: today.n, l: L, time: new Intl.DateTimeFormat('hu-HU', { timeZone: 'Europe/Budapest', hour: '2-digit', minute: '2-digit' }).format(new Date(today.date)) }, link: `#/szezonok/${s.id}/fordulo/${today.n}`, at: today.date - 10 * 3600000, synthetic: true });
  }
  return out;
}

function applyNotes(today = syntheticCache.items) {
  if (!signedIn() || session.user.uid !== watchingUid) return;
  const uid = session.user.uid;
  const seen = (session.profile && session.profile.notifReadAt) || 0;
  const dismissed = new Set(store.get('dismissedToday', []));
  const items = [...today.filter((x) => !dismissed.has(x.id)), ...rawItems.filter((n) => (n.at || 0) >= Date.now() - 60 * 86400000)].sort((a, b) => (b.at || 0) - (a.at || 0));
  notes.items = items;
  notes.unread = items.filter((n) => (n.synthetic ? true : (n.at || 0) > seen) && n.by !== uid).length;
  notes.loadedAt = Date.now();
  emit('notes');
}

// Race-today reminders are synthetic, NOT a reason to re-query all notifications.
// At most once per 10 minutes, per user and Budapest calendar day, on demand / tab focus.
export async function refreshNotes() {
  if (!signedIn()) { notes.items = []; notes.unread = 0; emit('notes'); return; }
  const uid = session.user.uid;
  const key = uid + ':' + budapestDate();
  if (syntheticCache.key !== key) syntheticCache = { key, items: [], loadedAt: 0, pending: null };
  if (!syntheticCache.pending && Date.now() - syntheticCache.loadedAt > 10 * 60000) {
    const request = raceToday(uid).catch((error) => { console.warn('race reminder unavailable', error); return []; });
    syntheticCache.pending = request;
    request.then((items) => {
      if (syntheticCache.key !== key || syntheticCache.pending !== request) return;
      syntheticCache.items = items;
      syntheticCache.loadedAt = Date.now();
      syntheticCache.pending = null;
      if (session.user?.uid === uid) applyNotes();
    });
  }
  applyNotes();
  if (syntheticCache.pending) await syntheticCache.pending;
}

export async function markAllRead() {
  if (!signedIn()) return;
  store.set('dismissedToday', notes.items.filter((n) => n.synthetic).map((n) => n.id));
  try { await backend.users.save(session.user.uid, { notifReadAt: Date.now() }); } catch { /* offline */ }
  notes.unread = 0; emit('notes');
}

// Senders. Failures never block the action that caused them.
const fill = (s, v) => String(s || '').replace(/\{(\w+)\}/g, (m, k) => (k === 'al' && v.l ? (v.l === 'A' ? 'az ' : 'a ') + v.l : v[k] != null ? v[k] : m));
export const pushText = (n) => ({ title: 'MCSM', body: fill(hu['nt_' + n.type], n.params || {}) + (n.params && n.params.title ? ` – ${n.params.title}` : '') });
const send = (n) => backend.notify.add(n).then((id) => { deliver(id, n, pushText(n)); return id; }).catch((e) => console.warn('notify failed', e));
export const notifySeason = (season, type, params, link) => send({ kind: 'season', sid: season.id, type, params: { s: 'MCSM' + season.no, ...params }, link });
export const notifyAll = (season, type, params, link) => send({ kind: 'all', sid: season.id, type, params: { s: 'MCSM' + season.no, ...params }, link });
export function notifyUsers(uids, type, params, link) {
  const list = [...new Set(uids.filter(Boolean))].filter((u) => !session.user || u !== session.user.uid);
  if (!list.length) return Promise.resolve();
  return send({ kind: 'users', uids: list, type, params, link });
}
export async function judgeUids() { return (await loadUsers()).filter(isJudgeProfile).map((u) => u.uid); }
export async function adminUids() { return (await loadUsers()).filter((u) => u.roles && (u.roles.admin || u.roles.owner)).map((u) => u.uid); }

export function initNotes() {
  const changeUser = () => {
    if (!session.ready) return;
    const uid = session.user?.uid || null;
    if (uid === watchingUid) { applyNotes(); return; }
    if (unwatch) { unwatch(); unwatch = null; }
    watchingUid = uid;
    rawItems = [];
    notes.items = []; notes.unread = 0; notes.error = null;
    syntheticCache = { key: null, items: [], loadedAt: 0, pending: null };
    emit('notes');
    if (!uid) return;
    // No repeated 3-minute Firestore queries. Updates are delivered only when matching
    // notifications are added/modified (including when FCM permission is disabled).
    unwatch = backend.notify.watch(uid, (list) => {
      if (watchingUid !== uid) return;
      notes.error = null;
      rawItems = list;
      applyNotes();
    }, (error) => {
      if (watchingUid !== uid) return;
      console.error('MCSM notification listener failed (check indexes and Firestore rules)', error);
      notes.error = error?.code || 'unavailable';
      emit('notes');
      if (unwatch) { unwatch(); unwatch = null; }
    });
    refreshNotes().catch(() => {});
  };
  on('session', changeUser);
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && signedIn()) {
      if (notes.error && !unwatch) { watchingUid = null; changeUser(); }
      else refreshNotes().catch(() => {});
    }
  });
  changeUser();
}
