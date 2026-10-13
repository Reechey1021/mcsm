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
// Results editors, admins and owners:
//   readResults    { session: 'Q'|'S'|'GP'|'PQ', images: [{ mime, data(base64) }] }  read GT7
//                  result screenshots with Gemini and return the rows as JSON (nothing is saved).
//                  Needs the GEMINI_API_KEY environment variable (free key, see README).
const functions = require('@google-cloud/functions-framework');
const admin = require('firebase-admin');

admin.initializeApp();

const ALLOWED_ORIGINS = ['https://reechey1021.github.io', 'https://mcsm.hu', 'https://www.mcsm.hu', 'http://localhost:8765'];
const TOPIC = 'mcsm-all';
let twitchToken = null;
async function twitchAppToken() {
  if (twitchToken && twitchToken.exp > Date.now() + 60000) return twitchToken.value;
  const id = process.env.TWITCH_CLIENT_ID, secret = process.env.TWITCH_CLIENT_SECRET;
  if (!id || !secret) throw Object.assign(new Error('TWITCH_CLIENT_ID / TWITCH_CLIENT_SECRET not set'), { code: 'twitch-missing' });
  const r = await fetch(`https://id.twitch.tv/oauth2/token?client_id=${encodeURIComponent(id)}&client_secret=${encodeURIComponent(secret)}&grant_type=client_credentials`, { method: 'POST' });
  const j = await r.json();
  if (!r.ok) throw new Error('Twitch token: ' + (j.message || r.status));
  twitchToken = { value: j.access_token, exp: Date.now() + (j.expires_in || 3600) * 1000 };
  return twitchToken.value;
}
async function twitchLive() {
  const db = admin.firestore();
  const ref = db.doc('content/live');
  const cur = (await ref.get()).data() || {};
  if (cur.at && Date.now() - cur.at < 90000) return { at: cur.at, streams: cur.streams || [] };
  let channels = cur.channels;
  if (!channels || !cur.channelsAt || Date.now() - cur.channelsAt > 30 * 60000) {
    const users = await db.collection('users').get();
    channels = {};
    users.forEach((d) => { const m = /twitch\.tv\/([A-Za-z0-9_]{3,25})/i.exec(String(d.data().streamUrl || '')); if (m) channels[m[1].toLowerCase()] = d.id; });
    await ref.set({ channels, channelsAt: Date.now() }, { merge: true });
  }
  const logins = Object.keys(channels);
  const streams = [];
  if (logins.length) {
    const token = await twitchAppToken();
    for (let i = 0; i < logins.length; i += 100) {
      const q = logins.slice(i, i + 100).map((l) => 'user_login=' + encodeURIComponent(l)).join('&');
      const r = await fetch('https://api.twitch.tv/helix/streams?first=100&' + q, { headers: { 'Client-ID': process.env.TWITCH_CLIENT_ID, Authorization: 'Bearer ' + token } });
      const j = await r.json();
      (j.data || []).forEach((s) => streams.push({ uid: channels[String(s.user_login).toLowerCase()] || null, login: s.user_login, name: s.user_name, title: s.title || '', viewers: s.viewer_count || 0, thumb: String(s.thumbnail_url || '').replace('{width}', '440').replace('{height}', '248'), startedAt: s.started_at || null }));
    }
  }
  streams.sort((a, b) => b.viewers - a.viewers);
  const at = Date.now();
  await ref.set({ at, streams }, { merge: true });
  return { at, streams };
}

