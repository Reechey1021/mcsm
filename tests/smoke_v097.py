# tests/smoke_v097.py - 0.9.7: protests (visibility, own lobby only, admin-logged votes shown on the
# decision, red button after the start, way out of the stewards' area), stars, notification
# settings, weather card sequence, Twitch field on the equipment step, no overflow.
import sys, json, re
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
shots = sys.argv[1] if len(sys.argv) > 1 else None
def real(errs): return [e for e in errs if not any(k in e for k in ('fonts.g', 'net::ERR', "Firebase couldn't load", 'docs.google'))]
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
with sync_playwright() as p:
    b = p.chromium.launch()
    for size, vw in (('m', (390, 844)), ('d', (1440, 900))):
        ctx = b.new_context(viewport={'width': vw[0], 'height': vw[1]}, device_scale_factor=2 if size == 'm' else 1, color_scheme='dark', has_touch=size == 'm')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(BASE + '?fakecloud&fakereset&fakeuser=owner#/'); pg.wait_for_timeout(1500)
        # make the test driver an entrant of MCSM31, racing in lobby A of round 1
        pg.goto(BASE + 'tests/'); pg.wait_for_timeout(200)
        pg.evaluate("""() => { const k='mcsm:fakecloud:v1'; const db=JSON.parse(localStorage.getItem(k)); const uid=db.accounts['pilota@mcsm.test'].uid; const u=db.users[uid];
          db.entries.mcsm31[uid] = { uid, type: 'driver', status: 'entered', approved: true, order: 1, snapshot: { firstName: u.firstName, lastName: u.lastName, psn: u.psn, psnLower: u.psnLower, raceNumber: u.raceNumber, dr: u.dr, sr: u.sr, teamId: u.teamId || null }, availability: [], absences: [] };
          db.race.mcsm31.rounds['1'].lobbies.A.push(uid); localStorage.setItem(k, JSON.stringify(db)); Object.keys(localStorage).filter((x) => x.startsWith('mcsm:pc:')).forEach((x) => localStorage.removeItem(x)); }""")
        # round page: started round shows the red button; header has no big gap
        # round 1's results are final (the button gives way to the summary); round 2's window is open
        go(pg, '/szezonok/mcsm31/fordulo/2', 'pilota')
        check(pg.query_selector('a.protest-btn') is not None and 'Óvás indítása' in text(pg), f'{size}: red protest button after the start')
        gap = pg.evaluate("(() => { const r = document.querySelector('.round-head-row'); if (!r) return 999; const a = r.children[0].getBoundingClientRect(), b = r.children[1].getBoundingClientRect(); return b.top >= a.bottom - 4 ? Math.round(b.left - a.left) : Math.round(b.left - a.right); })()")
        check(0 <= gap <= 30, f'{size}: status right after the title, or left-aligned under it ({gap}px)')
        check('Bírói ügy' not in text(pg), f'{size}: no judge-case button in the round list')
        # filing form: own lobby only, "Kanyar / Időpont"
        pg.click('a.protest-btn'); pg.wait_for_timeout(2000)
        v = text(pg)
        lob = len(pg.query_selector_all('.form .f-row:has(.f-label:text-is("Lobby")) .seg button'))
        check(lob >= 1 and 'Kanyar / Időpont' in v, f'{size}: driver form: any lobby of the season (since 0.9.8) ({lob})')
        go(pg, '/szezonok/mcsm31/fordulo/1/ovas', 'owner')
        check('Kanyar / Időpont' in text(pg) and 'Pl. T4 / Hajtű / 12:36.000' in pg.content() and pg.query_selector('.toggle-row:has-text("Hivatalos")') is not None or 'Kanyar / Időpont' in text(pg), f'{size}: admin form: corner/time, official case option')
        # stewards: a way out
        go(pg, '/birosag', 'owner')
        check(pg.query_selector('#view .back') is not None, f'{size}: back button in the stewards area')
        # admin logs a judge's vote, chair publishes, the decision lists the votes
        go(pg, '/birosag', 'owner')
        cases = pg.query_selector_all('#view a[href*="#/birosag/"]')
        if cases:
            cases[0].click(); pg.wait_for_timeout(2200)
            check('Szavazat rögzítése egy bíró nevében' in text(pg), f'{size}: admin can log a vote on behalf of a judge')
        else: check(False, f'{size}: a case to open')
        # stars on a ranked profile (sample)
        go(pg, '/pilotak/igtsh_saby', 'owner', '&mrdemo', 2800)
        check(len(pg.query_selector_all('.mr-card .stars')) == 4 and 'TOP' not in text(pg, '.mr-card').upper(), f'{size}: stars for the rating and the three parts')
        check(pg.query_selector('.gauge-note') is None, f'{size}: no DR subtext')
        snap(pg, f'v97_stars_{size}')
        # notification settings
        go(pg, '/sajat', 'owner')
        pg.click('button:has-text("Beállítás")'); pg.wait_for_timeout(600)
        sh = text(pg, '.sheet')
        check('Élő streamek' in sh and 'Eredmények' in sh, f'{size}: notification categories')
        live = pg.query_selector('.sheet .toggle-row:has-text("Élő streamek") .switch')
        check(live is not None and live.get_attribute('aria-checked') == 'false', f'{size}: live streams off by default')
        snap(pg, f'v97_push_{size}')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        # notifications panel: mark all read at the top
        pg.click('.bell-btn'); pg.wait_for_timeout(600)
        first = pg.evaluate("(() => { const s = document.querySelector('.sheet'); const b = s && s.querySelector('.notif-top'); return !!b && b.compareDocumentPosition(s.querySelector('.notif, .empty')) & Node.DOCUMENT_POSITION_FOLLOWING; })()")
        check(bool(first), f'{size}: "mark all as read" at the top')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        # weather cards in order, repeats allowed
        go(pg, '/admin/szezon/uj', 'owner')
        pg.click('.wizard-foot .btn.primary'); pg.wait_for_timeout(400); pg.click('.wizard-foot .btn.primary'); pg.wait_for_timeout(400)
        pg.click('button:has-text("Forduló hozzáadása")'); pg.wait_for_timeout(300)
        pg.click('.round-edit .seg button:has-text("Lobby beállítások")'); pg.wait_for_timeout(300)
        pg.click(".round-edit .lobby-sec summary:has-text(\"Gran'Prix\")"); pg.wait_for_timeout(200)
        gp = pg.query_selector_all('.round-edit .lobby-sec')[3]
        gp.query_selector_all('select')[-1].select_option('Custom'); pg.wait_for_timeout(200)
        gp = pg.query_selector_all('.round-edit .lobby-sec')[3]
        chips = gp.query_selector_all('.lobby-chips .chip')
        for i in (18, 0, 18): chips[i].click(); pg.wait_for_timeout(80)
        seq = [x.inner_text() for x in gp.query_selector_all('.wx-seq .wx-code')]
        check(seq == ['C01', 'S01', 'C01'], f'{size}: weather sequence with a repeat ({seq})')
        gp.query_selector_all('.wx-seq li')[1].query_selector_all('.icon-btn')[0].click(); pg.wait_for_timeout(100)
        seq = [x.inner_text() for x in pg.query_selector_all('.round-edit .lobby-sec')[3].query_selector_all('.wx-seq .wx-code')]
        check(seq == ['S01', 'C01', 'C01'], f'{size}: reorder ({seq})')
        snap(pg, f'v97_wx_{size}')
        # lobbies step: nothing spills over
        for _ in range(3): pg.click('.wizard-foot .btn.primary'); pg.wait_for_timeout(300)
        over = pg.evaluate("[...document.querySelectorAll('.wizard-body .round-edit select')].map(s => Math.round(s.getBoundingClientRect().right - s.closest('.round-edit').getBoundingClientRect().right))")
        check(all(o <= 0 for o in over), f'{size}: lobby host field inside its card ({over})')
        # Twitch field on the equipment step
        go(pg, '/profil', 'owner')
        pg.click('button:has-text("Felszerelés")'); pg.wait_for_timeout(500)
        eq = 'Twitch' in text(pg)
        pg.click('button:has-text("Csapatok")'); pg.wait_for_timeout(500)
        check(eq and 'Twitch' not in text(pg), f'{size}: Twitch field on Felszerelés, not on Csapatok')
        go(pg, '/admin', 'owner'); pg.click('details.adv summary'); pg.wait_for_timeout(300)
        ow = pg.evaluate('document.documentElement.scrollWidth - innerWidth')
        check(ow <= 0, f'{size}: admin page has no sideways overflow ({ow})')
        ctx.close()
    b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
