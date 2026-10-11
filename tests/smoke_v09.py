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
    pg.goto(BASE + f'?fakecloud&v={fresh_visit.n}' + (f'&fakeuser={who}' if who else '') + '#' + route); fresh_visit.n += 1; pg.wait_for_timeout(wait)
fresh_visit.n = 0
with sync_playwright() as p:
    b = p.chromium.launch()
    for size, vw in (('m', (390, 844)), ('d', (1440, 900))):
        ctx = b.new_context(viewport={'width': vw[0], 'height': vw[1]}, device_scale_factor=2 if size == 'm' else 1, color_scheme='dark', has_touch=size == 'm')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(BASE + '?fakecloud&fakereset&fakeuser=owner#/'); pg.wait_for_timeout(2000)
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
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
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
        fresh_visit(pg, '/', 'pilota')
        c = text(pg, '.nc-overlay')
        check('Második hír' in c and 'Megérkezett' not in c, f'{size}: only the new article shows after "don\'t show again"')
        if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(400)
        # MCSM Rating admin: set tiers by CSV, recalculate
        fresh_visit(pg, '/admin/mcsm-rating', 'owner', 2200)
        if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(400)
        pg.fill('textarea.script-box', 'IGTSH_Saby;125\nTeszt_Elek;90\nNincs_Ilyen;110')
        pg.click('button:has-text("Alkalmazás")'); pg.wait_for_timeout(400)
        check('2 sor alkalmazva, 1 nem párosítható' in text(pg), f'{size}: CSV tiers applied')
        pg.click('button:has-text("Mentés")'); pg.wait_for_timeout(1000)
        pg.click('button:has-text("Újraszámolás és közzététel")'); pg.wait_for_timeout(3500)
        check('Utolsó számolás' in text(pg), f'{size}: recalculated ({text(pg)[:160]!r})')
        snap(pg, f'v9_admin_{size}')
        # a driver with fewer than 5 rounds: no number anywhere
        fresh_visit(pg, '/pilotak/igtsh_saby', None, 2600)
        if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(400)
        box = text(pg, '.mr-box')
        check('Ideiglenes' in box and '/5 forduló' in box and pg.query_selector('.mr-num') is None, f'{size}: provisional, number hidden ({box[:60]!r})')
        pg.click('.mr-box button:has-text("Hogyan számoljuk")'); pg.wait_for_timeout(600)
        check('0,25 × Pace' in text(pg, '.sheet'), f'{size}: explanation popup')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        # an established driver (published data injected) shows the full box and sorts first
        pg.goto(BASE + 'tests/'); pg.wait_for_timeout(300)
        pg.evaluate("""() => { const k='mcsm:fakecloud:v1'; const db=JSON.parse(localStorage.getItem(k)); const uid=Object.keys(db.users).find(k=>db.users[k].psnLower==='mgtk_dudu'); const u={ uid };
          db.content = db.content || {}; db.content.ratings = { version: 1, computedAt: Date.now(), drivers: { [u.uid]: { e: 1, r: 131.46, q: 128.2, rr: 134.9, d: 101.3, n: 7, rel: 92.9, hi: 133.1, dl: 1.84, pf: 142.7, h: [['MCSM31 · 5.', 129.2, 140.1], ['MCSM31 · 6.', 129.62, 120.3], ['MCSM32 · 1.', 131.46, 142.7]] } } };
          localStorage.setItem(k, JSON.stringify(db)); }""")
        fresh_visit(pg, '/pilotak/mgtk_dudu', None, 2600)
        if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(400)
        box = text(pg, '.mr-box')
        check('131,5' in box and '+1,8' in box and 'Tempó' in box and '93%' in box and pg.query_selector('.mr-spark') is not None, f'{size}: established rating box ({box[:80]!r})')
        snap(pg, f'v9_profile_{size}')
        fresh_visit(pg, '/pilotak', None, 2400)
        if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(400)
        pg.select_option('select.select', 'mcsm'); pg.wait_for_timeout(800)
        first = pg.query_selector_all('.drv-card')[0].inner_text()
        check('FICSOR' in first and '131,5' in first, f'{size}: sort by MCSM Rating ({first[:40]!r})')
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
