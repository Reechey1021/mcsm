# tests/smoke_v093.py - screenshot import (AI, simulated in test mode) and the news scroll fix.
import sys, json
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
shots = sys.argv[1] if len(sys.argv) > 1 else None
def real(errs): return [e for e in errs if not any(k in e for k in ('fonts.g', 'net::ERR', "Firebase couldn't load"))]
fails, passes, errs = [], 0, []
def check(c, m):
    global passes
    if c: passes += 1
    else: fails.append(m)
def snap(pg, name):
    if shots: pg.screenshot(path=f'{shots}/{name}.png', full_page=True)
def text(pg, sel='#view'):
    try: return pg.inner_text(sel)
    except Exception: return ''
with sync_playwright() as p:
    b = p.chromium.launch()
    for size, vw in (('m', (390, 844)), ('d', (1440, 900))):
        ctx = b.new_context(viewport={'width': vw[0], 'height': vw[1]}, device_scale_factor=2 if size == 'm' else 1, color_scheme='dark', has_touch=size == 'm')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        # results entry: round 3, lobby A, Gran'Prix
        pg.goto(BASE + '?fakecloud&fakereset&fakeuser=owner#/admin/eredmeny/mcsm31/3/A/GP'); pg.wait_for_timeout(2400)
        check('Beolvasás képernyőképből' in text(pg), f'{size}: AI panel on the entry page')
        pg.set_input_files('.ai-panel input[type=file]', ['/tmp/gt7_1.png', '/tmp/gt7_2.png']); pg.wait_for_timeout(400)
        check(len(pg.query_selector_all('.ai-thumb')) == 2, f'{size}: two screenshots picked')
        pg.click('.ai-panel button:has-text("Beolvasás")'); pg.wait_for_timeout(2500)
        v = text(pg, '.ai-panel')
        check('sor kiolvasva' in v and len(pg.query_selector_all('.ai-row')) >= 10, f'{size}: rows read ({len(pg.query_selector_all(".ai-row"))})')
        check(len(pg.query_selector_all('.ai-row.check')) >= 1 and len(pg.query_selector_all('.ai-row.bad')) == 0, f'{size}: unsure row flagged, abbreviated names matched')
        snap(pg, f'v93_review_{size}')
        pg.click('.ai-panel button:has-text("Betöltés a szerkesztőbe")'); pg.wait_for_timeout(1200)
        placed = pg.evaluate("document.querySelectorAll('.entry-wrap .row-card, .entry-wrap input').length")
        check(placed > 10, f'{size}: editor filled ({placed})')
        check('Mentés' in text(pg, '.entry-bar'), f'{size}: still needs Save')
        pg.click('.entry-bar .btn.primary'); pg.wait_for_timeout(1500)
        pg.goto(BASE + 'tests/'); pg.wait_for_timeout(200)
        stored = pg.evaluate("(() => { const db = JSON.parse(localStorage.getItem('mcsm:fakecloud:v1')); const sh = Object.values(db.race.mcsm31.sheets).find(x => x.n === 3 && x.L === 'A' && x.S === 'GP'); return sh ? [sh.state, sh.rows.length, sh.rows[0].time > 0, sh.rows.filter(r => r.status === 'DNF').length] : null; })()")
        check(stored and stored[0] == 'draft' and stored[1] > 10 and stored[2] and stored[3] == 1, f'{size}: saved as a draft with times and the DNF ({stored})')
        # PQ page
        pg.goto(BASE + '?fakecloud&fakeuser=owner&x=1#/admin/pq/mcsm32/pq1'); pg.wait_for_timeout(2400)
        if pg.query_selector('.ai-panel'):
            pg.set_input_files('.ai-panel input[type=file]', ['/tmp/gt7_1.png']); pg.wait_for_timeout(300)
            pg.click('.ai-panel button:has-text("Beolvasás")'); pg.wait_for_timeout(2500)
            pg.click('.ai-panel button:has-text("Betöltés a szerkesztőbe")'); pg.wait_for_timeout(1000)
            check(pg.evaluate("document.querySelector('.entry-bar .prog b').textContent") != '0', f'{size}: PQ times loaded')
        else: check(False, f'{size}: AI panel on the PQ page')
        # news scroll fix: closing with the X restores scrolling
        pg.goto(BASE + '?fakecloud&fakeuser=owner&y=1#/'); pg.wait_for_timeout(1500)
        pg.evaluate("""() => { const k='mcsm:fakecloud:v1'; const db=JSON.parse(localStorage.getItem(k)); db.content = db.content || {}; db.content.news = { items: [{ id: 'n1', title: 'Teszt', body: 'x', carousel: true, at: Date.now() }] }; localStorage.setItem(k, JSON.stringify(db)); sessionStorage.removeItem('mcsm:newsShown'); localStorage.removeItem('mcsm:newsDismissed'); }""")
        pg.goto(BASE + 'tests/'); pg.wait_for_timeout(200)
        for k, how in enumerate(('.nc-head .icon-btn', '.nc-bottom .btn.primary')):
            pg.evaluate("sessionStorage.removeItem('mcsm:newsShown')")
            pg.goto(BASE + f'?fakecloud&fakeuser=pilota&z={k}{size}#/'); pg.wait_for_timeout(2600)
            check(pg.query_selector('.nc-overlay') is not None and pg.evaluate("document.documentElement.style.overflow") == 'hidden', f'{size}: carousel open, page locked')
            pg.click(how); pg.wait_for_timeout(500)
            check(pg.evaluate("document.documentElement.style.overflow") == '', f'{size}: scrolling restored after {how}')
        ctx.close()
    b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
