# tests/smoke_v101.py - back buttons return to the previous page; MCSM Rating pills on team cards,
# lobby tabs and results; "Végeredmény" (final) standings for finished seasons.
import json
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
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
        ctx = b.new_context(viewport={'width': vw[0], 'height': vw[1]}, has_touch=size == 'm')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(BASE + '?fakecloud&fakereset#/'); pg.wait_for_timeout(1500)
        db(pg, """(db) => { const ids = Object.keys(db.users); const drivers = {}; ids.forEach((u, i) => { drivers[u] = { e: 1, r: 100 + (i % 9) * 5, q: 100, s: 100, g: 100, n: 6, h: [{ l: 'MCSM25–30', r: 95 }, { l: 'MCSM31 / 1', r: 100 + (i % 9) * 5 }] }; });
          db.content = db.content || {}; db.content.ratings = { version: '3.3', drivers }; db.seasons.mcsm31.state = 'finished'; }""")
        # 1. back from a profile opened from round results returns to the round
        pg.goto(BASE + '?fakecloud&v=1#/szezonok/mcsm31/fordulo/1'); pg.wait_for_timeout(2500)
        pg.click(".seg button:has-text(\"Gran'Prix\")"); pg.wait_for_timeout(500)
        pg.query_selector_all('.rtable tbody tr a[href*="#/pilotak/"]')[0].click(); pg.wait_for_timeout(2200)
        check('#/pilotak/' in pg.url, f'{size}: opened a profile from the results')
        pg.click('a.back-link'); pg.wait_for_timeout(2000)
        check('#/szezonok/mcsm31/fordulo/1' in pg.url, f'{size}: back returns to the round ({pg.url})')
        # opened directly: back goes to the page's usual parent
        pg.goto(BASE + '?fakecloud&v=2#/pilotak/igtsh_saby'); pg.wait_for_timeout(2400)
        pg.click('a.back-link'); pg.wait_for_timeout(1500)
        check(pg.url.endswith('#/pilotak'), f'{size}: opened directly, back goes to the drivers list ({pg.url})')
        # 2. team cards: average as a pill
        pg.goto(BASE + '?fakecloud&v=3#/csapatok'); pg.wait_for_timeout(2400)
        check(pg.query_selector('.team-card .mr-pill') is not None and 'Átlag MCSM' not in pg.inner_text('#view'), f'{size}: MCSM team cards show a pill')
        pg.click('.seg button:has-text("GT csapatok")'); pg.wait_for_timeout(1500)
        check(pg.query_selector('.team-card .mr-pill') is not None, f'{size}: GT team cards show a pill')
        # 3. round page: pills in the lobby tabs, no separate bar
        pg.goto(BASE + '?fakecloud&v=4#/szezonok/mcsm31/fordulo/1'); pg.wait_for_timeout(2600)
        check(len(pg.query_selector_all('.seg .seg-lab .mr-pill:not([style*="none"])')) >= 2 and pg.query_selector('.lobby-avg') is None, f'{size}: lobby tabs carry the average')
        if size == 'm':
            lay = pg.evaluate("(() => { const l = document.querySelector('.seg .seg-lab'); const a = l.children[0].getBoundingClientRect(), b = l.children[1].getBoundingClientRect(); return b.top >= a.bottom - 2; })()")
            check(lay, f'{size}: pill under the name on phones')
        # 4. results: finished season opens on "Végeredmény" without movement arrows; lobby averages shown
        pg.goto(BASE + '?fakecloud&v=5#/eredmenyek/mcsm31'); pg.wait_for_timeout(2600)
        pressed = pg.evaluate("[...document.querySelectorAll('.seg button[aria-pressed=\"true\"]')].map(b => b.innerText).join('|')")
        arrows = len(pg.query_selector_all('.tower .delta.up, .tower .delta.down'))
        check('Végeredmény' in pressed and arrows == 0, f'{size}: final standings by default, no arrows ({pressed}, {arrows})')
        check(len(pg.query_selector_all('.lobby-avgs .mr-pill')) >= 2, f'{size}: lobby averages on Results')
        pg.click('.seg button:has-text("1. forduló után")'); pg.wait_for_timeout(800)
        check('Végeredmény' not in pg.evaluate("[...document.querySelectorAll('.seg button[aria-pressed=\"true\"]')].map(b => b.innerText).join('|')"), f'{size}: rounds still selectable')
        # 5. team pill: sized to its text, neon green, beside the name
        pg.goto(BASE + '?fakecloud&v=6#/csapatok'); pg.wait_for_timeout(2400)
        pill = pg.evaluate("(() => { const p = document.querySelector('.team-card .mr-pill'); if (!p) return null; const cs = getComputedStyle(p); return [Math.round(p.getBoundingClientRect().width), cs.color, cs.display, !!p.closest('b')]; })()")
        check(pill and pill[0] < 80 and pill[2] in ('inline-flex', 'flex') and pill[3] and (lambda c: c[1] > c[0] and c[1] > c[2])([int(x) for x in pill[1][4:-1].split(',')[:3]]), f'{size}: team pill fits its text, beside the name ({pill})')
        # 6. back button says where it goes
        pg.goto(BASE + '?fakecloud&v=7#/eredmenyek/mcsm31'); pg.wait_for_timeout(2600)
        pg.query_selector_all('.tower a.trow[href*="#/pilotak/"]')[0].click(); pg.wait_for_timeout(2200)
        lab = pg.inner_text('a.back-link').strip()
        check(lab == 'Eredmények', f'{size}: back button names where it returns ({lab!r})')
        pg.click('a.back-link'); pg.wait_for_timeout(1800)
        check('#/eredmenyek' in pg.url, f'{size}: and goes there ({pg.url})')
        # 7. imported season: lobby averages for rounds 2 and 3 too (lobbies from the results history)
        names = ["ACTA_Szabi", "Adam18_26", "Dacka007", "F1HL_Atesz", "GTHH_Speede", "GTHL_Beni", "HRT_Robi", "IGTSH_Batman_146", "IGTSH_Buldo", "IGTSH_Dixen", "IGTSH_MARADONA", "IGTSH_Saby", "IGTSH_Smnmr", "IGTSH_Tordinho", "IGTSH_iamDomi", "IGTSH_mozzzsi", "JoMckur", "Libalak", "MGTK_ATESZ", "MGTK_Andor", "MGTK_B3like", "MGTK_Baboca96", "MGTK_Banderas", "MGTK_Bandesz79"]
        db(pg, """(db) => { const names = """ + json.dumps(names) + """; const ids = Object.keys(db.users).slice(0, names.length);
          const s = db.seasons.mcsm30; s.state = 'finished'; s.rounds = [1, 2, 3].map((n) => ({ ...(s.rounds && s.rounds[0] || {}), n, date: Date.now() - (40 - n) * 86400000 }));
          db.race.mcsm30 = { rounds: {}, sheets: {}, pq: {}, protests: {}, votes: {}, notes: {}, penalties: {} };
          [1, 2, 3].forEach((n) => { db.race.mcsm30.rounds[String(n)] = { n, lobbies: { A: [], B: [], C: [] }, lobbiesPublished: true, resultsState: 'final', legacy: { rows: ids.map((id, i) => ({ id, pos: i + 1, points: 500 - i * 10, status: 'OK' })) } }; });
          db.entries.mcsm30 = Object.fromEntries(ids.map((id, i) => [id, { uid: id, type: 'driver', status: 'entered', approved: true, order: i + 1, snapshot: { firstName: 'A', lastName: 'B' + i, psn: names[i], raceNumber: i + 1 } }]));
          delete (db.content || {})['summary-mcsm30']; }""")
        pg.goto(BASE + '?fakecloud&fakeuser=owner&v=8#/eredmenyek/mcsm30'); pg.wait_for_timeout(2800)
        for n in (2, 3):
            pg.click(f'.seg button:has-text("{n}. forduló után")'); pg.wait_for_timeout(900)
            check(len(pg.query_selector_all('.lobby-avgs .mr-pill')) >= 1, f'{size}: lobby averages after round {n}')
        pg.click('.seg button:has-text("Végeredmény")'); pg.wait_for_timeout(900)
        check(len(pg.query_selector_all('.lobby-avgs .mr-pill')) >= 1, f'{size}: lobby averages on Végeredmény')
        ctx.close()
    b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
