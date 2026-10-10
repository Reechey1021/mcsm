// services/gt7info.js
// The GT7 car list from GT7 Info (github.com/ddm999/gt7info): open community data built from
// the game's own database, refreshed after game updates, no token and no quota. Served from
// GitHub Pages, so the browser can read it directly.
//
//   cars.csv   ID,ShortName,Maker      (Maker = maker ID)
//   maker.csv  maker IDs -> names       (read by header, so column order doesn't matter)
//   cargrp.csv car IDs -> race group    (optional; updated more slowly, so it only fills gaps)
const BASES = ['https://ddm999.github.io/gt7info/data/db/', 'https://raw.githubusercontent.com/ddm999/gt7info/web-new/_data/db/'];

export function parseCsv(text) {
  const rows = [];
  let row = [], cur = '', q = false;
  const s = String(text || '').replace(/\r/g, '');
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (q) { if (c === '"') { if (s[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n') { row.push(cur); rows.push(row); row = []; cur = ''; }
    else cur += c;
  }
  if (cur || row.length) { row.push(cur); rows.push(row); }
  return rows.filter((r) => r.some((x) => x.trim() !== ''));
}
const col = (header, ...patterns) => header.findIndex((hd) => patterns.some((p) => p.test(hd.trim())));

// Race class from the car's name where the name says it. Road versions stay unclassed.
export function classFromName(name) {
  const n = String(name || '');
  if (/road car/i.test(n)) return '';
  const m = /\bGr\.?\s?([1-4B])\b/i.exec(n);
  if (m) return 'Gr.' + m[1].toUpperCase();
  if (/\bGT3\b(?!\s*RS)(?!\s*\(9\d\d\))/.test(n)) return 'Gr.3';
  return '';
}
export function groupToClass(g) {
  const v = String(g || '').trim().toUpperCase().replace(/^GR\.?\s?/, '');
  return { 1: 'Gr.1', 2: 'Gr.2', 3: 'Gr.3', 4: 'Gr.4', B: 'Gr.B', X: 'Gr.X' }[v] || '';
}

export function buildCatalog(carsCsv, makerCsv, grpCsv) {
  const cars = parseCsv(carsCsv), makers = parseCsv(makerCsv);
  if (cars.length < 2) throw Object.assign(new Error('gt7info-empty'), { code: 'gt7info-empty' });
  const ch = cars[0], ci = col(ch, /^id$/i), cn = col(ch, /short ?name/i, /^name$/i), cm = col(ch, /^maker/i);
  const mh = makers[0] || [], mi = col(mh, /^id$/i), mn = col(mh, /^name$/i, /name/i);
  const makerName = {};
  makers.slice(1).forEach((r) => { if (r[mi]) makerName[r[mi].trim()] = (r[mn] || '').trim(); });
  const groups = {};
  if (grpCsv) {
    const g = parseCsv(grpCsv), gh = g[0] || [];
    const gi = col(gh, /^(car)?id$/i, /^car$/i), gg = col(gh, /gr(ou)?p/i, /class/i, /cat/i);
    if (gi >= 0 && gg >= 0) g.slice(1).forEach((r) => { const c = groupToClass(r[gg]); if (c) groups[(r[gi] || '').trim()] = c; });
  }
  return cars.slice(1).map((r) => {
    const id = (r[ci] || '').trim(), short = (r[cn] || '').trim(), maker = makerName[(r[cm] || '').trim()] || '';
    if (!id || !short) return null;
    return { id: Number(id), name: maker ? `${maker} ${short}` : short, short, maker, cls: classFromName(short) || groups[id] || '' };
  }).filter(Boolean).sort((a, b) => a.name.localeCompare(b.name));
}

async function get(file, optional) {
  for (const base of BASES) {
    try {
      const res = await fetch(base + file, { cache: 'no-store' });
      if (res.ok) return await res.text();
    } catch { /* try the next copy */ }
  }
  if (optional) return '';
  throw Object.assign(new Error('gt7info-network'), { code: 'gt7info-network' });
}
export async function fetchCatalog() {
  const [cars, makers, grp] = await Promise.all([get('cars.csv'), get('maker.csv'), get('cargrp.csv', true)]);
  return buildCatalog(cars, makers, grp);
}

// Test mode: a small built-in sample, parsed exactly like the real files.
const SAMPLE_CARS = `ID,ShortName,Maker
2106,FT-1 VGT,43
2187,FT-1 VGT (Gr.3),43
3352,GR Supra Racing Concept '18,43
3399,GR Supra Race Car '19,43
3367,GR Supra RZ '19,43
3311,911 RSR (991) '17,136
3539,911 GT3 RS (992) '22,136
3600,911 GT3 R (992) '22,136
3218,M6 GT3 Endurance Model '16,6
3245,M4 Gr.4,6
3224,Mercedes-AMG GT3 '16,153
2158,458 Italia GT3 '13,110
3419,RX-VISION GT3 CONCEPT,21
3256,Atenza Gr.4,21
3296,Corvette C7 Gr.3 Road Car,7
2183,Corvette C7 Gr.3,7
3590,ELANTRA N TC '24,16
3313,919 Hybrid '16,136
3232,WRX Gr.B Rally Car,38
3262,86 Gr.4,43`;
const SAMPLE_MAKERS = `ID,Name,Country
6,BMW,de
7,Chevrolet,us
16,Hyundai,kr
21,Mazda,jp
38,Subaru,jp
43,Toyota,jp
110,Ferrari,it
136,Porsche,de
153,Mercedes-AMG,de`;
const SAMPLE_GRP = `ID,Group
3311,3
3313,1
3590,4`;
export async function fakeCatalog() { await new Promise((r) => setTimeout(r, 150)); return buildCatalog(SAMPLE_CARS, SAMPLE_MAKERS, SAMPLE_GRP); }
