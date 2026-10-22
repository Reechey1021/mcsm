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
        check('nevezői láthatják' in text(pg) and 'Kitolás a 4-es kanyarban' not in text(pg), f'{size}: protests hidden from visitors')
        go(pg, '/szezonok/mcsm31/ovasok', 'owner')
        check('Kitolás a 4-es kanyarban' in text(pg) and '+5 mp' in text(pg), f'{size}: published decision visible to staff')
        snap(pg, f'p4_decisions_{size}')
        go(pg, '/szezonok/mcsm31/fordulo/1', 'owner')
        check('Döntés közzétéve' in text(pg), f'{size}: decision on round page')
        # admin adds pilota to MCSM31 so they can file
        go(pg, '/szezonok/mcsm31/nevezesek', 'owner')
        pg.click('button:has-text("Pilóta hozzáadása")'); pg.wait_for_timeout(1200)
        pg.fill('.sheet input[type=search]', 'teszt'); pg.wait_for_timeout(400)
        pg.query_selector_all('.sheet .row-card')[0].click(); pg.wait_for_timeout(1800)
        # pilota races in round 2, lobby A (only affected drivers can protest)
        pg.goto(BASE + 'tests/'); pg.wait_for_timeout(200)
        pg.evaluate("""() => { const k='mcsm:fakecloud:v1'; const db=JSON.parse(localStorage.getItem(k)); const uid=db.accounts['pilota@mcsm.test'].uid; const L=db.race.mcsm31.rounds['2'].lobbies.A; if (!L.includes(uid)) L.push(uid); localStorage.setItem(k, JSON.stringify(db)); Object.keys(localStorage).filter((x) => x.startsWith('mcsm:pc:')).forEach((x) => localStorage.removeItem(x)); }""")
        # pilota files a protest on round 2 (window extended in test data)
        go(pg, '/szezonok/mcsm31/fordulo/2', 'pilota')
        check(pg.query_selector('a.protest-btn') is not None, f'{size}: red protest button shown once the round started')
        pg.click('a.protest-btn'); pg.wait_for_timeout(1500)
        pg.click('.wizard-body .chip >> nth=0') if pg.query_selector('.wizard-body .chip') else None
        pg.click('button:has-text("Óvás benyújtása")'); pg.wait_for_timeout(700)
        check(pg.query_selector('[aria-invalid="true"]') is not None or 'érintett' in text(pg).lower(), f'{size}: form validates')
        check('Panaszos' not in text(pg) and 'Videó link (opcionális)' in text(pg), f'{size}: no complainant picker; video link marked optional')
        n_all = len(pg.query_selector_all('.choice.multi .chip-driver'))
        pg.fill('.form input[type=search]', 'kindó'); pg.wait_for_timeout(300)
        n_found = len(pg.query_selector_all('.choice.multi .chip-driver'))
        check(n_all > 30 and 1 <= n_found < 4, f'{size}: involved drivers: anyone, with a search ({n_all} -> {n_found})')
        pg.fill('.form input[type=search]', ''); pg.wait_for_timeout(200)
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
        # owner (admin): open p2 and close it with a penalty; no panel or votes anywhere
        go(pg, '/birosag', 'owner', 2500)
        check('Rajt utáni érintkezés' in text(pg), f'{size}: case list')
        snap(pg, f'p4_cases_{size}')
        go(pg, '/birosag/mcsm31/p2', 'owner', 2200)
        target = re.search(r'Érintett: ([^.]+)\.', text(pg))
        target = target.group(1).split()[0] if target else ''
        check(bool(target), f'{size}: case shows involved driver')
        check('szavazat' not in text(pg).lower() and 'Testület' not in text(pg) and pg.query_selector('button:has-text("Ügy lezárása")') is not None, f'{size}: no panel or votes, just "Ügy lezárása"')
        # the result before closing
        go(pg, '/szezonok/mcsm31/fordulo/2', None, 1800)
        pg.click('.seg button:has-text("A lobby")'); pg.click('.seg button:has-text("Sprint")'); pg.wait_for_timeout(600)
        before = sprint_row(pg, target)
        go(pg, '/birosag/mcsm31/p2', 'owner', 2200)
        pg.click('button:has-text("Büntetés hozzáadása")'); pg.wait_for_timeout(400)
        pg.click('.pen-line .chip:has-text("+3 s")'); pg.wait_for_timeout(200)
        pg.click('button:has-text("Ügy lezárása")'); pg.wait_for_timeout(2400)
        check('A döntés nyilvános' in text(pg) and pg.query_selector('button:has-text("Ügy újranyitása")') is not None, f'{size}: case closed without an explanation (optional)')
        go(pg, '/szezonok/mcsm31/fordulo/2', None, 1800)
        pg.click('.seg button:has-text("A lobby")'); pg.click('.seg button:has-text("Sprint")'); pg.wait_for_timeout(600)
        after = sprint_row(pg, target)
        check(before and after and before != after, f'{size}: penalty changed the sprint result ({before!r} -> {after!r})')
        check('+3 mp' in text(pg), f'{size}: decision listed on round page')
        pg.goto(BASE + 'tests/'); pg.wait_for_timeout(150)
        told = pg.evaluate("""() => { const db = JSON.parse(localStorage.getItem('mcsm:fakecloud:v1')); const p = db.race.mcsm31.protests.p2;
          const pen = Object.values(db.race.mcsm31.penalties || {}).filter((x) => x.protestId === 'p2').map((x) => x.uid);
          const ns = Object.values(db.notifications || {}).filter((n) => JSON.stringify(n).includes('decision'));
          const got = new Set(ns.flatMap((n) => n.uids || []));
          const want = [p.by, ...(p.involved || []), ...pen].filter(Boolean);
          return [want.every((u) => got.has(u)), want.length]; }""")
        check(told[0] and told[1] >= 2, f'{size}: filer, involved and penalised drivers notified ({told})')
        # a judge (Bíró) can't close a case they're involved in, but can close others; the old judge role has no access
        pg.goto(BASE + 'tests/'); pg.wait_for_timeout(150)
        pg.evaluate("""() => { const k = 'mcsm:fakecloud:v1'; const db = JSON.parse(localStorage.getItem(k)); const r = db.race.mcsm31;
          const P = db.accounts['pilota@mcsm.test'].uid, O = db.accounts['owner@mcsm.test'].uid;
          db.users[P].roles = { judgeChair: true };   // pilota is a judge (Bíró) for these checks
          r.protests.j1 = { id: 'j1', no: 901, n: 2, L: 'A', S: 'GP', title: 'Bírót érintő ügy', description: 'A bíró is érintett ebben az esetben, nem zárhatja le.', involved: [P], by: O, type: 'driver', status: 'filed', createdAt: Date.now() };
          r.protests.j2 = { id: 'j2', no: 902, n: 2, L: 'A', S: 'GP', title: 'Másik ügy', description: 'Ebben a bíró nem érintett, lezárhatja.', involved: [db.race.mcsm31.rounds['2'].lobbies.A[3]], by: O, type: 'driver', status: 'filed', createdAt: Date.now() };
          localStorage.setItem(k, JSON.stringify(db)); }""")
        go(pg, '/birosag/mcsm31/j1', 'pilota', 2200)
        check('nem zárhatod le' in text(pg) and pg.query_selector('button:has-text("Ügy lezárása")') is None, f'{size}: a judge cannot close a case they are involved in')
        go(pg, '/birosag/mcsm31/j2', 'pilota', 2200)
        check(pg.query_selector('button:has-text("Ügy lezárása")') is not None, f'{size}: a judge can close someone else\'s case')
        pg.goto(BASE + 'tests/'); pg.wait_for_timeout(150)
        pg.evaluate("() => { const k = 'mcsm:fakecloud:v1'; const db = JSON.parse(localStorage.getItem(k)); db.users[db.accounts['pilota@mcsm.test'].uid].roles = { judge: true }; localStorage.setItem(k, JSON.stringify(db)); }")
        go(pg, '/birosag', 'pilota', 1800)
        check('jogosultságod' in text(pg), f'{size}: the old judge role has no access')
        # judge scope in admin
        go(pg, '/admin/felhasznalok', 'owner')
        pg.fill('input[type=search]', 'birgés'); pg.wait_for_timeout(500)
        pg.query_selector_all('.row-card')[0].click(); pg.wait_for_timeout(900)
        check('Bírói hatáskör' not in text(pg, '.sheet') and 'Bíró' in text(pg, '.sheet') and 'Bírói elnök' not in text(pg, '.sheet'), f'{size}: no judging scope; the role is "Bíró"')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        ow = pg.evaluate('document.documentElement.scrollWidth - innerWidth')
        check(ow <= 0, f'{size}: no horizontal overflow ({ow})')
        ctx.close()
    b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
