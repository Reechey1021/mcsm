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
const functions = require('@google-cloud/functions-framework');
const admin = require('firebase-admin');

admin.initializeApp();

const ALLOWED_ORIGINS = ['https://reechey1021.github.io', 'https://mcsm.hu', 'https://www.mcsm.hu', 'http://localhost:8765'];

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
    const me = await admin.firestore().doc(`users/${decoded.uid}`).get();
    const roles = (me.exists && me.data().roles) || {};
    if (roles.owner !== true) return res.status(403).json({ code: 'fn-forbidden', error: 'Owners only' });

    const body = req.body || {};
    if (body.action === 'ping') return res.json({ ok: true, project: process.env.GCLOUD_PROJECT || null });

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
