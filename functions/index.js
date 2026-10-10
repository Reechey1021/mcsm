// MCSM admin function (Cloud Run functions / Cloud Functions 2nd gen, Node.js 20).
// Deployed once from the Google Cloud console's inline editor; see functions/README.md.
//
// POST JSON { action, ... } with "Authorization: Bearer <Firebase ID token>".
// Only owners (users/{uid}.roles.owner === true) may call it.
//   importUsers  { users: [{ uid, email, displayName }] }  create sign-in accounts for imported
//                profiles, keeping the old IDs so all history lines up (no passwords: drivers
//                set one through the "activate your account" email).
//   gridstats    { path }  GT GridStats request made from the server with the saved token
//                (fallback if GridStats ever refuses browser requests).
//   ping         {}       check the function works and you're an owner.
//   importData   { ops: [{ path: ['users', id], data, merge }] }  the one-off migration: writes
//                the prepared documents directly with admin rights (security rules don't apply).
// Any signed-in member:
//   registerPush   { token }  remember this device and subscribe it to league-wide news.
//   unregisterPush { token }  forget it.
//   push           { id, title, body, base }  deliver a notification the caller just created
//                  (the recipients come from the stored notification, never from the request).
const functions = require('@google-cloud/functions-framework');
const admin = require('firebase-admin');

admin.initializeApp();

const ALLOWED_ORIGINS = ['https://reechey1021.github.io', 'https://mcsm.hu', 'https://www.mcsm.hu', 'http://localhost:8765'];
const TOPIC = 'mcsm-all';

