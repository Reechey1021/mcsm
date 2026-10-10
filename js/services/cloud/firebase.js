// services/cloud/firebase.js
// The real backend: email + password sign-in and Firestore, loaded from Google's CDN
// only when a config exists. Same interface as fake.js.
//
// Data layout (see firestore.rules):
//   users/{uid}                 public profile (never the email)
//   users/{uid}/private/account { email } - owner and admins only
//   psnIds/{psnLower}           { uid } - keeps PSN IDs unique
//   teams/{id}, gtTeams/{tag}   team catalogues
//   audit/{id}                  every admin change

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2/';

export async function createFirebaseBackend(config) {
  const [{ initializeApp }, A, F, S] = await Promise.all([
    import(`${SDK}firebase-app.js`),
    import(`${SDK}firebase-auth.js`),
    import(`${SDK}firebase-firestore.js`),
    import(`${SDK}firebase-storage.js`),
  ]);
  const app = initializeApp(config);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  let storage = null;
  const bucket = () => { if (!storage) storage = S.getStorage(app); return storage; };
  const lang = () => document.documentElement.lang || 'hu';
  const toUser = (u) => (u ? { uid: u.uid, email: u.email, emailVerified: u.emailVerified } : null);
  const fail = (code) => { const e = new Error(code); e.code = code; throw e; };
  const userRef = (uid) => F.doc(db, 'users', uid);
  // Firebase doesn't fire onAuthStateChanged after user.reload(), so we tell our own listeners.
  const authSubs = new Set();
  const here = () => ({ url: location.origin + location.pathname, handleCodeInApp: false });
  const wrap = async (fn) => { try { return await fn(); } catch (e) { if (e && e.code === 'permission-denied') fail('permission-denied'); throw e; } };

  return {
    kind: 'firebase',
    app,
    auth: {
      onChange(cb) { authSubs.add(cb); const un = A.onAuthStateChanged(auth, (u) => cb(toUser(u))); return () => { authSubs.delete(cb); un(); }; },
      async signUp(email, password) {
        auth.languageCode = lang();
        const cred = await A.createUserWithEmailAndPassword(auth, email.trim(), password);
        const uid = cred.user.uid, now = Date.now();
        const batch = F.writeBatch(db);
        batch.set(userRef(uid), { createdAt: now, updatedAt: now, lang: lang() });
        batch.set(F.doc(db, 'users', uid, 'private', 'account'), { email: cred.user.email });
        await batch.commit();
        A.sendEmailVerification(cred.user, here()).catch(() => {});
        return toUser(cred.user);
      },
      async signIn(email, password) { return toUser((await A.signInWithEmailAndPassword(auth, email.trim(), password)).user); },
      async signOut() { await A.signOut(auth); },
      async sendReset(email) { auth.languageCode = lang(); await A.sendPasswordResetEmail(auth, email.trim(), here()); },
      async sendVerification() { auth.languageCode = lang(); if (auth.currentUser) await A.sendEmailVerification(auth.currentUser, here()); },
      // Refresh the user and their ID token (the security rules read email_verified from the token),
      // then let the app know.
      async reload() {
        if (!auth.currentUser) return null;
        await auth.currentUser.reload();
        await auth.currentUser.getIdToken(true);
        const u = toUser(auth.currentUser);
        authSubs.forEach((cb) => cb(u));
        return u;
      },
      // Links from Firebase's emails land on our own page (see FIREBASE_SETUP.md, "action URL").
      async applyCode(code) { await A.applyActionCode(auth, code); if (auth.currentUser) await this.reload(); },
      async checkResetCode(code) { return A.verifyPasswordResetCode(auth, code); },
      async confirmReset(code, password) { await A.confirmPasswordReset(auth, code, password); },
      async idToken() { return auth.currentUser ? auth.currentUser.getIdToken() : null; },
      async changePassword(current, next) {
        const u = auth.currentUser; if (!u) fail('permission-denied');
        await A.reauthenticateWithCredential(u, A.EmailAuthProvider.credential(u.email, current));
        await A.updatePassword(u, next);
      },
    },
    users: {
      watch(uid, cb) { return F.onSnapshot(userRef(uid), (s) => cb(s.exists() ? s.data() : null), () => cb(null)); },
      async get(uid) { const s = await F.getDoc(userRef(uid)); return s.exists() ? s.data() : null; },
      async list() { const qs = await F.getDocs(F.collection(db, 'users')); return qs.docs.map((d) => ({ uid: d.id, ...d.data() })); },
      async getPrivate(uid) { return wrap(async () => { const s = await F.getDoc(F.doc(db, 'users', uid, 'private', 'account')); return s.exists() ? s.data() : {}; }); },
      async psnFree(psn, uid) { const s = await F.getDoc(F.doc(db, 'psnIds', String(psn).trim().toLowerCase())); return !s.exists() || s.data().uid === uid; },
      async teammates(teamId, uid) {
        if (!teamId) return [];
        const qs = await F.getDocs(F.query(F.collection(db, 'users'), F.where('teamId', '==', teamId)));
        return qs.docs.filter((d) => d.id !== uid).map((d) => ({ uid: d.id, ...d.data() }));
      },
      async save(uid, patch) {
        return wrap(async () => {
          const ref = userRef(uid);
          const cur = (await F.getDoc(ref)).data() || {};
          const batch = F.writeBatch(db);
          if (patch.psnLower && patch.psnLower !== cur.psnLower) {
            const lockRef = F.doc(db, 'psnIds', patch.psnLower);
            const lock = await F.getDoc(lockRef);
            if (lock.exists() && lock.data().uid !== uid) fail('psn-taken');
            if (!lock.exists()) batch.set(lockRef, { uid });
            if (cur.psnLower) batch.delete(F.doc(db, 'psnIds', cur.psnLower));
          }
          batch.set(ref, { ...patch, updatedAt: Date.now() }, { merge: true });
          await batch.commit();
        });
      },
    },
    teams: {
      async list() { const qs = await F.getDocs(F.collection(db, 'teams')); return qs.docs.map((d) => ({ id: d.id, ...d.data() })); },
      async save(team) {
        return wrap(async () => {
          const ref = team.id ? F.doc(db, 'teams', team.id) : F.doc(F.collection(db, 'teams'));
          const { id, ...data } = team;
          await F.setDoc(ref, { ...data, updatedAt: Date.now(), ...(team.id ? {} : { createdAt: Date.now() }) }, { merge: true });
          return ref.id;
        });
      },
      async remove(id) { return wrap(() => F.deleteDoc(F.doc(db, 'teams', id))); },
    },
    gtTeams: {
      async list() { const qs = await F.getDocs(F.collection(db, 'gtTeams')); return qs.docs.map((d) => ({ id: d.id, ...d.data() })); },
      async save(tm) { return wrap(async () => { const id = tm.tag.trim().toUpperCase(); await F.setDoc(F.doc(db, 'gtTeams', id), { tag: id, name: tm.name.trim() }); return id; }); },
      async remove(id) { return wrap(() => F.deleteDoc(F.doc(db, 'gtTeams', id))); },
    },
    seasons: {
      // Drivers can't read drafts, so their query must exclude them for the rules to allow it.
      async list({ all = false } = {}) {
        const col = F.collection(db, 'seasons');
        const qs = await F.getDocs(all ? col : F.query(col, F.where('state', '!=', 'draft')));
        return qs.docs.map((d) => ({ id: d.id, ...d.data() }));
      },
      async get(id) { try { const s = await F.getDoc(F.doc(db, 'seasons', id)); return s.exists() ? { id: s.id, ...s.data() } : null; } catch (e) { if (e.code === 'permission-denied') return null; throw e; } },
      async save(season) { return wrap(async () => { const { id, ...data } = season; await F.setDoc(F.doc(db, 'seasons', id), { ...data, updatedAt: Date.now(), createdAt: data.createdAt || Date.now() }); return id; }); },
      async patch(id, data) { return wrap(() => F.updateDoc(F.doc(db, 'seasons', id), { ...data, updatedAt: Date.now() })); },
      async remove(id) { return wrap(() => F.deleteDoc(F.doc(db, 'seasons', id))); },
    },
    entries: {
      async list(sid) { const qs = await F.getDocs(F.collection(db, 'seasons', sid, 'entries')); return qs.docs.map((d) => d.data()); },
      async get(sid, uid) { const s = await F.getDoc(F.doc(db, 'seasons', sid, 'entries', uid)); return s.exists() ? s.data() : null; },
      async save(sid, uid, data) {
        return wrap(async () => {
          const ref = F.doc(db, 'seasons', sid, 'entries', uid);
          const cur = await F.getDoc(ref);
          await F.setDoc(ref, { ...data, uid, updatedAt: Date.now(), ...(cur.exists() ? {} : { createdAt: data.createdAt || Date.now() }) }, { merge: true });
        });
      },
      async remove(sid, uid) { return wrap(() => F.deleteDoc(F.doc(db, 'seasons', sid, 'entries', uid))); },
    },
    race: {
      async pqList(sid) { const qs = await F.getDocs(F.collection(db, 'seasons', sid, 'pq')); return qs.docs.map((d) => ({ id: d.id, ...d.data() })); },
      async pqSave(sid, pqId, times) { return wrap(() => F.setDoc(F.doc(db, 'seasons', sid, 'pq', pqId), { times, updatedAt: Date.now() })); },
      async roundsList(sid, { staff = false } = {}) {
        const col = F.collection(db, 'seasons', sid, 'rounds');
        const qs = await F.getDocs(staff ? col : F.query(col, F.where('lobbiesPublished', '==', true)));
        return qs.docs.map((d) => ({ n: Number(d.id), ...d.data() }));
      },
      async roundSave(sid, n, data) { return wrap(() => F.setDoc(F.doc(db, 'seasons', sid, 'rounds', String(n)), { ...data, n, updatedAt: Date.now() }, { merge: true })); },
      async sheetsList(sid, { staff = false } = {}) {
        const col = F.collection(db, 'seasons', sid, 'sheets');
        const qs = await F.getDocs(staff ? col : F.query(col, F.where('state', '==', 'published')));
        return qs.docs.map((d) => ({ id: d.id, ...d.data() }));
      },
      async sheetSave(sid, id, data) { return wrap(() => F.setDoc(F.doc(db, 'seasons', sid, 'sheets', id), { ...data, updatedAt: Date.now(), by: auth.currentUser.uid }, { merge: true })); },
    },
    protests: {
      async list(sid, { judge = false, uid = null } = {}) {
        const col = F.collection(db, 'seasons', sid, 'protests');
        if (judge) { const qs = await F.getDocs(col); return qs.docs.map((d) => ({ id: d.id, ...d.data() })); }
        const qs = [F.query(col, F.where('status', '==', 'published'))];
        if (uid) qs.push(F.query(col, F.where('by', '==', uid)), F.query(col, F.where('involved', 'array-contains', uid)));
        const res = await Promise.all(qs.map((q) => F.getDocs(q)));
        const m = new Map(); res.forEach((r) => r.docs.forEach((d) => m.set(d.id, { id: d.id, ...d.data() })));
        return [...m.values()];
      },
      async save(sid, id, data) {
        return wrap(async () => {
          if (id) { await F.updateDoc(F.doc(db, 'seasons', sid, 'protests', id), { ...data, updatedAt: Date.now() }); return id; }
          const ref = F.doc(F.collection(db, 'seasons', sid, 'protests'));
          await F.setDoc(ref, { ...data, createdAt: Date.now() }); return ref.id;
        });
      },
    },
    votes: {
      async list(sid, pid) { return wrap(async () => (await F.getDocs(F.collection(db, 'seasons', sid, 'protests', pid, 'votes'))).docs.map((d) => ({ uid: d.id, ...d.data() }))); },
      async save(sid, pid, vote) { return wrap(() => F.setDoc(F.doc(db, 'seasons', sid, 'protests', pid, 'votes', auth.currentUser.uid), { ...vote, at: Date.now() })); },
    },
    notes: {
      async list(sid, pid) { return wrap(async () => (await F.getDocs(F.query(F.collection(db, 'seasons', sid, 'protests', pid, 'notes'), F.orderBy('at')))).docs.map((d) => ({ id: d.id, ...d.data() }))); },
      async add(sid, pid, text) { return wrap(() => F.addDoc(F.collection(db, 'seasons', sid, 'protests', pid, 'notes'), { by: auth.currentUser.uid, text, at: Date.now() })); },
    },
    penalties: {
      async list(sid) { const qs = await F.getDocs(F.collection(db, 'seasons', sid, 'penalties')); return qs.docs.map((d) => ({ id: d.id, ...d.data() })); },
      async save(sid, pen) { return wrap(async () => { const ref = pen.id ? F.doc(db, 'seasons', sid, 'penalties', pen.id) : F.doc(F.collection(db, 'seasons', sid, 'penalties')); const { id, ...data } = pen; await F.setDoc(ref, { ...data, at: Date.now() }); return ref.id; }); },
      async remove(sid, id) { return wrap(() => F.deleteDoc(F.doc(db, 'seasons', sid, 'penalties', id))); },
    },
    picks: {
      async list(sid, { teamId = null, admin = false } = {}) {
        const col = F.collection(db, 'seasons', sid, 'picks');
        const qs = admin ? [col] : [F.query(col, F.where('lockAt', '<=', Date.now() - 5 * 60000)), ...(teamId ? [F.query(col, F.where('teamId', '==', teamId))] : [])];
        const res = await Promise.all(qs.map((q) => F.getDocs(q)));
        const m = new Map(); res.forEach((r) => r.docs.forEach((d) => m.set(d.id, d.data())));
        return [...m.values()];
      },
      async save(sid, n, teamId, car) {
        return wrap(async () => {
          const season = (await F.getDoc(F.doc(db, 'seasons', sid))).data();
          const round = season.rounds.find((r) => r.n === n);
          await F.setDoc(F.doc(db, 'seasons', sid, 'picks', `${n}_${teamId}`), { n, teamId, car, lockAt: round.date, by: auth.currentUser.uid, at: Date.now() });
        });
      },
    },
    content: {
      async get(id) { const d = await F.getDoc(F.doc(db, 'content', id)); return d.exists() ? d.data() : null; },
      async save(id, data) { return wrap(() => F.setDoc(F.doc(db, 'content', id), { ...data, updatedAt: Date.now(), by: auth.currentUser.uid })); },
    },
    config: {
      async get(id) { return wrap(async () => { const d = await F.getDoc(F.doc(db, 'config', id)); return d.exists() ? d.data() : null; }); },
      async save(id, data) { return wrap(() => F.setDoc(F.doc(db, 'config', id), data)); },
    },
    notify: {
      async list(uid) {
        const col = F.collection(db, 'notifications');
        const qs = [F.query(col, F.where('kind', 'in', ['all', 'season']))];
        if (uid) qs.push(F.query(col, F.where('uids', 'array-contains', uid)));
        const res = await Promise.all(qs.map((q) => F.getDocs(q)));
        const m = new Map(); res.forEach((r) => r.docs.forEach((d) => m.set(d.id, { id: d.id, ...d.data() })));
        return [...m.values()];
      },
      async add(n) { return wrap(async () => (await F.addDoc(F.collection(db, 'notifications'), { ...n, by: auth.currentUser.uid, at: Date.now() })).id); },
    },
    audit: {
      async add(entry) { await F.addDoc(F.collection(db, 'audit'), { ...entry, by: auth.currentUser.uid, at: Date.now() }); },
      async list(n = 100) {
        return wrap(async () => {
          const qs = await F.getDocs(F.query(F.collection(db, 'audit'), F.orderBy('at', 'desc'), F.limit(n)));
          return qs.docs.map((d) => ({ id: d.id, ...d.data() }));
        });
      },
    },
    admin: {
      // ops: [{ path: ['users', id], data, merge }], written in batches of 400.
      async writeMany(ops, onProgress) {
        return wrap(async () => {
          for (let i = 0; i < ops.length; i += 400) {
            const b = F.writeBatch(db);
            ops.slice(i, i + 400).forEach((o) => b.set(F.doc(db, ...o.path), o.data, o.merge ? { merge: true } : {}));
            await b.commit();
            if (onProgress) onProgress(Math.min(ops.length, i + 400), ops.length);
          }
        });
      },
      // The MCSM admin Cloud Function (functions/README.md). Its address lives in config/functions.
      async call(action, payload) {
        const cfg = await this.functionsConfig();
        if (!cfg || !cfg.url) fail('fn-missing');
        const token = await auth.currentUser.getIdToken();
        let res;
        try { res = await fetch(cfg.url, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token }, body: JSON.stringify({ action, ...payload }) }); }
        catch { fail('fn-network'); }
        const body = await res.json().catch(() => ({}));
        if (!res.ok) { const e = new Error(body.error || 'fn-error'); e.code = body.code || 'fn-error'; e.status = res.status; throw e; }
        return body;
      },
      async functionsConfig() { try { const d = await F.getDoc(F.doc(db, 'config', 'functions')); return d.exists() ? d.data() : null; } catch { return null; } },
    },
    storage: {
      async upload(path, blob) { const r = S.ref(bucket(), path); await S.uploadBytes(r, blob, { contentType: blob.type, cacheControl: 'public,max-age=31536000' }); return S.getDownloadURL(r); },
      async remove(path) { try { await S.deleteObject(S.ref(bucket(), path)); } catch { /* already gone */ } },
    },
    dev: null,
  };
}
