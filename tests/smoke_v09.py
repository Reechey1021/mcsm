# tests/smoke_v09.py - 0.9: news feed + welcome carousel, MCSM Rating (admin, profile, sort), install guide.
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
    if shots: pg.screenshot(path=f'{shots}/{name}.png', full_page=False)
def text(pg, sel='#view'):
    try: return pg.inner_text(sel)
    except Exception: return ''
def fresh_visit(pg, route, who=None, wait=2600):
    pg.evaluate("sessionStorage.removeItem('mcsm:newsShown')")
    pg.goto(BASE + f'?fakecloud&autoconfirm&v={fresh_visit.n}' + (f'&fakeuser={who}' if who else '') + '#' + route); fresh_visit.n += 1; pg.wait_for_timeout(wait)
fresh_visit.n = 0
with sync_playwright() as p:
    b = p.chromium.launch()
    for size, vw in (('m', (390, 844)), ('d', (1440, 900))):
        ctx = b.new_context(viewport={'width': vw[0], 'height': vw[1]}, device_scale_factor=2 if size == 'm' else 1, color_scheme='dark', has_touch=size == 'm')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(BASE + '?fakecloud&autoconfirm&fakereset&fakeuser=owner#/'); pg.wait_for_timeout(2000)
        check(pg.query_selector('.nc-overlay') is None, f'{size}: no carousel without news')
        # admin writes an article for the welcome carousel
        pg.click('button[aria-label="Hírek"]'); pg.wait_for_timeout(700)
        pg.click('.sheet button:has-text("Új hír")'); pg.wait_for_timeout(700)
        pg.fill('.sheet input.input', 'Megérkezett az MCSM Rating')
        pg.fill('.sheet textarea', 'Új **rating** rendszer. Részletek: [szabályzat](https://example.com)')
        pg.click('.sheet button:has-text("Közzététel")'); pg.wait_for_timeout(1500)
        v = text(pg, '.sheet')
        check('Megérkezett az MCSM Rating' in v and pg.query_selector('.sheet .news-body a[href="https://example.com"]') is not None and pg.query_selector('.sheet .news-body strong') is not None, f'{size}: article with formatting and a link')
        snap(pg, f'v9_feed_{size}')
        pg.click('.sheet .sh-head button[aria-label="Bezárás"]'); pg.wait_for_timeout(600)
        check(len(pg.query_selector_all('.sheet')) == 0, f'{size}: close button works')
        # a driver opening the site sees it; ticks "don't show again"
        fresh_visit(pg, '/', 'pilota')
        check(pg.query_selector('.nc-overlay') is not None and 'Megérkezett' in text(pg, '.nc-overlay'), f'{size}: welcome carousel on opening')
        snap(pg, f'v9_carousel_{size}')
        pg.check('#nc-never'); pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(500)
        fresh_visit(pg, '/', 'pilota')
        check(pg.query_selector('.nc-overlay') is None, f'{size}: dismissed article stays hidden')
        # a second carousel article still shows, alone
        fresh_visit(pg, '/', 'owner', 1800)
        pg.click('button[aria-label="Hírek"]'); pg.wait_for_timeout(700)
        pg.click('.sheet button:has-text("Új hír")'); pg.wait_for_timeout(600)
        pg.fill('.sheet input.input', 'Második hír'); pg.fill('.sheet textarea', 'Szöveg')
        pg.click('.sheet button:has-text("Közzététel")'); pg.wait_for_timeout(1300)
        check('Korábbi hírek' in text(pg, '.sheet'), f'{size}: older news listed under the newest')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        pg.evaluate("Object.keys(localStorage).filter(k => k.includes('newsOpenedAt')).forEach(k => localStorage.removeItem(k))")
        fresh_visit(pg, '/', 'pilota')
        c = text(pg, '.nc-overlay')
        check('Második hír' in c and 'Megérkezett' not in c, f'{size}: only the new article shows after "don\'t show again"')
        check(pg.inner_text('.news-badge').strip() == '2', f'{size}: unread count on the news button ({pg.inner_text(".news-badge")!r})')
        if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(400)
        # (rating admin and import are covered by smoke_v095.py)
        # a driver with fewer than 5 rounds: no number anywhere
        fresh_visit(pg, '/pilotak/igtsh_saby', None, 2600)
        if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(400)
        box = text(pg, '.mr-card')
        check('Besorolatlan' in box and 'FORDULÓ A BESOROLÁSIG' in box.upper() and pg.query_selector('.mr-big') is None and pg.query_selector('.mr-avg') is None, f'{size}: unranked, no number, no average marker ({box[:60]!r})')
        pg.click('.mr-card .mr-help'); pg.wait_for_timeout(600)
        check('20% Kvalifikáció' in text(pg, '.sheet'), f'{size}: explanation popup')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        # an established driver (published data injected) shows the full box and sorts first
        pg.goto(BASE + 'tests/'); pg.wait_for_timeout(300)
        pg.evaluate("""() => { const k='mcsm:fakecloud:v1'; const db=JSON.parse(localStorage.getItem(k)); const uid=Object.keys(db.users).find(k=>db.users[k].psnLower==='mgtk_dudu'); const u={ uid };
          db.content = db.content || {}; db.content.ratings = { version: '3.2', computedAt: Date.now(), drivers: { [u.uid]: { e: 1, r: 131.46, q: 128.2, s: 134.9, g: 129.3, n: 7, hi: 133.1, dl: 1.84, h: [['MCSM25–30', 129.2, 126, 130, 128], ['MCSM31 / 1', 129.62, 127, 131, 128.5], ['MCSM31 / 2', 131.46, 128.2, 134.9, 129.3]] } } };
          localStorage.setItem(k, JSON.stringify(db)); Object.keys(localStorage).filter((x) => x.startsWith('mcsm:pc:')).forEach((x) => localStorage.removeItem(x)); }""")
        fresh_visit(pg, '/pilotak/mgtk_dudu', None, 2600)
        if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(400)
        box = text(pg, '.mr-card')
        check('131,5' in box and '+1,8' in box and 'KVALIFIKÁCIÓ' in box.upper() and 'GRAN' in box.upper(), f'{size}: ranked rating card ({box[:80]!r})')
        # the card sits between the SR card and the GT7 stats
        # since 0.9.13 the profile is one grid: DR, SR, MCSM Rating, GT7 stats (desktop: MCSM beside DR)
        order = pg.evaluate("[...document.querySelectorAll('.rating-grid > *')].map(e => e.className)")
        check(any('sr-card' in o for o in order) and any('mr-card' in o for o in order) and [i for i, o in enumerate(order) if 'sr-card' in o][0] < [i for i, o in enumerate(order) if 'mr-card' in o][0], f'{size}: SR before the MCSM card ({order})')
        snap(pg, f'v9_profile_{size}')
        fresh_visit(pg, '/sajat', 'owner', 2600)
        if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(400)
        pg.goto(BASE + '?fakecloud&autoconfirm&mrdemo#/sajat'); pg.wait_for_timeout(2400)
        if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(400)
        check('MINTA' in text(pg, '.mr-card') and '131,5' in text(pg, '.mr-card'), f'{size}: ?mrdemo shows a sample')
        snap(pg, f'v9_demo_{size}')
        fresh_visit(pg, '/pilotak', None, 2400)
        if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(400)
        pg.select_option('select.select', 'mcsm'); pg.wait_for_timeout(800)
        first = pg.query_selector_all('.drv-card')[0].inner_text()
        check('FICSOR' in first and '131,5' in first, f'{size}: sort by MCSM Rating ({first[:40]!r})')
        check(pg.query_selector('.drv-card .rating') is None, f'{size}: no DR/SR badges on driver cards')
        # install guide in the profile menu
        pg.click('.hdr-actions .icon-btn:last-child, .hdr-actions button:last-child'); pg.wait_for_timeout(600)
        pg.click('.sheet button:has-text("Telepítsd az MCSM appot")'); pg.wait_for_timeout(600)
        check('Főképernyőhöz adás' in text(pg, '.sheet') and 'Alkalmazás telepítése' in text(pg, '.sheet'), f'{size}: install guide')
        snap(pg, f'v9_install_{size}')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        ow = pg.evaluate('document.documentElement.scrollWidth - innerWidth')
        check(ow <= 0, f'{size}: no horizontal overflow ({ow})')
        ctx.close()
    b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
