# tests/smoke_v106.py - Results: Bajnokság / Forduló; screenshot import button inside its box;
# protest numbers (#1, #2, … oldest first; new ones get the next; judges only).
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
        pg.goto(BASE + '?fakecloud&fakereset#/eredmenyek/mcsm31'); pg.wait_for_timeout(2600)
        # 1. Results: championship (cumulative) and a single round
        champ = pg.query_selector_all('.tower .trow b')[1].inner_text() if pg.query_selector('.tower .trow') else ''
        check('forduló után' in pg.inner_text('.tower-rounds'), f'{size}: championship chips by default')
        pg.click('.tower-rounds .seg button:has-text("Forduló")'); pg.wait_for_timeout(1200)
        txt = pg.inner_text('.tower-rounds')
        heads = [x.inner_text() for x in pg.query_selector_all('.tower-head .cols span')]
        totals = pg.evaluate("[...document.querySelectorAll('.tower .trow .pts b')].map(b => +b.textContent.replace(/\\s/g, ''))")
        check('2. forduló' in txt and 'forduló után' not in txt, f'{size}: round chips ({txt!r})')
        check(heads == ['Kv.', 'Sprint', 'GP', 'FL'] and totals == sorted(totals, reverse=True) and totals[0] < 700, f'{size}: ranked by the round points ({totals[:3]})')
        check(not pg.is_visible('.tower-rounds button[aria-label="Visszajátszás"]') and pg.is_visible('.round-link'), f'{size}: no Replay, round details link')
        pg.click('.tower-rounds .seg button:has-text("1. forduló")'); pg.wait_for_timeout(900)
        check('1. forduló' in pg.evaluate("[...document.querySelectorAll('.tower-rounds [aria-pressed=\"true\"]')].map(b => b.innerText).join('|')"), f'{size}: another round')
        pg.click('.tower-rounds .seg button:has-text("Bajnokság")'); pg.wait_for_timeout(1200)
        check('forduló után' in pg.inner_text('.tower-rounds') and pg.is_visible('.tower-rounds button[aria-label="Visszajátszás"]'), f'{size}: back to the championship view')
        check(pg.evaluate('document.documentElement.scrollWidth - innerWidth') <= 0, f'{size}: no sideways overflow')
        # 2. screenshot import: the load button stays inside its box
        pg.goto(BASE + '?fakecloud&fakeuser=owner&v=1#/admin/eredmeny/mcsm31/3/A/GP'); pg.wait_for_timeout(2400)
        pg.set_input_files('.ai-panel input[type=file]', ['/tmp/gt7_1.png']); pg.wait_for_timeout(300)
        pg.click('.ai-panel button:has-text("Beolvasás")'); pg.wait_for_timeout(2500)
        inside = pg.evaluate("(() => { const p = document.querySelector('.ai-panel').getBoundingClientRect(); const b = [...document.querySelectorAll('.ai-panel button')].find(x => /Betöltés/.test(x.textContent)).getBoundingClientRect(); return b.left >= p.left && b.right <= p.right; })()")
        check(inside, f'{size}: load button inside the panel')
        # 3. protest numbers
        pg.goto(BASE + '?fakecloud&fakeuser=owner&v=2#/'); pg.wait_for_timeout(7000)   # admin visit numbers older cases
        if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(300)
        nums = db(pg, "(db) => { const ps = Object.values(db.race.mcsm31.protests).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)); return [ps.map((p) => p.no), (db.counters || {}).protests]; }")
        check(nums[0] == list(range(1, len(nums[0]) + 1)) and nums[1] and nums[1]['backfilled'], f'{size}: older cases numbered oldest first ({nums})')
        pg.goto(BASE + '?fakecloud&fakeuser=owner&v=3#/birosag'); pg.wait_for_timeout(2400)
        check(pg.query_selector('.case-no') is not None and pg.inner_text('.case-no').startswith('#'), f'{size}: judges see case numbers')
        db(pg, "(db) => { const P = db.accounts['pilota@mcsm.test'].uid; const u = db.users[P]; db.entries.mcsm31[P] = { uid: P, type: 'driver', status: 'entered', approved: true, order: 99, snapshot: { firstName: u.firstName, lastName: u.lastName, psn: u.psn, psnLower: u.psnLower, raceNumber: u.raceNumber } }; }")
        pg.goto(BASE + '?fakecloud&fakeuser=pilota&v=4#/szezonok/mcsm31/fordulo/1'); pg.wait_for_timeout(2600)
        check(pg.query_selector('.case-no') is None, f'{size}: drivers see no case numbers')
        before = nums[1]['next']
        pg.goto(BASE + '?fakecloud&fakeuser=pilota&v=5#/szezonok/mcsm31/fordulo/2/ovas'); pg.wait_for_timeout(2400)
        if pg.query_selector('.chip-driver'):
            pg.query_selector_all('.chip-driver')[0].click()
            pg.fill('.form input[maxlength="80"]', 'Teszt ügy számmal')
            pg.fill('.form textarea', 'Leírás a számozott ügyhöz, legalább ennyi szöveggel.')
            pg.click('.btn.primary.block:has-text("Óvás benyújtása")'); pg.wait_for_timeout(2200)
        newest = db(pg, "(db) => { const ps = Object.values(db.race.mcsm31.protests).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0)); return [ps[0].title, ps[0].no, db.counters.protests.next]; }")
        check(newest[0] == 'Teszt ügy számmal' and newest[1] == before + 1 and newest[2] == before + 1, f'{size}: a new protest gets the next number ({newest}, was {before})')
        ctx.close()
    b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