functions.http('mcsmAdmin', async (req, res) => {
  const origin = req.get('origin') || '';
  res.set('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ code: 'fn-method', error: 'POST only' });

  try {
    const token = (req.get('authorization') || '').replace(/^Bearer\s+/i, '');
    if (!token) return res.status(401).json({ code: 'fn-forbidden', error: 'Sign in first' });
    const decoded = await admin.auth().verifyIdToken(token);
    const body = req.body || {};
    const db = admin.firestore();

    if (body.action === 'registerPush' || body.action === 'unregisterPush') {
      const t = String(body.token || '');
      if (!t || t.length > 4096) return res.status(400).json({ code: 'fn-error', error: 'Bad token' });
      const ref = db.doc(`pushTokens/${t.replace(/\//g, '_')}`);
      if (body.action === 'registerPush') {
        await ref.set({ token: t, uid: decoded.uid, at: Date.now() });
        await admin.messaging().subscribeToTopic([t], TOPIC);
      } else {
        await ref.delete();
        await admin.messaging().unsubscribeFromTopic([t], TOPIC).catch(() => {});
      }
      return res.json({ ok: true });
    }

    if (body.action === 'push') {
      const snap = await db.doc(`notifications/${String(body.id || '')}`).get();
      if (!snap.exists) return res.status(404).json({ code: 'fn-error', error: 'No such notification' });
      const n = snap.data();
      if (n.by !== decoded.uid) return res.status(403).json({ code: 'fn-forbidden', error: 'Not your notification' });
      if (n.pushedAt) return res.json({ ok: true, already: true });
      const base = String(body.base || '').startsWith('https://') ? String(body.base) : ALLOWED_ORIGINS[0] + '/mcsm/';
      const link = base.replace(/#.*$/, '') + (n.link || '#/');
      const message = { notification: { title: String(body.title || 'MCSM').slice(0, 80), body: String(body.body || '').slice(0, 240) }, webpush: { fcmOptions: { link }, notification: { icon: base.replace(/#.*$/, '') + 'assets/icon-192.png' } } };
      let sent = 0;
      if (n.kind === 'users') {
        const uids = (n.uids || []).slice(0, 200);
        const tokens = [];
        for (let i = 0; i < uids.length; i += 30) {
          const qs = await db.collection('pushTokens').where('uid', 'in', uids.slice(i, i + 30)).get();
          qs.forEach((d) => tokens.push(d.data().token));
        }
        for (let i = 0; i < tokens.length; i += 500) {
          const r = await admin.messaging().sendEachForMulticast({ ...message, tokens: tokens.slice(i, i + 500) });
          sent += r.successCount;
          r.responses.forEach((x, j) => { if (!x.success && /registration-token-not-registered|invalid-argument/.test((x.error && x.error.code) || '')) db.doc(`pushTokens/${tokens[i + j].replace(/\//g, '_')}`).delete().catch(() => {}); });
        }
      } else {
        await admin.messaging().send({ ...message, topic: TOPIC }); sent = -1;
      }
      await snap.ref.update({ pushedAt: Date.now() });
      return res.json({ ok: true, sent });
    }

    const me = await db.doc(`users/${decoded.uid}`).get();
    const roles = (me.exists && me.data().roles) || {};
    if (roles.owner !== true) return res.status(403).json({ code: 'fn-forbidden', error: 'Owners only' });
    // Large imports arrive as JSON; Cloud Run accepts up to 32 MB per request.

    if (body.action === 'ping') return res.json({ ok: true, project: process.env.GCLOUD_PROJECT || null });

    if (body.action === 'importData') {
      const ALLOWED = ['users', 'psnIds', 'teams', 'gtTeams', 'seasons'];
      const ops = Array.isArray(body.ops) ? body.ops : [];
      for (const o of ops) {
        if (!Array.isArray(o.path) || o.path.length % 2 !== 0 || !ALLOWED.includes(o.path[0]) || o.path.some((x) => typeof x !== 'string' || !x || x.includes('/'))) {
          return res.status(400).json({ code: 'fn-error', error: 'Bad path: ' + JSON.stringify(o.path) });
        }
      }
      let written = 0;
      for (let i = 0; i < ops.length; i += 400) {
        const batch = db.batch();
        ops.slice(i, i + 400).forEach((o) => batch.set(db.doc(o.path.join('/')), JSON.parse(JSON.stringify(o.data || {})), o.merge ? { merge: true } : {}));
        await batch.commit();
        written += Math.min(400, ops.length - i);
      }
      return res.json({ ok: true, written });
    }

    if (body.action === 'importUsers') {
      const users = (body.users || []).filter((u) => u && u.uid && u.email).map((u) => ({
        uid: String(u.uid), email: String(u.email).trim().toLowerCase(), emailVerified: true,
        ...(u.displayName ? { displayName: String(u.displayName).slice(0, 100) } : {}),
      }));
      let successCount = 0; const errors = [];
      for (let i = 0; i < users.length; i += 1000) {
        const chunk = users.slice(i, i + 1000);
        const r = await admin.auth().importUsers(chunk);
        successCount += r.successCount;
        r.errors.forEach((e) => errors.push({ index: i + e.index, uid: chunk[e.index].uid, message: e.error.message }));
      }
      await admin.firestore().collection('audit').add({ action: 'import.users', by: decoded.uid, at: Date.now(), target: 'auth', targetName: 'Fiókok', after: { successCount, failureCount: errors.length }, before: null, reason: null });
      return res.json({ successCount, failureCount: errors.length, errors });
    }

    if (body.action === 'gridstats') {
      const cfg = (await admin.firestore().doc('config/gridstats').get()).data() || {};
      if (!cfg.token) return res.status(400).json({ code: 'gs-auth', error: 'No GridStats token saved' });
      const path = String(body.path || '');
      if (!/^\/(assets|racers)\//.test(path)) return res.status(400).json({ code: 'fn-error', error: 'Path not allowed' });
      const base = (cfg.base || 'https://gt-gridstats.com/api').replace(/\/+$/, '');
      const r = await fetch(base + path, { headers: { Authorization: 'Bearer ' + cfg.token, Accept: 'application/json' } });
      const text = await r.text();
      res.status(r.status).type('application/json').send(text);
      return;
    }

    return res.status(400).json({ code: 'fn-unknown', error: 'Unknown action' });
  } catch (e) {
    console.error(e);
    return res.status(500).json({ code: 'fn-error', error: e.message || String(e) });
  }
});
