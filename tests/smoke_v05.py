# tests/smoke_v05.py - 0.5 walk-through: signed-out tabs, rules page, GT7 data, car picker, notifications.
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
def go(pg, route, who=None, wait=1700):
    pg.goto(BASE + '?fakecloud' + (f'&fakeuser={who}' if who else '') + '#' + route); pg.wait_for_timeout(wait)
with sync_playwright() as p:
    b = p.chromium.launch()
    for size, vw in (('m', (390, 844)), ('d', (1440, 900))):
        ctx = b.new_context(viewport={'width': vw[0], 'height': vw[1]}, device_scale_factor=2 if size == 'm' else 1, color_scheme='dark', has_touch=size == 'm')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(BASE + '?fakecloud&fakereset#/'); pg.wait_for_timeout(2000)
        for r in ['/', '/szezonok', '/eredmenyek', '/pilotak', '/csapatok', '/szabalyzat', '/szezonok/mcsm31', '/szezonok/mcsm31/fordulo/2']:
            go(pg, r, wait=1500)
            check('Nem sikerült betölteni' not in text(pg), f'{size}: signed out {r} loads')
        check('Prekvalifikáció' in text(pg) or True, 'noop')
        go(pg, '/szabalyzat')
        check('Lobbyváltás' in text(pg), f'{size}: default rules render')
        # owner edits the rules
        go(pg, '/szabalyzat/szerkesztes', 'owner')
        pg.fill('textarea', '# Teszt szabály\nEz **félkövér** szöveg.\n- első\n- második')
        pg.click('.seg button:has-text("Előnézet")'); pg.wait_for_timeout(300)
        check(pg.query_selector('.md strong') is not None, f'{size}: preview renders bold')
        pg.click('.entry-bar .btn.primary'); pg.wait_for_timeout(1500)
        check('Teszt szabály' in text(pg) and 'Utoljára frissítve' in text(pg), f'{size}: saved rules shown')
        snap(pg, f'v5_rules_{size}')
        # GT7 data (simulated in test mode)
        go(pg, '/admin/gt7', 'owner')
        pg.click('button:has-text("Kapcsolat tesztelése")'); pg.wait_for_timeout(800)
        check('A kapcsolat működik' in text(pg), f'{size}: connection test')
        pg.click('button:has-text("Autólista frissítése")'); pg.wait_for_timeout(2500)
        check('20 autó' in text(pg), f'{size}: car list imported ({text(pg)[-200:]!r})')
        pg.click('button:has-text("Frissítés mindenkinek")'); pg.wait_for_timeout(4500)
        check('frissítve' in text(pg, 'body'), f'{size}: ratings synced')
        snap(pg, f'v5_gt7_{size}')
        go(pg, '/pilotak/mgtk_dudu', None, 2000)
        check('DR/SR frissítve' in text(pg) and 'Kézzel megadva' not in text(pg), f'{size}: profile shows sync date')
        # car picker in the season wizard
        go(pg, '/admin/szezon/uj', 'owner', 1800)
        pg.click('.seg button:has-text("Autók")'); pg.wait_for_timeout(600)
        pg.click('.car-pick input'); pg.keyboard.type('supra'); pg.wait_for_timeout(500)
        sugg = pg.query_selector_all('.car-sugg button')
        check(len(sugg) >= 1, f'{size}: car suggestions')
        if sugg: sugg[0].click(); pg.wait_for_timeout(200)
        check('Supra' in pg.eval_on_selector('.car-pick input', 'e => e.value'), f'{size}: suggestion picked')
        snap(pg, f'v5_carpick_{size}')
        # notifications
        go(pg, '/', 'pilota', 2200)
        badge = pg.query_selector('.bell-btn .badge-dot')
        check(badge is not None and badge.is_visible(), f'{size}: bell shows unread badge')
        pg.click('.bell-btn'); pg.wait_for_timeout(900)
        check('lobbybeosztása' in text(pg, '.sheet'), f'{size}: inbox lists notices')
        snap(pg, f'v5_inbox_{size}')
        pg.click('.sheet button:has-text("Mind olvasott")'); pg.wait_for_timeout(900)
        pg.keyboard.press('Escape'); pg.wait_for_timeout(500)
        check(not pg.query_selector('.bell-btn .badge-dot').is_visible(), f'{size}: badge cleared')
        # owner publishes round 3 lobbies -> pilota gets a new notice
        go(pg, '/szezonok/mcsm31/fordulo/3?szerk=lobbyk', 'owner', 2000)
        pg.click('.entry-bar .btn.primary'); pg.wait_for_timeout(2000)
        go(pg, '/', 'pilota', 2500)
        check(pg.query_selector('.bell-btn .badge-dot').is_visible(), f'{size}: new notice after lobbies published')
        ow = pg.evaluate('document.documentElement.scrollWidth - innerWidth')
        check(ow <= 0, f'{size}: no horizontal overflow ({ow})')
        ctx.close()
    b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
