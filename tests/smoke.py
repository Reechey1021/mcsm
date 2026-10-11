# tests/smoke.py - browser walk-through on the test backend (phone + desktop).
# Needs: python3 -m http.server 8765 from the project root, and playwright.
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
with sync_playwright() as p:
    b = p.chromium.launch()
    for size, vw in (('m', (390, 844)), ('d', (1440, 900))):
        ctx = b.new_context(viewport={'width': vw[0], 'height': vw[1]}, device_scale_factor=2 if size == 'm' else 1, color_scheme='dark', has_touch=size == 'm')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(BASE + '?fakecloud&fakereset#/'); pg.wait_for_timeout(1200)
        check(pg.query_selector('.hero') is not None, f'{size}: home hero')
        snap(pg, f'home_{size}')
        # sign up a new driver
        pg.goto(BASE + '#/regisztracio'); pg.wait_for_timeout(700)
        pg.click('button[type=submit]'); pg.wait_for_timeout(400)
        check('érvényes' in pg.inner_text('form'), f'{size}: signup validation shows')
        pg.fill('input[type=email]', f'uj{size}@pilota.hu'); pg.fill('input[type=password]', 'jelszo123'); pg.check('#consent')
        pg.click('button[type=submit]'); pg.wait_for_timeout(1500)
        check('#/profil' in pg.url, f'{size}: lands on wizard after signup ({pg.url})')
        snap(pg, f'wizard0_{size}')
        # step 1
        pg.click('.wizard-foot .btn.primary'); pg.wait_for_timeout(500)
        check(pg.query_selector('[aria-invalid="true"]') is not None, f'{size}: wizard step 1 validates')
        inputs = pg.query_selector_all('.wizard-body input')
        inputs[0].fill('Próba'); inputs[1].fill('Péter'); inputs[2].fill('Teszt_Elek'); pg.wait_for_timeout(900)
        check('másik fiókhoz' in pg.inner_text('.wizard-body'), f'{size}: PSN taken detected')
        inputs[2].fill(f'Proba_{size}'); pg.wait_for_timeout(900)
        pg.click('.wizard-foot .btn.primary'); pg.wait_for_timeout(1200)
        check('2/3' in pg.inner_text('.page-sub'), f'{size}: on step 2')
        # step 2
        pg.click('.wizard-body .chip:text-is("Fanatec")')
        pg.click('.wizard-body .chip:text-is("Monitor")')
        pg.fill('.wizard-body input.big', '1'); pg.click('.wizard-body .chip:text-is("A+")'); pg.click('.wizard-body .chip:text-is("S")')
        pg.click('.wizard-foot .btn.primary'); pg.wait_for_timeout(900)
        check('regnáló' in pg.inner_text('.wizard-body'), f'{size}: #1 reserved')
        pg.fill('.wizard-body input.big', '44')
        snap(pg, f'wizard1_{size}')
        pg.click('.wizard-foot .btn.primary'); pg.wait_for_timeout(1200)
        check('3/3' in pg.inner_text('.page-sub'), f'{size}: on step 3')
        pg.click('.team-opt:has-text("AUTOBAHN")')
        snap(pg, f'wizard2_{size}')
        pg.click('.wizard-foot .btn.primary'); pg.wait_for_timeout(1800)
        check('#/sajat' in pg.url, f'{size}: finished wizard -> me ({pg.url})')
        check('PRÓBA' in pg.inner_text('#view'), f'{size}: me shows profile')
        check(pg.query_selector('.banner') is not None, f'{size}: verify banner')
        snap(pg, f'me_{size}')
        pg.click('button:has-text("Megerősítés (teszt)")'); pg.wait_for_timeout(900)
        check(pg.query_selector('#view .banner') is None, f'{size}: verified banner gone')
        # directory
        pg.goto(BASE + '#/pilotak'); pg.wait_for_timeout(1300)
        check(len(pg.query_selector_all('.drv-card')) >= 48, f'{size}: directory lists drivers')
        pg.fill('input[type=search]', 'próba'); pg.wait_for_timeout(700)
        check(len(pg.query_selector_all('.drv-card')) == 1, f'{size}: search finds new driver')
        pg.click('.drv-card'); pg.wait_for_timeout(1200)
        check('AUTOBAHN' in pg.inner_text('#view'), f'{size}: profile shows team')
        snap(pg, f'driver_{size}')
        # admin is forbidden for drivers
        pg.goto(BASE + '#/admin'); pg.wait_for_timeout(800)
        check('jogosultságod' in pg.inner_text('#view'), f'{size}: admin forbidden for drivers')
        # sign in as owner
        pg.goto(BASE + f'?fakecloud&fakeuser=owner#/admin'); pg.wait_for_timeout(1500)
        check(pg.query_selector('.tile') is not None, f'{size}: owner sees admin')
        snap(pg, f'admin_{size}')
        pg.goto(BASE + '?fakecloud#/admin/felhasznalok'); pg.wait_for_timeout(1400)
        pg.fill('input[type=search]', 'próba'); pg.wait_for_timeout(600)
        pg.click('.row-card'); pg.wait_for_timeout(900)
        pg.click('.toggle-row:has-text("Versenybíró") .switch'); pg.fill('.sheet input[placeholder^="Miért"]', 'teszt'); pg.click('.sheet .btn.primary'); pg.wait_for_timeout(1300)
        check('Versenybíró' in pg.inner_text('#view'), f'{size}: role saved')
        pg.goto(BASE + '?fakecloud#/admin/naplo'); pg.wait_for_timeout(1300)
        check('módosította' in pg.inner_text('#view'), f'{size}: audit entry')
        snap(pg, f'audit_{size}')
        pg.goto(BASE + '?fakecloud#/admin/csapatok'); pg.wait_for_timeout(1300)
        pg.click('button:has-text("Új csapat")'); pg.wait_for_timeout(700)
        pg.fill('.sheet input.input', 'TESZT RACING'); pg.click('.sheet .btn.primary'); pg.wait_for_timeout(1300)
        check('TESZT RACING' in pg.inner_text('#view'), f'{size}: team created')
        # language switch
        pg.click('.hdr-actions button[aria-label="Menü megnyitása"]'); pg.wait_for_timeout(700)
        pg.click('.sheet .seg button:has-text("English")'); pg.wait_for_timeout(900)
        check('MCSM teams' in pg.inner_text('#view'), f'{size}: English')
        pg.evaluate("localStorage.setItem('mcsm:lang', JSON.stringify('hu'))")
        ow = pg.evaluate('document.documentElement.scrollWidth - innerWidth')
        check(ow <= 0, f'{size}: no horizontal overflow ({ow})')
        ctx.close()
    b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
