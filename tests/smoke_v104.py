# tests/smoke_v104.py - "Besorolva!" rank reveal: ?rankdemo preview, the real note (shown once, cleared),
# always on top of the news carousel (news waits), tap to fast-forward, reduced motion.
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
        # 1. preview address, signed out: plays, counts up, writes nothing
        pg.goto(BASE + '?fakecloud&fakereset&rankdemo#/'); pg.wait_for_timeout(1300)
        mid = pg.inner_text('.rr-num') if pg.query_selector('.rr-num') else ''
        pg.wait_for_timeout(2600)
        end = pg.inner_text('.rr-num') if pg.query_selector('.rr-num') else ''
        check(pg.query_selector('.rr-overlay') is not None and 'Besorolva' in pg.inner_text('.rr-card'), f'{size}: ?rankdemo shows the reveal')
        check(mid != '131,5' and end == '131,5', f'{size}: the number counts up to the rating ({mid} -> {end})')
        check('#4' in pg.inner_text('.rr-rank') and '62' in pg.inner_text('.rr-rank') and len(pg.query_selector_all('.rr-stars .star')) == 5, f'{size}: rank stat and stars')
        if shots: pg.screenshot(path=f'{shots}/reveal_{size}.png')
        pg.click('.rr-actions .btn.primary'); pg.wait_for_timeout(500)
        check(pg.query_selector('.rr-overlay') is None, f'{size}: Continue closes it')
        # 2. the real note: on top of the news, shown once, cleared on close; news only afterwards
        db(pg, """(db) => { const P = db.accounts['pilota@mcsm.test'].uid; db.users[P].rankReveal = { r: 118.4, q: 121.0, s: 116.2, g: 119.0, rank: 23, total: 61, label: 'MCSM31 / 3', at: Date.now() };
          db.content = db.content || {}; db.content.news = { items: [{ id: 'nx', title: 'Hír', body: 'x', carousel: true, at: Date.now() }] }; }""")
        pg.evaluate("() => { sessionStorage.clear(); localStorage.removeItem('mcsm:newsDismissed'); }")
        pg.goto(BASE + '?fakecloud&fakeuser=pilota&v=2#/'); pg.wait_for_timeout(2600)
        check(pg.query_selector('.rr-overlay') is not None and pg.query_selector('.nc-overlay') is None, f'{size}: reveal first, news waits')
        # tap fast-forwards
        pg.click('.rr-card .rr-sub'); pg.wait_for_timeout(250)
        check(pg.inner_text('.rr-num') == '118,4', f'{size}: a tap jumps to the end ({pg.inner_text(".rr-num")})')
        pg.click('.rr-actions .btn.primary'); pg.wait_for_timeout(1600)
        check(pg.query_selector('.rr-overlay') is None and pg.query_selector('.nc-overlay') is not None, f'{size}: then the news')
        if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(300)
        cleared = db(pg, "(db) => db.users[db.accounts['pilota@mcsm.test'].uid].rankReveal == null")
        check(cleared, f'{size}: note cleared, so it shows once')
        pg.goto(BASE + '?fakecloud&fakeuser=pilota&v=3#/'); pg.wait_for_timeout(2400)
        check(pg.query_selector('.rr-overlay') is None, f'{size}: not shown again')
        ctx.close()
    # 3. reduced motion: final state straight away
    ctx = b.new_context(viewport={'width': 1280, 'height': 900}, reduced_motion='reduce')
    pg = ctx.new_page()
    pg.goto(BASE + '?fakecloud&fakereset&rankdemo#/'); pg.wait_for_timeout(1100)
    check(pg.query_selector('.rr-num') is not None and pg.inner_text('.rr-num') == '131,5', 'reduced motion: shown complete at once')
    ctx.close(); b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
