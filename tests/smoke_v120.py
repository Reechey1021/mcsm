# tests/smoke_v120.py - v1.2: season finale card (previews, fit), pull to refresh (installed app),
# "what's changed" device cache, compare rating history, offline screen, hall of fame on phones, app badge.
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
def track(pg): pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
with sync_playwright() as p:
    b = p.chromium.launch()
    # 1. season finale: every variant, recap -> "Tovább" -> season card, fits small phones
    for vw in ((360, 640), (1440, 900)):
        for sc, words in (('champion', ['BAJNOK', 'Megnyerted']), ('silver', ['Ezüstérem', '2. helyen']), ('bronze', ['Bronzérem', '3. helyen']), ('final', ['P12', '12. helyen'])):
            pg = b.new_page(viewport={'width': vw[0], 'height': vw[1]}); track(pg)
            pg.goto(BASE + f'?fakecloud&resultsdemo={sc}#/'); pg.wait_for_timeout(3400)
            check(pg.inner_text('.rr-actions .btn.primary') == 'Tovább', f'{vw} {sc}: recap button says Tovább')
            pg.click('.rr-actions .btn.primary'); pg.wait_for_timeout(2600)
            txt = pg.inner_text('.fn-card') if pg.query_selector('.fn-card') else ''
            check(all(w.upper() in txt.upper() for w in words) and 'PONTOK' in txt.upper(), f'{vw} {sc}: season card ({txt[:50]!r})')
            check(pg.evaluate("(() => { const c = document.querySelector('.fn-card'); return c && c.scrollHeight <= c.clientHeight + 1; })()"), f'{vw} {sc}: fits without scrolling')
            if sc == 'champion': check(pg.query_selector('.fn-burst') is not None and pg.query_selector('.fn-title.metal.m0') is not None, f'{vw}: gold burst and shine for the champion')
            pg.click('.fn-card .rr-actions .btn:not(.primary)'); pg.wait_for_timeout(500)
            check(pg.query_selector('.rr-overlay') is None, f'{vw} {sc}: closes')
            pg.close()
    # 2. pull to refresh, installed app only
    for installed in (True, False):
        ctx = b.new_context(viewport={'width': 390, 'height': 844}, has_touch=True, is_mobile=True)
        if installed: ctx.add_init_script("Object.defineProperty(navigator, 'standalone', { value: true, configurable: true });")
        pg = ctx.new_page(); track(pg); cdp = ctx.new_cdp_session(pg)
        pg.goto(BASE + '?fakecloud&fakereset#/pilotak'); pg.wait_for_timeout(2400)
        if not installed:
            check(pg.query_selector('.ptr') is None, 'browser: no pull to refresh'); ctx.close(); continue
        pg.evaluate("(() => { window.__r = 0; import('/js/core/bus.js').then(m => m.on('rerender', () => { window.__r++; })); })()"); pg.wait_for_timeout(200)
        def drag(y1):
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchStart', 'touchPoints': [{'x': 200, 'y': 150}]})
            for i in range(1, 13): cdp.send('Input.dispatchTouchEvent', {'type': 'touchMove', 'touchPoints': [{'x': 200, 'y': 150 + (y1 - 150) * i / 12}]})
            cdp.send('Input.dispatchTouchEvent', {'type': 'touchEnd', 'touchPoints': []})
        drag(230); pg.wait_for_timeout(500)
        check(pg.evaluate('window.__r') == 0, 'app: a short pull does not refresh')
        drag(380); pg.wait_for_timeout(1400)
        check(pg.evaluate('window.__r') == 1, 'app: a full pull refreshes once')
        ctx.close()
    # 3. "what's changed": kept on the device, re-read only after an admin change
    pg = b.new_page(viewport={'width': 1280, 'height': 900}); track(pg)
    pg.goto(BASE + '?fakecloud&fakereset&fakeuser=owner#/'); pg.wait_for_timeout(3500)   # admin visit creates the versions document
    check(sorted(db(pg, "(db) => Object.keys((db.content || {}).versions || {})")) == ['news', 'ratings', 'seasons', 'teams'], 'admin visit creates the versions document')
    pg.evaluate("() => Object.keys(sessionStorage).filter(k => k.includes('fakeuid')).forEach(k => sessionStorage.removeItem(k))")
    pg.goto(BASE + '?fakecloud&v=1#/csapatok'); pg.wait_for_timeout(2200)
    first = pg.inner_text('.team-grid .team-card b')
    # edit behind the app's back WITHOUT clearing this device's copy (that is what this check is about)
    pg.goto(BASE + 'tests/'); pg.wait_for_timeout(150)
    tid = pg.evaluate("(first) => { const k = 'mcsm:fakecloud:v1'; const db = JSON.parse(localStorage.getItem(k)); const t = Object.values(db.teams).find(x => x.name === first); t.name = 'ZZZ'; localStorage.setItem(k, JSON.stringify(db)); return t.id; }", first)
    pg.goto(BASE + '?fakecloud&v=2#/csapatok'); pg.wait_for_timeout(2200)
    check('ZZZ' not in pg.inner_text('#view'), 'unchanged version: served from the device (no re-read)')
    pg.goto(BASE + '?fakecloud&fakeuser=owner&v=3#/'); pg.wait_for_timeout(1500)
    pg.evaluate("async (tid) => { const be = await import('/js/services/backend.js'); const t = (await be.backend.teams.list()).find(x => x.id === tid); await be.backend.teams.save({ ...t, name: 'ZZZ' }); }", tid); pg.wait_for_timeout(800)
    pg.evaluate("() => Object.keys(sessionStorage).filter(k => k.includes('fakeuid')).forEach(k => sessionStorage.removeItem(k))")
    pg.goto(BASE + '?fakecloud&v=4#/csapatok'); pg.wait_for_timeout(2200)
    check('ZZZ' in pg.inner_text('#view'), 'after an admin change: fresh straight away')
    pg.close()
    # 4. compare rating history, 5. offline screen, 6. hall of fame on phones, 7. app badge
    ctx = b.new_context(viewport={'width': 390, 'height': 844}); pg = ctx.new_page(); track(pg)
    pg.goto(BASE + '?fakecloud&fakereset#/'); pg.wait_for_timeout(1000)
    db(pg, """(db) => { const L = ['MCSM25–30','MCSM31 / 1','MCSM31 / 2','MCSM31 / 3']; const drivers = {}; Object.keys(db.users).forEach((uid, i) => { drivers[uid] = { e: 1, r: 120 + i, q: 1, s: 1, g: 1, n: 9, h: L.map((l, j) => ({ l, r: 110 + i + j })) }; }); db.content = db.content || {}; db.content.ratings = { version: '3.3', drivers }; }""")
    pg.goto(BASE + '?fakecloud&v=5#/osszevetes/igtsh_saby/mgtk_dudu'); pg.wait_for_timeout(2600)
    check(pg.query_selector('.cmp-hist polyline:not([stroke-dasharray])') is not None and pg.query_selector('.cmp-hist polyline[stroke-dasharray]') is not None, 'compare: solid and dashed rating lines')
    ctx.set_offline(True); pg.wait_for_timeout(500)
    check(pg.query_selector('.offline-ov') is not None, 'offline screen when the connection drops')
    ctx.set_offline(False); pg.wait_for_timeout(800)
    check(pg.query_selector('.offline-ov') is None, 'gone when back online')
    pg.goto(BASE + '?fakecloud&v=6#/eredmenyek?nezet=dicsosegfal'); pg.wait_for_timeout(2800)
    col = pg.evaluate("(() => { const k = [...document.querySelector('.hof-cols').children].map(x => x.getBoundingClientRect()); return k[1].top >= k[0].bottom; })()")
    check(col, 'hall of fame: teams under the drivers on phones')
    ctx.close()
    ctx = b.new_context(viewport={'width': 390, 'height': 844}); ctx.add_init_script("window.__badge = []; navigator.setAppBadge = (n) => { window.__badge.push(n); return Promise.resolve(); }; navigator.clearAppBadge = () => { window.__badge.push(0); return Promise.resolve(); };")
    pg = ctx.new_page(); track(pg)
    pg.goto(BASE + '?fakecloud&fakereset&fakeuser=pilota#/'); pg.wait_for_timeout(2600)
    check(len(pg.evaluate('window.__badge')) > 0, f'app badge updated with the unread count ({pg.evaluate("window.__badge")})')
    ctx.close()
    b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
