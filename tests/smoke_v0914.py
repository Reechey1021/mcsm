# tests/smoke_v0914.py - 0.9.14: within-lobby positions for imported seasons, protest complainant,
# not-investigated cases visible to entrants, default lobby per round, admin menu, season summary,
# grid placeholders.
import sys, json
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
def real(errs): return [e for e in errs if not any(k in e for k in ('fonts.g', 'net::ERR', "Firebase couldn't load", 'docs.google', 'googletagmanager'))]
fails, passes, errs = [], 0, []
def check(c, m):
    global passes
    if c: passes += 1
    else: fails.append(m)
def text(pg, sel='#view'):
    try: return pg.inner_text(sel)
    except Exception: return ''
n = [0]
def go(pg, route, who=None, extra='', wait=2400):
    n[0] += 1; pg.goto(BASE + f'?fakecloud&autoconfirm{extra}&v={n[0]}' + (f'&fakeuser={who}' if who else '') + '#' + route); pg.wait_for_timeout(wait)
    if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(300)
def db(pg, js):
    pg.goto(BASE + 'tests/'); pg.wait_for_timeout(150)
    return pg.evaluate("() => { const k='mcsm:fakecloud:v1'; const db=JSON.parse(localStorage.getItem(k)); const r=(" + js + ")(db); localStorage.setItem(k, JSON.stringify(db)); return r; }")
