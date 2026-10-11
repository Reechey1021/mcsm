# tests/smoke_v07.py - 0.7 walk-through: hall of fame, team pages and logos, titles, sorting, sync options.
import sys, json, base64
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
def go(pg, route, who=None, wait=1800):
    pg.goto(BASE + '?fakecloud&autoconfirm' + (f'&fakeuser={who}' if who else '') + '#' + route); pg.wait_for_timeout(wait)
open('/tmp/mcsm-logo.png', 'wb').write(base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJklEQVR4nGP8z8Dwn4EIwESMIlYGhv+MDAz/GRgY/jMyMDAwEAMAlUQGAQ6m7qYAAAAASUVORK5CYII='))
with sync_playwright() as p:
    b = p.chromium.launch()
    for size, vw in (('m', (390, 844)), ('d', (1440, 900))):
        ctx = b.new_context(viewport={'width': vw[0], 'height': vw[1]}, device_scale_factor=2 if size == 'm' else 1, color_scheme='dark', has_touch=size == 'm')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(BASE + '?fakecloud&autoconfirm&fakereset#/eredmenyek'); pg.wait_for_timeout(2200)
        check(pg.query_selector('.tower') is not None, f'{size}: results tab still opens on the standings')
        pg.click('.seg button:has-text("Dicsőségfal")'); pg.wait_for_timeout(1800)
        v = text(pg)
        check(len(pg.query_selector_all('.hof-card')) >= 29 and 'MCSM1' in v and 'Egyéni éremtáblázat' in v, f'{size}: hall of fame seasons')
        check(pg.query_selector('.mt-row .tcount') is not None and pg.query_selector_all('.mt-row')[0].inner_text().split()[-3:][0] == '11', f'{size}: medal table')
        snap(pg, f'v7_hall_{size}')
        # driver with titles (IGTSH_Saby is in the test data)
        go(pg, '/pilotak/igtsh_saby', None, 2400)
        check('Bajnoki címek' in text(pg) and '11× bajnok' in text(pg), f'{size}: profile titles box')
        snap(pg, f'v7_profile_{size}')
        go(pg, '/pilotak', None, 2200)
        pg.select_option('select.select', 'titles'); pg.wait_for_timeout(900)
        first = pg.query_selector_all('.drv-card')[0].inner_text()
        check('SAGHMEISTER' in first, f'{size}: sort by titles ({first[:30]!r})')
        check(all(' · ' in c.inner_text() for c in pg.query_selector_all('.drv-card')[:5]), f'{size}: cards show #number · PSN')
        # teams list -> team page; admin uploads a logo there
        go(pg, '/csapatok', 'owner', 2000)
        pg.query_selector_all('.team-card')[0].click(); pg.wait_for_timeout(1800)
        check('#/csapatok/' in pg.url and 'Csapatbajnoki eredmények' in text(pg), f'{size}: team page')
        pg.click('button:has-text("Szerkesztés")'); pg.wait_for_timeout(700)
        with pg.expect_file_chooser() as fc:
            pg.click('.sheet button:has-text("Logó feltöltése")')
        fc.value.set_files('/tmp/mcsm-logo.png'); pg.wait_for_timeout(1500)
        pg.click('.sheet .btn.primary.block'); pg.wait_for_timeout(1800)
        check(pg.query_selector('.team-hero .logo-big[style*="background-image"]') is not None, f'{size}: team logo shown on its page')
        snap(pg, f'v7_team_{size}')
        # GT team logo upload
        go(pg, '/admin/gt', 'owner')
        pg.query_selector_all('.row-card')[0].click(); pg.wait_for_timeout(700)
        check('Logó' in text(pg, '.sheet'), f'{size}: GT team logo field')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        # GT7 page: options
        go(pg, '/admin/gt7', 'owner')
        check('Csak akiknek nincs adata' in text(pg) and 'Naponta automatikusan' in text(pg) and 'Csak akiknek még nincs képe' in text(pg), f'{size}: sync options')
        pg.click('button:has-text("Frissítés mindenkinek")'); pg.wait_for_timeout(5000)
        check('frissítve' in text(pg, 'body'), f'{size}: refresh of drivers without data')
        ow = pg.evaluate('document.documentElement.scrollWidth - innerWidth')
        check(ow <= 0, f'{size}: no horizontal overflow ({ow})')
        ctx.close()
    b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
