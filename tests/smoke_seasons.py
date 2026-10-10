# tests/smoke_seasons.py - phase 2 walk-through: seasons, entering, waitlist, admin tools.
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
def text(pg, sel='#view'):
    try: return pg.inner_text(sel)
    except Exception: return ''
def as_user(pg, who, route):
    pg.goto(BASE + f'?fakecloud&fakeuser={who}#{route}'); pg.wait_for_timeout(1500)
with sync_playwright() as p:
    b = p.chromium.launch()
    for size, vw in (('m', (390, 844)), ('d', (1440, 900))):
        ctx = b.new_context(viewport={'width': vw[0], 'height': vw[1]}, device_scale_factor=2 if size == 'm' else 1, color_scheme='dark', has_touch=size == 'm', accept_downloads=True)
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        # visitor
        pg.goto(BASE + '?fakecloud&fakereset#/'); pg.wait_for_timeout(1600)
        check('Nevezés nyitva' in text(pg), f'{size}: home hero shows open entries')
        check(pg.query_selector('.countdown') is not None, f'{size}: countdown on home')
        snap(pg, f'p2_home_visitor_{size}')
        pg.goto(BASE + '#/szezonok'); pg.wait_for_timeout(1300)
        v = text(pg)
        check('MCSM32' in v and 'MCSM31' in v and 'Archívum' in v, f'{size}: seasons list groups')
        snap(pg, f'p2_seasons_{size}')
        # driver enters from the home page
        as_user(pg, 'pilota', '/')
        pg.click('.hero .btn.primary:has-text("Nevezés")'); pg.wait_for_timeout(900)
        check(pg.query_selector('.sheet .snap') is not None, f'{size}: entry sheet shows details')
        snap(pg, f'p2_entersheet_{size}')
        pg.click('.sheet .btn.primary'); pg.wait_for_timeout(1800)
        check('Neveztél' in text(pg), f'{size}: hero shows entered ({text(pg)[:80]!r})')
        # season page: my entry, absence, withdraw, re-enter
        pg.goto(BASE + '?fakecloud#/szezonok/mcsm32'); pg.wait_for_timeout(1600)
        check(pg.query_selector('.my-entry') is not None, f'{size}: my entry card')
        snap(pg, f'p2_season_{size}')
        sw = pg.query_selector_all('.my-entry .switch')
        if sw:
            sw[1 if len(sw) > 1 else 0].click(); pg.wait_for_timeout(900)
            check('nem tudsz jönni' in text(pg, 'body'), f'{size}: absence toast')
        pg.click('.my-entry .btn.danger'); pg.wait_for_timeout(700)
        pg.click('.sheet .btn.danger'); pg.wait_for_timeout(1800)
        check(pg.query_selector('.my-entry') is None and 'Újra nevezek' in text(pg), f'{size}: withdrawn, can re-enter')
        pg.click('button:has-text("Újra nevezek")'); pg.wait_for_timeout(900)
        pg.click('.sheet .btn.primary'); pg.wait_for_timeout(1800)
        check(pg.query_selector('.my-entry') is not None, f'{size}: re-entered')
        # entry list
        pg.click('.tabs-sticky .seg button:has-text("Nevezések")'); pg.wait_for_timeout(800)
        check(len(pg.query_selector_all('.entry-row')) >= 29, f'{size}: entry list rows')
        check('Tartalékok' in text(pg), f'{size}: reserves section')
        snap(pg, f'p2_entries_{size}')
        # owner: create a season via the wizard
        as_user(pg, 'owner', '/szezonok')
        pg.click('a:has-text("Új szezon")'); pg.wait_for_timeout(1500)
        inputs = pg.query_selector_all('.wizard-body input')
        check(inputs[0].input_value() == '33', f'{size}: next number suggested ({inputs[0].input_value()})')
        inputs[1].fill(f'Próbakupa {size}')
        pg.click('.wizard-foot .btn.primary'); pg.wait_for_timeout(700)
        pg.click('button:has-text("Forduló hozzáadása")'); pg.wait_for_timeout(500)
        pg.select_option('.round-edit select', 'suzuka'); pg.wait_for_timeout(300)
        pg.click('button:has-text("Alapértelmezett PQ")'); pg.wait_for_timeout(300)
        snap(pg, f'p2_wiz_rounds_{size}')
        pg.click('.wizard-foot .btn.primary'); pg.wait_for_timeout(700)
        pg.fill('.wizard-body input', 'Mazda RX-Vision GT3')
        pg.click('.wizard-foot .btn.primary'); pg.wait_for_timeout(700)
        pg.click('button:has-text("Alapértelmezett időszak")'); pg.wait_for_timeout(300)
        cap = pg.query_selector_all('.wizard-body .inline')[1].query_selector('input'); cap.fill('2')
        pg.click('.wizard-foot .btn.primary'); pg.wait_for_timeout(700)
        pg.click('.wizard-foot .btn.primary'); pg.wait_for_timeout(900)
        check('Minden rendben' in text(pg), f'{size}: review ok ({text(pg)[:200]!r})')
        snap(pg, f'p2_wiz_review_{size}')
        pg.click('button:has-text("Meghirdetés")'); pg.wait_for_timeout(1800)
        check('#/szezonok/mcsm33' in pg.url, f'{size}: lands on new season ({pg.url})')
        pg.click('button:has-text("Nevezés megnyitása most")'); pg.wait_for_timeout(1800)
        check('Nevezés nyitva' in text(pg), f'{size}: opened entries now')
        # owner enters, pilota enters, admin adds a third -> waitlist
        pg.click('.reg-card .btn.primary'); pg.wait_for_timeout(900); pg.click('.sheet .btn.primary'); pg.wait_for_timeout(1800)
        as_user(pg, 'pilota', '/szezonok/mcsm33')
        pg.click('.reg-card .btn.primary'); pg.wait_for_timeout(900); pg.click('.sheet .btn.primary'); pg.wait_for_timeout(1800)
        check('2/2' in text(pg), f'{size}: pilota got the last place')
        as_user(pg, 'owner', '/szezonok/mcsm33/nevezesek')
        pg.click('button:has-text("Pilóta hozzáadása")'); pg.wait_for_timeout(1200)
        pg.query_selector_all('.sheet .row-card')[0].click(); pg.wait_for_timeout(2000)
        check('Várólista' in text(pg) and '1 várólistán' in text(pg), f'{size}: third driver waitlisted')
        snap(pg, f'p2_waitlist_{size}')
        # withdraw the owner -> waitlisted driver moves up
        pg.query_selector_all('.entry-row')[0].click(); pg.wait_for_timeout(900)
        pg.click('.sheet button:has-text("Visszaléptetés")'); pg.wait_for_timeout(1800)
        check('0 várólistán' in text(pg), f'{size}: waitlist promoted after withdrawal ({text(pg)[:160]!r})')
        # CSV
        with pg.expect_download() as dl:
            pg.click('button:has-text("CSV")')
        check(dl.value.suggested_filename == 'mcsm33-nevezesek.csv', f'{size}: csv download')
        # visitor can't see drafts; driver can't open the wizard
        as_user(pg, 'pilota', '/admin/szezon/uj')
        check('jogosultságod' in text(pg), f'{size}: wizard forbidden for drivers')
        pg.evaluate('document.documentElement.scrollWidth - innerWidth')
        ow = pg.evaluate('document.documentElement.scrollWidth - innerWidth')
        check(ow <= 0, f'{size}: no horizontal overflow ({ow})')
        ctx.close()
    b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
