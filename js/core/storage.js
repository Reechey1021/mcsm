// core/storage.js
// Guarded local/session storage (private browsing and blocked storage must never crash the app).
export const store = {
  get(k, d) { try { const v = localStorage.getItem('mcsm:' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('mcsm:' + k, JSON.stringify(v)); } catch { /* unavailable */ } },
  del(k) { try { localStorage.removeItem('mcsm:' + k); } catch { /* unavailable */ } },
  sget(k) { try { return sessionStorage.getItem('mcsm:' + k); } catch { return null; } },
  sset(k, v) { try { sessionStorage.setItem('mcsm:' + k, v); } catch { /* unavailable */ } },
};