functions.http('mcsmAdmin', async (req, res) => {
  const origin = req.get('origin') || '';
  res.set('Access-Control-Allow-Origin', ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  res.set('Vary', 'Origin');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ code: 'fn-method', error: 'POST only' });

  try {
    // Public: which members are live on Twitch. Cached in content/live for 90 s, so visitors never
    // hit Twitch directly; the list of channels is re-read from profiles every 30 minutes.
    if ((req.body || {}).action === 'twitchLive') return res.json(await twitchLive());
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

    if (body.action === 'readResults') {
      if (!(roles.owner === true || roles.admin === true || roles.resultsEditor === true)) return res.status(403).json({ code: 'fn-forbidden', error: 'Results editors only' });
      const key = process.env.GEMINI_API_KEY;
      if (!key) return res.status(400).json({ code: 'ai-missing', error: 'GEMINI_API_KEY is not set on the function' });
      const images = (Array.isArray(body.images) ? body.images : []).slice(0, 6).filter((i) => i && /^image\/(jpeg|png|webp)$/.test(i.mime) && typeof i.data === 'string' && i.data.length < 6e6);
      if (!images.length) return res.status(400).json({ code: 'fn-error', error: 'No images' });
      const cfg = (await db.doc('config/ai').get()).data() || {};
      const model = String(cfg.model || process.env.GEMINI_MODEL || 'gemini-flash-lite-latest').replace(/[^a-zA-Z0-9.\-_]/g, '');
      const kind = { Q: 'QUALIFYING (best lap times)', S: 'SPRINT RACE', GP: 'MAIN RACE', PQ: 'PRE-QUALIFYING (best lap times)' }[body.session] || 'RACE';
      const prompt = [
        `You read result screenshots from Gran Turismo 7. Session type: ${kind}.`,
        'The images are consecutive parts of ONE result table (for example positions 1-8 and 9-16). Treat them as one table; if a row appears in two images, include it once.',
        'Return ONLY JSON matching the schema. Rules:',
        '- One entry per driver row, in order of position.',
        '- displayName: copy the name exactly as shown (keep accents, underscores, dots, symbols and capitalisation). Never correct, complete or guess a name.',
        '- bestLap / totalTime / gap: copy exactly as shown (e.g. "1:51.814", "+00.447", "+1 Lap"). Use null if the column is not shown or unreadable. Never invent values.',
        '- totalTime: only the leader\'s total race time if shown. gap: the gap text shown for other drivers.',
        '- status: "finished", or "dnf" (DNF/retired), "dsq" (disqualified), "dns" (did not start), "unknown" if unclear.',
        '- confidence: 0 to 1 for how sure you are about the whole row. warnings: short notes for anything uncertain (obscured name, unclear digit).',
        '- title: the table title text if visible, else null.',
      ].join('\n');
      const schema = { type: 'OBJECT', properties: {
        title: { type: 'STRING', nullable: true },
        results: { type: 'ARRAY', items: { type: 'OBJECT', properties: {
          position: { type: 'INTEGER' }, displayName: { type: 'STRING' }, bestLap: { type: 'STRING', nullable: true }, totalTime: { type: 'STRING', nullable: true },
          gap: { type: 'STRING', nullable: true }, laps: { type: 'INTEGER', nullable: true }, status: { type: 'STRING', enum: ['finished', 'dnf', 'dsq', 'dns', 'unknown'] },
          confidence: { type: 'NUMBER' }, warnings: { type: 'ARRAY', items: { type: 'STRING' } },
        }, required: ['position', 'displayName', 'status', 'confidence'] } },
      }, required: ['results'] };
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }, ...images.map((i) => ({ inline_data: { mime_type: i.mime, data: i.data } }))] }],
          generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema: schema } }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) return res.status(r.status === 429 ? 429 : 502).json({ code: r.status === 429 ? 'ai-quota' : 'ai-error', error: (j.error && j.error.message) || ('Gemini HTTP ' + r.status) });
      const text = (((j.candidates || [])[0] || {}).content || { parts: [] }).parts.map((p) => p.text || '').join('');
      let out; try { out = JSON.parse(text); } catch { return res.status(502).json({ code: 'ai-error', error: 'The model did not return JSON' }); }
      return res.json({ ok: true, model, ...out, usage: j.usageMetadata || null });
    }

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
