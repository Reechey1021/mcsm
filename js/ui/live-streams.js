// ui/live-streams.js
// "Élő streamek (n)": members live on Twitch right now, as a swipeable row on the home page.
// The admin function asks Twitch (cached 90 s in content/live); the widget hides itself when nobody
// is live. Preview with sample streams: add ?livedemo to the address.
import { h } from '../core/dom.js';
import { icon } from '../core/icons.js';
import { avatar } from './parts.js';
import { t } from '../i18n/index.js';
import { backend } from '../services/backend.js';
import { users as loadUsers, teamMap } from '../core/data.js';
import { onLeave } from '../router.js';
import { fullName } from '../model/profile.js';

const demo = () => { try { return new URLSearchParams(location.search).has('livedemo'); } catch { return false; } };
const svg = (a, b) => 'data:image/svg+xml;utf8,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="440" height="248"><defs><linearGradient id="g" x1="0" x2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="440" height="248" fill="url(#g)"/><path d="M0 200 Q120 150 220 190 T440 170 V248 H0Z" fill="#000" opacity=".35"/></svg>`);

let liveCache = { at: 0, promise: null };
async function fetchLive() {
  if (demo()) {
    const us = (await loadUsers()).filter((u) => u.psn).slice(0, 4);
    return us.map((u, i) => ({ profile: u, uid: u.uid, login: (u.psn || 'demo').toLowerCase(), viewers: [148, 98, 76, 31][i], title: 'MCSM edzés', thumb: svg(['#3c6e91', '#7a5c3c', '#4a7a4f', '#5d6d8a'][i], '#1a2033') }));
  }
  if (liveCache.promise && Date.now() - liveCache.at < 90000) return liveCache.promise;
  const promise = fetchPublishedLive();
  liveCache = { at: Date.now(), promise };
  return promise;
}

async function fetchPublishedLive() {
  const cached = await backend.content.get('live').catch(() => null);
  if (cached && cached.at && Date.now() - cached.at < 120000) return cached.streams || [];
  const ep = await backend.content.get('endpoints').catch(() => null);
  if (!ep || !ep.fn) return (cached && cached.streams) || [];
  try {
    const r = await fetch(ep.fn, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'twitchLive' }) });
    const j = await r.json();
    return Array.isArray(j.streams) ? j.streams : (cached && cached.streams) || [];
  } catch { return (cached && cached.streams) || []; }
}

export function liveStreams() {
  const box = h('section', { class: 'live-box', style: 'display:none' });
  const draw = async () => {
    if (!box.isConnected && box.dataset.drawn) return false;
    box.dataset.drawn = '1';
    const [streams, tm] = await Promise.all([fetchLive(), teamMap().catch(() => ({}))]);
    if (!streams.length) { box.style.display = 'none'; box.replaceChildren(); return true; }
    const track = h('div', { class: 'live-track' }, streams.map((s) => {
      const u = s.profile || { psn: s.login, lastName: s.name || s.login };
      return h('a', { class: 'live-card', href: 'https://twitch.tv/' + s.login, target: '_blank', rel: 'noopener', title: s.title || '' },
        h('div', { class: 'live-thumb', style: `background-image:url("${String(s.thumb).replace(/"/g, '')}")` }, h('span', { class: 'live-badge' }, t('liveNow')), h('span', { class: 'live-viewers' }, icon('eye'), String(s.viewers ?? ''))),
        h('div', { class: 'live-who' }, avatar(u, tm[u.teamId], 'sm'), h('span', { class: 'live-nm' }, h('b', null, fullName(u) || s.name || s.login), h('small', null, u.psn || s.login))));
    }));
    const step = (d) => track.scrollBy({ left: d * track.clientWidth * 0.8, behavior: 'smooth' });
    box.replaceChildren(h('div', { class: 'row-between', style: 'margin-bottom:8px' }, h('h2', { class: 'display live-title' }, h('span', { class: 'live-dot' }), t('liveStreams', { n: streams.length })),
      streams.length > 2 ? h('div', { style: 'display:flex;gap:6px' }, h('button', { class: 'icon-btn', type: 'button', 'aria-label': '‹', onclick: () => step(-1) }, icon('chevL')), h('button', { class: 'icon-btn', type: 'button', 'aria-label': '›', onclick: () => step(1) }, icon('chevR'))) : null), track);
    box.style.display = '';
    return true;
  };
  draw().catch(() => {});
  const tick = () => { if (document.visibilityState === 'visible') draw().catch(() => {}); };
  const timer = setInterval(() => { if (!box.isConnected) { cleanup(); return; } tick(); }, 120000);
  document.addEventListener('visibilitychange', tick);
  const cleanup = () => { clearInterval(timer); document.removeEventListener('visibilitychange', tick); };
  onLeave(cleanup);
  return box;
}
