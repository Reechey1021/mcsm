// data/gt7-images.js
// Pictures from the drivers' gran-turismo.com profiles (links only, nothing is copied).
export const GT7_DEFAULT_AVATAR = 'https://www.gran-turismo.com/common/dist/gt7/companion/images/0f71c1f701e0aa00014efaf283a12312.png';
// GT7 driver pictures only (own uploads were retired in 0.9.6).
export const avatarUrl = (p) => (p && p.gt7Avatar) || null;

// The console script an admin runs on gran-turismo.com while signed in. It opens each profile
// in a hidden frame, waits for it to render, and reads the cover (background) and driver
// (body) image links. drivers: [{ guid, psn }]
export function profileScript(drivers) {
  const list = JSON.stringify(drivers.map((d) => ({ guid: d.guid, psn: d.psn })));
  return `(async () => {
  const drivers = ${list};
  const DEFAULT = ${JSON.stringify(GT7_DEFAULT_AVATAR.split('/').pop())};
  const region = location.pathname.split('/')[1] || 'gb';
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const frame = document.createElement('iframe');
  frame.style.cssText = 'position:fixed;left:-10000px;top:0;width:1280px;height:900px;';
  document.body.appendChild(frame);
  let win = null;
  const docOf = () => { try { return win ? win.document : frame.contentDocument; } catch (e) { return null; } };
  const grab = (doc) => {
    const r = { cover: null, avatar: null };
    if (!doc || !doc.body) return r;
    for (const el of doc.querySelectorAll('*')) {
      const urls = [el.currentSrc || el.src || '', ((doc.defaultView.getComputedStyle(el).backgroundImage || '').match(/url\\(["']?([^"')]+)/) || [])[1] || ''];
      for (const u of urls) {
        if (!u) continue;
        if (!r.cover && /_cover\\.(jpe?g|png|webp)/i.test(u)) r.cover = u;
        if (!r.avatar && /_body\\.(png|webp|jpe?g)/i.test(u)) r.avatar = u;
        if (!r.avatar && u.endsWith(DEFAULT)) r.avatar = u;
      }
    }
    return r;
  };
  const out = [];
  for (let i = 0; i < drivers.length; i++) {
    const d = drivers[i];
    const url = '/' + region + '/gt7/user/mymenu/' + d.guid + '/profile';
    if (win) win.location.href = url; else frame.src = url;
    let r = { cover: null, avatar: null };
    for (let w = 0; w < 40; w++) {
      await sleep(400);
      r = grab(docOf());
      if (r.avatar && (r.cover || w > 15)) break;
      if (i === 0 && w === 25 && !win && !docOf()?.body?.children.length) { win = window.open(url, 'mcsm_profiles'); if (!win) { console.warn('Engedélyezd a felugró ablakokat ennél az oldalnál, és futtasd újra.'); return; } }
    }
    out.push({ guid: d.guid, psn: d.psn, avatar: r.avatar, cover: r.cover });
    console.log((i + 1) + '/' + drivers.length + '  ' + d.psn + '  ' + (r.avatar ? 'kép ✓' : 'kép –') + '  ' + (r.cover ? 'borító ✓' : 'borító –'));
  }
  frame.remove(); if (win) win.close();
  const json = JSON.stringify(out);
  window.__mcsmProfiles = json;
  try { copy(json); console.log('%cKész! Az eredmény a vágólapon: illeszd be az MCSM oldalon.', 'font-weight:bold;color:green'); }
  catch (e) { console.log('Kész! Másold ki ezt a sort, és illeszd be az MCSM oldalon:'); console.log(json); }
})();`;
}