with sync_playwright() as p:
    b = p.chromium.launch()
    for size, vw in (('m', (390, 844)), ('d', (1440, 900))):
        ctx = b.new_context(viewport={'width': vw[0], 'height': vw[1]}, has_touch=size == 'm')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(BASE + '?fakecloud&fakereset&fakeuser=owner#/'); pg.wait_for_timeout(1500)
        # 1. an imported (old-site) round shows the lobby and within-lobby places, not the overall rank
        uid = db(pg, """(db) => { const P = db.accounts['pilota@mcsm.test'].uid; const u = db.users[P]; u.psn = 'MGTK_KhellCsaba'; u.psnLower = 'mgtk_khellcsaba';
          db.race.mcsm30 = db.race.mcsm30 || { rounds: {}, sheets: {}, pq: {}, protests: {}, votes: {}, notes: {}, penalties: {} };
          db.race.mcsm30.rounds['1'] = { n: 1, lobbies: { A: [], B: [], C: [] }, lobbiesPublished: true, resultsState: 'final', legacy: { rows: [{ id: P, pos: 40, points: 103, status: 'OK' }] } };
          db.entries.mcsm30 = db.entries.mcsm30 || {}; db.entries.mcsm30[P] = { uid: P, type: 'driver', status: 'entered', approved: true, order: 1, snapshot: { firstName: u.firstName, lastName: u.lastName, psn: 'MGTK_KhellCsaba', psnLower: 'mgtk_khellcsaba', raceNumber: u.raceNumber } };
          return P; }""")
        go(pg, '/pilotak/mgtk_khellcsaba', 'owner', '', 3000)
        v = text(pg)
        check('P40' not in v and 'P9' in v and 'P7' in v and 'P8' in v, f'{size}: imported round shows within-lobby places (C, P9 / P7 / P8)')
        # 2. complainant picker (no switch); a driver files on another driver's behalf
        go(pg, '/szezonok/mcsm31/fordulo/2/ovas', 'owner')
        opts = [o.inner_text() for o in pg.query_selector_all('.form .f-row:first-child select option')]
        check(any('Bírói vizsgálat' in o for o in opts) and pg.query_selector('.toggle-row:has-text("Hivatalos")') is None, f'{size}: complainant picker with a stewards option for admins, no switch')
        db(pg, """(db) => { const P = db.accounts['pilota@mcsm.test'].uid; const u = db.users[P]; db.entries.mcsm31[P] = { uid: P, type: 'driver', status: 'entered', approved: true, order: 99, snapshot: { firstName: u.firstName, lastName: u.lastName, psn: u.psn, psnLower: u.psnLower, raceNumber: u.raceNumber } }; }""")
        go(pg, '/szezonok/mcsm31/fordulo/2/ovas', 'pilota')
        sel = pg.query_selector('.form .f-row:first-child select')
        if sel:
            popts = [o.inner_text() for o in sel.query_selector_all('option')]
            check(not any('Bírói vizsgálat' in o for o in popts), f'{size}: drivers have no stewards option')
            sel.select_option(index=3); pg.wait_for_timeout(300)
            comp = sel.input_value()
            chips = pg.query_selector_all('.chip-driver')
            if chips: chips[0].click()
            pg.fill('.form input[maxlength="80"]', 'Kilökés a 3-as kanyarban')
            pg.fill('.form textarea', 'A rajt után a 3-as kanyarban hátulról meglökött, emiatt kicsúsztam.')
            pg.click('.form ~ * .btn.primary, .btn.primary.block:has-text("Óvás benyújtása")'); pg.wait_for_timeout(2200)
            stored = db(pg, "(db) => { const ps = Object.values(db.race.mcsm31.protests); const x = ps.sort((a, b) => b.createdAt - a.createdAt)[0]; return [x.by === db.accounts['pilota@mcsm.test'].uid, x.complainant, x.type]; }")
            check(stored[0] and stored[1] == comp and stored[2] == 'driver', f'{size}: filed on behalf of another driver ({stored})')
        else: check(False, f'{size}: complainant picker for drivers')
        # 3. a case closed without investigation shows to every entrant
        db(pg, """(db) => { const P = db.accounts['pilota@mcsm.test'].uid; const u = db.users[P]; db.entries.mcsm31[P] = db.entries.mcsm31[P] || { uid: P, type: 'driver', status: 'entered', approved: true, order: 99, snapshot: { firstName: u.firstName, lastName: u.lastName, psn: u.psn, psnLower: u.psnLower, raceNumber: u.raceNumber } };
          db.race.mcsm31.protests.pni = { id: 'pni', n: 1, L: 'A', S: 'GP', title: 'Nem vizsgált ügy', description: 'x', involved: ['demo-2'], by: 'demo-3', type: 'driver', status: 'notInvestigated', decision: { outcome: 'none', text: 'Nincs elég bizonyíték.' }, createdAt: Date.now() }; }""")
        go(pg, '/szezonok/mcsm31/fordulo/1', 'pilota')
        check('Nem vizsgált ügy' in text(pg), f'{size}: not-investigated case visible to entrants')
        # 4. default lobby: your own lobby on every round
        db(pg, """(db) => { const P = db.accounts['pilota@mcsm.test'].uid; ['1', '2'].forEach((k) => { const L = db.race.mcsm31.rounds[k].lobbies; Object.keys(L).forEach((x) => { L[x] = L[x].filter((u) => u !== P); }); L.B.push(P); }); }""")
        go(pg, '/szezonok/mcsm31/fordulo/1', 'pilota')
        on = lambda: pg.evaluate("(() => { const b = [...document.querySelectorAll('.seg button[aria-pressed=\"true\"], .seg button.on, .seg [aria-checked=\"true\"]')].map(x => x.innerText); return b.join('|'); })()")
        first = on()
        pg.click('.seg button:has-text("A lobby")'); pg.wait_for_timeout(400)
        pg.evaluate("location.hash = '#/szezonok/mcsm31/fordulo/2'"); pg.wait_for_timeout(2200)
        second = on()
        check('B lobby' in first and 'B lobby' in second, f'{size}: opens on your lobby each round ({first} / {second})')
        # 5. admin menu: roles first, developer tools for owners, no token on the GT7 page
        go(pg, '/admin', 'owner')
        items = [x.inner_text().split('\n')[0] for x in pg.query_selector_all('#view .stack > a.round-item')]
        check(items[:2] and 'Szerepkör' in items[0] and 'GT' in items[1], f'{size}: Roles above GT teams ({items[:3]})')
        check('Fejlesztői eszközök' in text(pg), f'{size}: developer tools section for the owner')
        go(pg, '/admin/gt7', 'owner')
        check('GridStats token' not in text(pg) and pg.query_selector('input[type=password]') is None, f'{size}: no token on the GT7 page')
        go(pg, '/admin/beallitasok', 'owner')
        check('GT GridStats' in text(pg), f'{size}: token lives in Connections')
        # 6. season summary: a finished season is read from one saved document
        db(pg, "(db) => { db.seasons.mcsm31.state = 'finished'; }")
        go(pg, '/admin', 'owner')
        pg.click('details.dev-tools summary'); pg.wait_for_timeout(300)
        pg.click('details.dev-tools button:has-text("Újraépítés")'); pg.wait_for_timeout(4000)
        saved = db(pg, "(db) => !!(db.content && db.content['summary-mcsm31'] && db.content['summary-mcsm31'].v >= 1)")
        check(saved, f'{size}: summary saved')
        db(pg, "(db) => { db.race.mcsm31.sheets = {}; }")   # live results gone: visitors must still see them
        pg.evaluate("() => { Object.keys(sessionStorage).filter(k => k.includes('fakeuid')).forEach(k => sessionStorage.removeItem(k)); }")   # sign out
        go(pg, '/szezonok/mcsm31/fordulo/1', None)
        pg.click(".seg button:has-text(\"Gran'Prix\")"); pg.wait_for_timeout(500)
        check(len(pg.query_selector_all('.rtable tbody tr')) >= 10, f'{size}: visitors read the finished season from the summary')
        # 7. placeholders fill the grid columns
        if size == 'd':
            pg.goto(BASE + '?fakecloud&v=99#/pilotak'); pg.wait_for_timeout(60)
            cols = pg.evaluate("(() => { const s = [...document.querySelectorAll('.drv-grid > .skel')]; return new Set(s.map(x => Math.round(x.getBoundingClientRect().left))).size; })()")
            check(cols >= 2 or cols == 0, f'{size}: loading placeholders in columns ({cols})')
        ctx.close()
    b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
