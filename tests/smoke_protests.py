# tests/smoke_protests.py - phase 4 walk-through: decisions, filing, judging, penalties, Spec picks.
# Needs: python3 -m http.server 8765 from the project root, and playwright.
import sys, json, re
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
def go(pg, route, who=None, wait=1700):
    pg.goto(BASE + '?fakecloud&autoconfirm' + (f'&fakeuser={who}' if who else '') + '#' + route); pg.wait_for_timeout(wait)
def sprint_row(pg, surname):
    rows = pg.query_selector_all('.rtable tbody tr')
    for r in rows:
        if surname in r.inner_text(): return r.inner_text().replace('\n', ' ').replace('\t', ' ')
    return ''
with sync_playwright() as p:
    b = p.chromium.launch()
    for size, vw in (('m', (390, 844)), ('d', (1440, 900))):
        ctx = b.new_context(viewport={'width': vw[0], 'height': vw[1]}, device_scale_factor=2 if size == 'm' else 1, color_scheme='dark', has_touch=size == 'm')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(BASE + '?fakecloud&autoconfirm&fakereset#/szezonok/mcsm31/ovasok'); pg.wait_for_timeout(2200)
        check('Kitolás a 4-es kanyarban' in text(pg) and '+5 mp' in text(pg), f'{size}: published decision visible')
        snap(pg, f'p4_decisions_{size}')
        go(pg, '/szezonok/mcsm31/fordulo/1')
        check('Döntés közzétéve' in text(pg), f'{size}: decision on round page')
        # admin adds pilota to MCSM31 so they can file
        go(pg, '/szezonok/mcsm31/nevezesek', 'owner')
        pg.click('button:has-text("Pilóta hozzáadása")'); pg.wait_for_timeout(1200)
        pg.fill('.sheet input[type=search]', 'teszt'); pg.wait_for_timeout(400)
        pg.query_selector_all('.sheet .row-card')[0].click(); pg.wait_for_timeout(1800)
        # pilota files a protest on round 2 (window extended in test data)
        go(pg, '/szezonok/mcsm31/fordulo/2', 'pilota')
        check(pg.query_selector('a:has-text("Óvás benyújtása")') is not None, f'{size}: file button shown while window open')
        pg.click('a:has-text("Óvás benyújtása")'); pg.wait_for_timeout(1500)
        pg.click('.wizard-body .chip >> nth=0') if pg.query_selector('.wizard-body .chip') else None
        pg.click('button:has-text("Óvás benyújtása")'); pg.wait_for_timeout(700)
        check(pg.query_selector('[aria-invalid="true"]') is not None or 'érintett' in text(pg).lower(), f'{size}: form validates')
        pg.query_selector_all('.choice.multi .chip')[2].click()
        inputs = pg.query_selector_all('.form input.input')
        inputs[0].fill('4'); inputs[1].fill('T1')
        pg.fill('.form input[maxlength="80"]', 'Kiszorítás a célegyenesben')
        pg.fill('.form textarea', 'A célegyenesben a fal felé szorított, kénytelen voltam elvenni a gázt.')
        pg.click('button:has-text("Óvás benyújtása")'); pg.wait_for_timeout(2000)
        check('fordulo/2' in pg.url and 'Kiszorítás a célegyenesben' in text(pg), f'{size}: protest filed and listed ({pg.url})')
        snap(pg, f'p4_filed_{size}')
        wb = pg.query_selector('button:has-text("Óvás visszavonása")')
        if not wb: print('DIAG', size, pg.url, text(pg)[-400:].replace('\n', ' | '))
        else: wb.click(); pg.wait_for_timeout(1700)
        check('Kiszorítás a célegyenesben' not in text(pg), f'{size}: protest withdrawn')
        go(pg, '/birosag', 'pilota')
        check('jogosultságod' in text(pg), f'{size}: stewards area forbidden for drivers')
        # owner as judge chair: open p2, assign, vote, publish
        go(pg, '/birosag', 'owner', 2500)
        check('Rajt utáni érintkezés' in text(pg), f'{size}: case list')
        snap(pg, f'p4_cases_{size}')
        go(pg, '/birosag/mcsm31/p2', 'owner', 2200)
        target = re.search(r'Érintett: ([^.]+)\.', text(pg))
        target = target.group(1).split()[0] if target else ''
        check(bool(target), f'{size}: case shows involved driver')
        check('2 szavazat' in text(pg), f'{size}: two seeded votes')
        pg.click('button:has-text("Testület")'); pg.wait_for_timeout(1500)
        pg.click('.panel .chip:has-text("Időbüntetés") >> nth=0'); pg.wait_for_timeout(300)
        pg.click('.panel .chip:has-text("+3 s") >> nth=0')
        pg.click('button:has-text("Szavazok")'); pg.wait_for_timeout(1800)
        check('3 szavazat' in text(pg), f'{size}: third vote counted ({text(pg)[:0]})')
        snap(pg, f'p4_case_{size}')
        # check the result before publishing
        go(pg, '/szezonok/mcsm31/fordulo/2', None, 1800)
        pg.click('.seg button:has-text("A lobby")'); pg.click('.seg button:has-text("Sprint")'); pg.wait_for_timeout(600)
        before = sprint_row(pg, target)
        go(pg, '/birosag/mcsm31/p2', 'owner', 2200)
        pg.fill('textarea[placeholder^="Mit láttatok"]', 'Hátulról érkezett, elkerülhető érintkezés: 3 másodperc.')
        pg.click('button:has-text("Döntés közzététele")'); pg.wait_for_timeout(2200)
        check('A döntés nyilvános' in text(pg), f'{size}: decision published')
        go(pg, '/szezonok/mcsm31/fordulo/2', None, 1800)
        pg.click('.seg button:has-text("A lobby")'); pg.click('.seg button:has-text("Sprint")'); pg.wait_for_timeout(600)
        after = sprint_row(pg, target)
        check(before and after and before != after, f'{size}: penalty changed the sprint result ({before!r} -> {after!r})')
        check('+3 mp' in text(pg), f'{size}: decision listed on round page')
        # Spec picks: pilota enters MCSM32 then picks a car
        go(pg, '/szezonok/mcsm32', 'pilota')
        if pg.query_selector('.reg-card .btn.primary'):
            pg.click('.reg-card .btn.primary'); pg.wait_for_timeout(900); pg.click('.sheet .btn.primary'); pg.wait_for_timeout(2000)
        sels = pg.query_selector_all('.round-item select')
        check(len(sels) == 3, f'{size}: spec selects for three rounds ({len(sels)})')
        if sels:
            sels[0].select_option('Porsche 911 RSR'); pg.wait_for_timeout(1800)
            sels = pg.query_selector_all('.round-item select')
            dis = pg.eval_on_selector_all('.round-item select', 'els => els[1] ? [...els[1].options].filter(o => o.disabled).map(o => o.value) : []')
            check('Porsche 911 RSR' in dis, f'{size}: used car disabled for other rounds')
        snap(pg, f'p4_spec_{size}')
        # judge scope in admin
        go(pg, '/admin/felhasznalok', 'owner')
        pg.fill('input[type=search]', 'birgés'); pg.wait_for_timeout(500)
        pg.query_selector_all('.row-card')[0].click(); pg.wait_for_timeout(900)
        check('Bírói hatáskör' in text(pg, '.sheet'), f'{size}: judge scope editor')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        ow = pg.evaluate('document.documentElement.scrollWidth - innerWidth')
        check(ow <= 0, f'{size}: no horizontal overflow ({ow})')
        ctx.close()
    b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
