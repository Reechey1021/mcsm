# tests/smoke_v095.py - rating V3.2 import + card + history, compare, old results, podium, user delete,
# season team correction, news only after sign-in, version in the menu.
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
n = [0]
def go(pg, route, who='owner', wait=2200):
    n[0] += 1; pg.goto(BASE + f'?fakecloud&autoconfirm&v={n[0]}' + (f'&fakeuser={who}' if who else '') + '#' + route); pg.wait_for_timeout(wait)
with sync_playwright() as p:
    b = p.chromium.launch()
    for size, vw in (('m', (390, 844)), ('d', (1440, 900))):
        ctx = b.new_context(viewport={'width': vw[0], 'height': vw[1]}, device_scale_factor=2 if size == 'm' else 1, color_scheme='dark', has_touch=size == 'm')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(BASE + '?fakecloud&fakereset&fakeuser=owner#/admin/mcsm-rating'); pg.wait_for_timeout(2200)
        pg.set_input_files('input[type=file]', '/mnt/user-data/uploads/MCSM_Rating_V2_0_Latent_Import.json'); pg.wait_for_timeout(1500)
        check('párosítva fiókkal' in text(pg), f'{size}: bootstrap read and matched')
        pg.click('button:has-text("Kiindulás mentése")'); pg.wait_for_timeout(900)
        pg.click('button:has-text("Újraszámolás és közzététel")'); pg.wait_for_timeout(4000)
        check('besorolt pilóta' in text(pg), f'{size}: published ({text(pg)[:140]!r})')
        go(pg, '/pilotak/igtsh_saby', None, 2800)
        card = text(pg, '.mr-card')
        check('Besorolatlan' not in card and 'SPRINT' in card.upper() and 'GRAN' in card.upper(), f'{size}: Saby ranked with Q/Sprint/GP ({card[:80]!r})')
        big = pg.evaluate("document.querySelector('.mr-big') && document.querySelector('.mr-big').textContent")
        check(big and 146 < float(big.replace(',', '.')) < 150, f'{size}: Saby around his V2.0 value, 147,6 ({big})')
        check('MCSM25–30 eredmények' in text(pg) and 'MCSM30 / 3' in text(pg), f'{size}: MCSM25–30 results on the profile')
        if pg.query_selector('.mr-card button:has-text("előzmények")'):
            pg.click('.mr-card button:has-text("előzmények")'); pg.wait_for_timeout(700)
            check(pg.query_selector('.sheet .mh-chart') is not None and 'MCSM25–30' in text(pg, '.sheet'), f'{size}: rating history chart')
            snap(pg, f'v95_history_{size}')
            pg.click('.sheet .sh-head button[aria-label="Bezárás"]'); pg.wait_for_timeout(400)
        else: check(False, f'{size}: history button')
        # compare
        pg.click('button:has-text("Összevetés")'); pg.wait_for_timeout(600)
        pg.fill('.sheet input[type=search]', 'dudu'); pg.wait_for_timeout(300)
        pg.query_selector_all('.sheet .row-card')[0].click(); pg.wait_for_timeout(2000)
        check('#/osszevetes/' in pg.url and len(pg.query_selector_all('.cmp-row')) >= 10, f'{size}: compare page')
        snap(pg, f'v95_compare_{size}')
        # podium on a finished season
        pg.goto(BASE + 'tests/'); pg.wait_for_timeout(200)
        pg.evaluate("(() => { const k='mcsm:fakecloud:v1'; const db=JSON.parse(localStorage.getItem(k)); db.seasons.mcsm31.state='finished'; localStorage.setItem(k, JSON.stringify(db)); Object.keys(localStorage).filter((x) => x.startsWith('mcsm:pc:')).forEach((x) => localStorage.removeItem(x)); })()")
        go(pg, '/szezonok/mcsm31', None, 3200)
        check(pg.query_selector('.pd-card') is not None and pg.query_selector('.p1 .pd-bar') is not None, f'{size}: podium on finished season')
        snap(pg, f'v95_podium_{size}')
        pg.goto(BASE + 'tests/'); pg.wait_for_timeout(200)
        pg.evaluate("(() => { const k='mcsm:fakecloud:v1'; const db=JSON.parse(localStorage.getItem(k)); db.seasons.mcsm31.state='running'; localStorage.setItem(k, JSON.stringify(db)); Object.keys(localStorage).filter((x) => x.startsWith('mcsm:pc:')).forEach((x) => localStorage.removeItem(x)); })()")
        # admin changes a driver's team for this season
        go(pg, '/szezonok/mcsm31/nevezesek', 'owner', 2600)
        pg.query_selector_all('button.entry-row')[0].click(); pg.wait_for_timeout(700)
        sel = pg.query_selector('.sheet .f-row:has-text("Csapat ebben a szezonban") select')
        before = sel.input_value(); opts = [o.get_attribute('value') for o in sel.query_selector_all('option')]
        target = next(v for v in opts if v and v != before)
        sel.select_option(target); pg.wait_for_timeout(1200)
        pg.goto(BASE + 'tests/'); pg.wait_for_timeout(200)
        saved = pg.evaluate(f"(() => {{ const db = JSON.parse(localStorage.getItem('mcsm:fakecloud:v1')); return Object.values(db.entries.mcsm31).some(e => e.snapshot && e.snapshot.teamId === '{target}'); }})()")
        check(saved, f'{size}: season team saved')
        # delete a user
        go(pg, '/admin/felhasznalok', 'owner', 2200)
        rows = pg.query_selector_all('.row-card, button.person-row')
        rows[-1].click(); pg.wait_for_timeout(800)
        psn = pg.evaluate("(() => { const m = document.querySelector('.sheet').innerText.match(/beírd be a PSN ID-t: (\\S+)/); return null; })()")
        pg.click('.sheet .danger-zone button'); pg.wait_for_timeout(600)
        label = text(pg, '.sheet:last-of-type')
        import re
        m = re.search(r'PSN ID-t: (\S+)', label)
        check(m is not None and pg.is_disabled('.sheet:last-of-type .btn.danger.block'), f'{size}: delete asks for the PSN ID')
        if m:
            pg.fill('.sheet:last-of-type input', m.group(1)); pg.click('.sheet:last-of-type .btn.danger.block'); pg.wait_for_timeout(1500)
            pg.goto(BASE + 'tests/'); pg.wait_for_timeout(200)
            gone = pg.evaluate(f"(() => {{ const db = JSON.parse(localStorage.getItem('mcsm:fakecloud:v1')); return !Object.values(db.users).some(u => u.psn === '{m.group(1)}'); }})()")
            check(gone, f'{size}: user deleted')
        # news: never on the sign-in screen
        pg.evaluate("""() => { const k='mcsm:fakecloud:v1'; const db=JSON.parse(localStorage.getItem(k)); db.content = db.content || {}; db.content.news = { items: [{ id: 'n1', title: 'Hír', body: 'x', carousel: true, at: Date.now() }] }; localStorage.setItem(k, JSON.stringify(db)); Object.keys(localStorage).filter((x) => x.startsWith('mcsm:pc:')).forEach((x) => localStorage.removeItem(x)); sessionStorage.clear(); localStorage.removeItem('mcsm:newsDismissed'); }""")
        pg.goto(BASE + '?fakecloud&so=1#/belepes'); pg.wait_for_timeout(2600)
        check(pg.query_selector('.nc-overlay') is None, f'{size}: no news on the sign-in screen')
        go(pg, '/', 'owner', 2800)
        check(pg.query_selector('.nc-overlay') is not None, f'{size}: news after sign-in')
        if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(400)
        pg.click('.hdr-actions button:last-child'); pg.wait_for_timeout(600)
        check('MCSM v1.' in text(pg, '.sheet') or 'MCSM v0.9.' in text(pg, '.sheet'), f'{size}: version in the menu')
        ctx.close()
    b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
