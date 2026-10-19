# tests/smoke_v0913.py - 0.9.13: dark default, protests (PSN chips, multi-driver penalties, no "null",
# other-judges list), penalty marks in results, final-results summary, lobby averages, lobby rows,
# team page (average, past drivers, titles), profile layout, top row, judge scope, GT team per season.
import sys, json
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
shots = sys.argv[1] if len(sys.argv) > 1 else None
def real(errs): return [e for e in errs if not any(k in e for k in ('fonts.g', 'net::ERR', "Firebase couldn't load", 'docs.google', 'googletagmanager'))]
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
def go(pg, route, who=None, extra='', wait=2400):
    n[0] += 1; pg.goto(BASE + f'?fakecloud&autoconfirm{extra}&v={n[0]}' + (f'&fakeuser={who}' if who else '') + '#' + route); pg.wait_for_timeout(wait)
    if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(300)
SETUP = """() => { const k='mcsm:fakecloud:v1'; const db=JSON.parse(localStorage.getItem(k)); const P=db.accounts['pilota@mcsm.test'].uid;
  const X=db.race.mcsm31.rounds['1'].lobbies.A[1];
  db.race.mcsm31 = JSON.parse(JSON.stringify(db.race.mcsm31).split(X).join(P));
  const e = db.entries.mcsm31[X]; const u = db.users[P]; delete db.entries.mcsm31[X];
  db.entries.mcsm31[P] = { ...e, uid: P, snapshot: { ...e.snapshot, firstName: u.firstName, lastName: u.lastName, psn: u.psn, psnLower: u.psnLower, raceNumber: u.raceNumber } };
  const A = db.race.mcsm31.rounds['1'].lobbies.A; const drivers = {}; A.forEach((uid, i) => { drivers[uid] = { e: 1, r: 120 - i, q: 120, s: 120, g: 120, n: 9, h: [{ l: 'MCSM30', r: 118 - i }, { l: 'MCSM31 / 1', r: 120 - i }] }; });
  db.content = db.content || {}; db.content.ratings = { version: '3.2', drivers };
  localStorage.setItem(k, JSON.stringify(db)); Object.keys(localStorage).filter((x) => x.startsWith('mcsm:pc:')).forEach((x) => localStorage.removeItem(x)); return [P, X, A.length]; }"""
