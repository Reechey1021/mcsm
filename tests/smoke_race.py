# tests/smoke_race.py - phase 3 walk-through: standings, round pages, PQ, lobbies, results entry.
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
def go(pg, route, who=None, wait=1500):
    pg.goto(BASE + '?fakecloud' + (f'&fakeuser={who}' if who else '') + '#' + route); pg.wait_for_timeout(wait)
with sync_playwright() as p:
    b = p.chromium.launch()
    for size, vw in (('m', (390, 844)), ('d', (1440, 900))):
        ctx = b.new_context(viewport={'width': vw[0], 'height': vw[1]}, device_scale_factor=2 if size == 'm' else 1, color_scheme='dark', has_touch=size == 'm')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(BASE + '?fakecloud&fakereset#/'); pg.wait_for_timeout(2200)
        check('Bajnoki állás' in text(pg), f'{size}: home shows standings')
        snap(pg, f'p3_home_{size}')
        # standings
        go(pg, '/eredmenyek')
        check(len(pg.query_selector_all('.tower li')) >= 47, f'{size}: standings rows')
        pg.click('.tower-tools button:has-text("Csapat")'); pg.wait_for_timeout(900)
        check(len(pg.query_selector_all('.tower li')) >= 20, f'{size}: team standings')
        pg.click('.tower-tools button:has-text("MGTK")'); pg.wait_for_timeout(900)
        n_mgtk = len(pg.query_selector_all('.tower li'))
        check(10 < n_mgtk < 40, f'{size}: MGTK filtered ({n_mgtk})')
        pg.click('.tower-tools button:has-text("Egyéni")'); pg.wait_for_timeout(700)
        pg.click('button[aria-label="Visszajátszás"]'); pg.wait_for_timeout(1000)
        snap(pg, f'p3_replay_{size}'); pg.wait_for_timeout(1400)
        check('2. forduló után' in text(pg), f'{size}: replay ends on latest round')
        # round page
        go(pg, '/szezonok/mcsm31/fordulo/2')
        check(pg.query_selector('.rtable') is not None and 'Ideiglenes' in text(pg), f'{size}: round 2 results provisional')
        pg.click('.seg button:has-text("Kvalifikáció")'); pg.wait_for_timeout(500)
        check(len(pg.query_selector_all('.rtable tbody tr')) == 16, f'{size}: 16 rows in quali')
        pg.click('.seg button:has-text("GP rajtrács")'); pg.wait_for_timeout(500)
        check(len(pg.query_selector_all('.grid-slot')) == 16, f'{size}: GP grid')
        snap(pg, f'p3_round2_{size}')
        # PQ tab
        go(pg, '/szezonok/mcsm31/pq', wait=1800)
        check(len(pg.query_selector_all('.tower li .trow')) == 47 and len(pg.query_selector_all('.pq-cut')) == 2, f'{size}: PQ ranking with cuts')
        snap(pg, f'p3_pq_{size}')
        # driver profile has results
        go(pg, '/pilotak/mgtk_dudu', wait=2200)
        check('MCSM31' in text(pg) and pg.query_selector('.rtable') is not None, f'{size}: driver results table')
        # ---- owner ----
        go(pg, '/szezonok/mcsm31/fordulo/2', 'owner')
        check('Forduló kezelése' in text(pg), f'{size}: admin round card')
        pg.click('button:has-text("Véglegesítés")'); pg.wait_for_timeout(1800)
        check('Végleges' in text(pg), f'{size}: round 2 made final')
        # lobby editor for round 3
        go(pg, '/szezonok/mcsm31/fordulo/3?szerk=lobbyk', 'owner')
        pg.click('button:has-text("Javaslat az előző forduló alapján")'); pg.wait_for_timeout(1200)
        check(len(pg.query_selector_all('.row-card')) >= 47, f'{size}: lobby proposal rows')
        pg.query_selector_all('.row-card')[0].click(); pg.wait_for_timeout(700)
        pg.click('.sheet .menu-item:has-text("Áthelyezés: B lobby")'); pg.wait_for_timeout(1200)
        check('A: 15' in text(pg, '.entry-bar'), f'{size}: moved a driver ({text(pg, ".entry-bar")!r})')
        snap(pg, f'p3_lobbies_{size}')
        pg.click('.entry-bar .btn.primary'); pg.wait_for_timeout(2000)
        check('#/szezonok/mcsm31/fordulo/3' in pg.url and 'szerk' not in pg.url, f'{size}: lobbies saved')
        # results entry: round 3, lobby A, qualifying
        go(pg, '/admin/eredmeny/mcsm31/3/A/Q', 'owner')
        pg.click('button:has-text("Rajtsorrend szerint")'); pg.wait_for_timeout(2000)
        check('15 / 15' in text(pg, '.entry-bar'), f'{size}: all placed ({text(pg, ".entry-bar")[:40]!r})')
        pg.click('.seg button:has-text("Köridők")'); pg.wait_for_timeout(500)
        ins = pg.query_selector_all('.time-row input')
        for i, el in enumerate(ins): el.fill(f'1:5{1 + i // 10}.{(i % 10) * 50 + 123:03d}'); el.dispatch_event('change')
        pg.wait_for_timeout(300)
        snap(pg, f'p3_entry_times_{size}')
        check('hiányzik' not in text(pg, '.entry-bar').lower(), f'{size}: lap sheet complete ({text(pg, ".entry-bar")!r})')
        pg.click('.entry-bar .btn.primary'); pg.wait_for_timeout(2200)
        check('fordulo/3' in pg.url, f'{size}: back on round page after save')
        # sprint via paste
        go(pg, '/admin/eredmeny/mcsm31/3/A/S', 'owner')
        pg.click('button:has-text("Rajtsorrend szerint")'); pg.wait_for_timeout(2000)
        pg.click('.seg button:has-text("Idők")'); pg.wait_for_timeout(500)
        ins = pg.query_selector_all('.time-row input')
        ins[0].fill('20:13.400'); ins[0].dispatch_event('change')
        k = 1
        for i in range(1, len(ins)):
            v = f'+{i // 2 * 1.5 + 0.4:.3f}' if i % 2 == 0 else f'1:58.{i:03d}'
            ins[i].fill(v if i % 2 == 0 else f'1:58.{i:03d}'); ins[i].dispatch_event('change')
        pg.wait_for_timeout(300)
        pg.click('.entry-bar .btn.primary'); pg.wait_for_timeout(2200)
        check('fordulo/3' in pg.url, f'{size}: sprint saved')
        go(pg, '/szezonok/mcsm31/fordulo/3', 'owner')
        check('piszk.' in text(pg), f'{size}: draft sheets shown to staff')
        check('Közzétételhez' in text(pg), f'{size}: publish needs all sheets')
        snap(pg, f'p3_round3_admin_{size}')
        # PQ entry
        go(pg, '/admin/pq/mcsm31/pq1', 'owner')
        before = len(pg.query_selector_all('.row-card'))
        pg.query_selector_all('.row-card button[aria-label="Törlés"]')[0].click(); pg.wait_for_timeout(500)
        check(len(pg.query_selector_all('.row-card')) == before - 1, f'{size}: PQ time removed')
        opts = pg.eval_on_selector('select', 'el => [...el.options].filter(o => o.value && !o.disabled).map(o => o.value)')
        check(len(opts) >= 1, f'{size}: freed driver selectable')
        if opts:
            pg.select_option('select', opts[0]); pg.fill('input[inputmode=decimal]', '1:59.999'); pg.click('button:has-text("Hozzáadás")'); pg.wait_for_timeout(600)
        check(len(pg.query_selector_all('.row-card')) == before, f'{size}: PQ time re-added')
        pg.click('.entry-bar .btn.primary'); pg.wait_for_timeout(1800)
        # driver cannot open entry screens
        go(pg, '/admin/eredmeny/mcsm31/3/A/Q', 'pilota')
        check('jogosultságod' in text(pg), f'{size}: results entry forbidden for drivers')
        ow = pg.evaluate('document.documentElement.scrollWidth - innerWidth')
        check(ow <= 0, f'{size}: no horizontal overflow ({ow})')
        ctx.close()
    b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
