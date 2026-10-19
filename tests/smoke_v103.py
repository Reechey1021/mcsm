# tests/smoke_v103.py - driver of the round, MGTK medal table (outlined), MGTK titles on profiles,
# "Saját profil".
import json, sys
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
shots = sys.argv[1] if len(sys.argv) > 1 else None
def real(errs): return [e for e in errs if not any(k in e for k in ('fonts.g', 'net::ERR', "Firebase couldn't load", 'docs.google', 'googletagmanager'))]
fails, passes, errs = [], 0, []
def check(c, m):
    global passes
    if c: passes += 1
    else: fails.append(m)
def db(pg, js):
    pg.goto(BASE + 'tests/'); pg.wait_for_timeout(150)
    return pg.evaluate("() => { const k='mcsm:fakecloud:v1'; const db=JSON.parse(localStorage.getItem(k)); const r=(" + js + ")(db); localStorage.setItem(k, JSON.stringify(db)); Object.keys(localStorage).filter((x) => x.startsWith('mcsm:pc:')).forEach((x) => localStorage.removeItem(x)); return r; }")
with sync_playwright() as p:
    b = p.chromium.launch()
    for size, vw in (('m', (390, 844)), ('d', (1440, 900))):
        ctx = b.new_context(viewport={'width': vw[0], 'height': vw[1]}, device_scale_factor=2 if size == 'm' else 1, has_touch=size == 'm')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(BASE + '?fakecloud&fakereset#/'); pg.wait_for_timeout(1500)
        star = db(pg, """(db) => { const A = db.race.mcsm31.rounds['1'].lobbies; const all = [...A.A, ...A.B, ...(A.C || [])]; const drivers = {};
          all.forEach((u, i) => { const before = 110 + (i % 7); const gain = u === all[5] ? 6.4 : (i % 3) - 1; drivers[u] = { e: 1, r: before + gain, q: 100, s: 100, g: 100, n: 6, h: [{ l: 'MCSM25–30', r: before }, { l: 'MCSM31 / 1', r: before + gain }] }; });
          db.content = db.content || {}; db.content.ratings = { version: '3.3', drivers };
          const o = db.accounts['owner@mcsm.test'].uid; db.users[o].gtTeamId = 'MGTK';
          return db.entries.mcsm31[all[5]].snapshot.lastName; }""")
        # 1. driver of the round
        pg.goto(BASE + '?fakecloud&fakeuser=pilota&v=1#/szezonok/mcsm31/fordulo/1'); pg.wait_for_timeout(2800)
        d = pg.inner_text('.dotr') if pg.query_selector('.dotr') else ''
        check(star.upper() in d.upper() and '+6,4' in d, f'{size}: driver of the round with the biggest gain ({d[:80]!r})')
        order = pg.evaluate("(() => { const v = document.querySelector('#view'); const f = v.querySelector('.final-box'), dd = v.querySelector('.dotr'), s = v.querySelector('.seg .seg-lab'); const pos = (e) => e ? e.getBoundingClientRect().top : -1; return [pos(f), pos(dd), pos(s)]; })()")
        check(order[0] < order[1] < order[2], f'{size}: between your round and the lobby tabs ({order})')
        if shots: pg.query_selector('.dotr').screenshot(path=f'{shots}/dotr_{size}.png')
        # 2. hall of fame: third table, outlined trophies
        pg.goto(BASE + '?fakecloud&v=2#/eredmenyek?nezet=dicsosegfal'); pg.wait_for_timeout(3000)
        heads = [x.inner_text() for x in pg.query_selector_all('.hof-tables h2')]
        check(len(heads) == 3 and 'MGTK' in heads[2], f'{size}: three medal tables ({heads})')
        check(len(pg.query_selector_all('.hof-tables > div:nth-child(3) svg.trophy.outline')) >= 3, f'{size}: MGTK table uses outlined trophies')
        cols = pg.evaluate("new Set([...document.querySelectorAll('.hof-tables > div')].map(e => Math.round(e.getBoundingClientRect().left))).size")
        check(cols == (3 if size == 'd' else 1), f'{size}: {3 if size == "d" else 1} column(s) ({cols})')
        if shots: pg.query_selector('.hof-tables').screenshot(path=f'{shots}/hof_{size}.png')
        # 3. my profile: MGTK titles box, outlined
        pg.goto(BASE + '?fakecloud&fakeuser=owner&v=3#/sajat'); pg.wait_for_timeout(2800)
        if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(300)
        v = pg.inner_text('#view')
        check('Saját profil' in v, f'{size}: page is called "Saját profil"')
        check('MGTK címek' in v and pg.query_selector('.medals.outline') is not None and pg.query_selector('.medals.outline svg.trophy.outline') is not None, f'{size}: MGTK titles box, outlined')
        if shots:
            el = pg.query_selector('.medals.outline'); el.screenshot(path=f'{shots}/mgtk_{size}.png') if el else None
        ctx.close()
    b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