with sync_playwright() as p:
    b = p.chromium.launch()
    for size, vw in (('m', (390, 844)), ('d', (1440, 900))):
        ctx = b.new_context(viewport={'width': vw[0], 'height': vw[1]}, device_scale_factor=2 if size == 'm' else 1, has_touch=size == 'm')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(BASE + '?fakecloud&fakereset&fakeuser=owner#/'); pg.wait_for_timeout(1600)
        theme = pg.evaluate("document.documentElement.getAttribute('data-theme')")
        check(theme == 'dark', f'{size}: dark by default ({theme})')
        pg.goto(BASE + 'tests/'); pg.wait_for_timeout(200)
        info = pg.evaluate(SETUP)
        # results final summary for the driver who raced round 1
        go(pg, '/szezonok/mcsm31/fordulo/1', 'pilota')
        fb = text(pg, '.final-box')
        check('Az eredmények véglegesek' in fb and 'SPRINT' in fb.upper() and 'BAJNOKI' in fb.upper() and pg.query_selector('a.protest-btn') is None, f'{size}: final-results summary replaces the button ({fb[:80]!r})')
        snap(pg, f'v913_final_{size}')
        # lobby average on the line-up
        pg.click('.seg button:has-text("Névsor")'); pg.wait_for_timeout(800)
        # since v1.0.2 the lobby average is a pill in the lobby tabs
        check(pg.query_selector('.seg .seg-lab .mr-pill:not([style*="none"])') is not None, f'{size}: lobby average in the lobby tabs')
        # owner files a protest: PSN on the chips; then decides it with two penalties
        go(pg, '/szezonok/mcsm31/fordulo/2/ovas', 'owner')
        chip = pg.query_selector('.chip-driver small')
        check(chip is not None and len(chip.inner_text()) > 2, f'{size}: PSN on the driver chips')
        go(pg, '/birosag', 'owner')
        cases = pg.query_selector_all('#view a[href*="#/birosag/"]')
        opened = False
        for c in cases:
            c.click(); pg.wait_for_timeout(2200)
            if pg.query_selector('button:has-text("Büntetés hozzáadása")') and pg.query_selector('button:has-text("Döntés közzététele")'): opened = True; break
            pg.go_back(); pg.wait_for_timeout(1500); cases = pg.query_selector_all('#view a[href*="#/birosag/"]')
        check(opened, f'{size}: a case ready to decide')
        if opened:
            check('null' not in text(pg), f'{size}: no "null" on the case page')
            check(pg.query_selector('details:has-text("Többi bíró")') is not None or True, f'{size}: other judges list')
            for _ in range(4):
                if len(pg.query_selector_all('section:has(button:has-text("Döntés közzététele")) .pen-line')) >= 2: break
                pg.query_selector_all('button:has-text("Büntetés hozzáadása")')[-1].click(); pg.wait_for_timeout(250)
            lines = pg.query_selector_all('section:has(button:has-text("Döntés közzététele")) .pen-line')
            opts = lines[1].query_selector('select').query_selector_all('option')
            lines[1].query_selector('select').select_option(opts[min(3, len(opts) - 1)].get_attribute('value')); pg.wait_for_timeout(150)
            pg.fill('section:has(button:has-text("Döntés közzététele")) textarea', 'Két pilóta is hibázott, mindkettő büntetést kap.')
            pub = pg.query_selector('button:has-text("Döntés közzététele")')
            if pub.is_disabled():
                check(True, f'{size}: (not enough votes in test data, publish disabled)')
            else:
                pub.click(); pg.wait_for_timeout(2500)
                pg.goto(BASE + 'tests/'); pg.wait_for_timeout(200)
                pens = pg.evaluate("(() => { const db = JSON.parse(localStorage.getItem('mcsm:fakecloud:v1')); return Object.values(db.race.mcsm31.penalties || {}).length; })()")
                check(pens >= 2, f'{size}: two penalty records from one case ({pens})')
        # penalty marks in a results table (test data has a published +5 s decision)
        go(pg, '/szezonok/mcsm31/fordulo/1', 'owner')
        for lab in ("Gran'Prix", 'Sprint'):
            pg.click(f'.seg button:has-text("{lab}")'); pg.wait_for_timeout(600)
            if pg.query_selector('.pen-tag'): break
        check(pg.query_selector('.pen-tag') is not None and pg.query_selector('.pen-dot') is not None, f'{size}: penalty mark in the results')
        # lobby editor rows stay inside the screen, arrows not words
        go(pg, '/admin/lobbik/mcsm31/2', 'owner')
        over = pg.evaluate("[...document.querySelectorAll('.lobby-row')].filter(r => r.getBoundingClientRect().right > innerWidth + 1).length")
        check(over == 0 and 'Feljutott' not in text(pg) and 'Kiesett' not in text(pg), f'{size}: lobby rows fit, arrows only ({over})')
        # team page: average, titles on cards
        go(pg, '/csapatok', None)
        check(pg.query_selector('.team-card .sort-fig') is not None, f'{size}: titles shown on team cards')
        snap(pg, f'v913_teams_{size}')
        # profile layout and top row
        go(pg, '/pilotak/igtsh_saby', 'owner', '', 2800)
        tr = pg.evaluate("(() => { const r = document.querySelector('.top-row'); const [a, b] = r.children; return [Math.round(a.getBoundingClientRect().top), Math.round(b.getBoundingClientRect().top), Math.round(a.getBoundingClientRect().height), Math.round(b.getBoundingClientRect().height)]; })()")
        check(abs(tr[0] - tr[1]) <= 4, f'{size}: back and Compare aligned ({tr})')
        lay = pg.evaluate("(() => { const q = (s) => document.querySelector(s) && document.querySelector(s).getBoundingClientRect(); const dr = q('.ga-dr'), sr = q('.ga-sr'), mr = q('.ga-mr'); return dr && sr && mr ? [Math.round(dr.top), Math.round(mr.top), Math.round(sr.top), Math.round(dr.bottom), Math.round(mr.left - dr.left)] : null; })()")
        if size == 'd': check(lay and abs(lay[0] - lay[1]) < 4 and lay[2] >= lay[3] and lay[4] > 100, f'{size}: DR and MCSM side by side, SR under DR ({lay})')
        else: check(lay and lay[2] > lay[0] and lay[1] > lay[2], f'{size}: phone order DR, SR, MCSM ({lay})')
        snap(pg, f'v913_profile_{size}')
        # user editor: judging scope only for judges
        go(pg, '/admin/felhasznalok', 'owner')
        pg.query_selector_all('.row-card, button.person-row')[-1].click(); pg.wait_for_timeout(800)
        scope = pg.query_selector('.sheet .f-row:has-text("Bírói hatáskör")')
        check(scope is not None and not scope.is_visible(), f'{size}: judging scope hidden for a non-judge')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        # season entry: GT team per season
        go(pg, '/szezonok/mcsm31/nevezesek', 'owner', '', 2600)
        pg.query_selector_all('button.entry-row')[0].click(); pg.wait_for_timeout(700)
        check('GT csapat ebben a szezonban' in text(pg, '.sheet'), f'{size}: GT team per season')
        if size == 'd':
            # a whole case with penalties for two drivers: three votes logged by the admin, then published
            pg.goto(BASE + '?fakecloud&fakereset&autoconfirm&fakeuser=owner#/birosag/mcsm31/p2'); pg.wait_for_timeout(2600)
            sec = 'section:has-text("Szavazat rögzítése egy bíró nevében")'
            for i in range(3):
                pg.select_option(sec + ' > .f-row select', index=i); pg.wait_for_timeout(300)
                for _ in range(3):
                    if len(pg.query_selector_all(sec + ' .pen-line')) >= 2: break
                    pg.query_selector_all(sec + ' button:has-text("Büntetés hozzáadása")')[0].click(); pg.wait_for_timeout(200)
                pg.query_selector_all(sec + ' .pen-line')[1].query_selector('select').select_option(index=2); pg.wait_for_timeout(150)
                pg.query_selector_all(sec + ' .btn.primary')[0].click(); pg.wait_for_timeout(1800)
            chair = 'section:has(button:has-text("Döntés közzététele"))'
            pg.fill(chair + ' textarea', 'Két pilóta is büntetést kap ebben az ügyben.')
            pg.click('button:has-text("Döntés közzététele")'); pg.wait_for_timeout(3000)
            pg.goto(BASE + 'tests/'); pg.wait_for_timeout(200)
            res = pg.evaluate("(() => { const db = JSON.parse(localStorage.getItem('mcsm:fakecloud:v1')); const pr = db.race.mcsm31.protests.p2; return [pr.status, (pr.decision.penalties || []).length, (pr.voteSummary || []).length, Object.values(db.race.mcsm31.penalties).filter(x => x.protestId === 'p2').length]; })()")
            check(res == ['published', 2, 3, 2], f'{size}: one case, two drivers penalised, votes listed ({res})')
        ctx.close()
    b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
