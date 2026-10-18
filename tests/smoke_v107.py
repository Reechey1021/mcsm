# tests/smoke_v107.py - round page "Összesítés" tab: the lobby's drivers by their points that round.
import json
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
def real(errs): return [e for e in errs if not any(k in e for k in ('fonts.g', 'net::ERR', "Firebase couldn't load", 'docs.google', 'googletagmanager'))]
fails, passes, errs = [], 0, []
def check(c, m):
    global passes
    if c: passes += 1
    else: fails.append(m)
ROWS = """(() => [...document.querySelectorAll('.tower .trow')].map((r) => ({ pos: +r.querySelector('.pos').textContent, pts: +r.querySelector('.pts b').textContent.replace(/\\s/g, ''),
  cols: [...r.querySelectorAll('.cols span')].map((c) => (c.textContent === '–' ? 0 : +c.textContent.replace(/\\s/g, ''))), lobby: !!r.querySelector('.pts .lobby') })))()"""
with sync_playwright() as p:
    b = p.chromium.launch()
    for size, vw in (('m', (390, 844)), ('d', (1440, 900))):
        pg = b.new_page(viewport={'width': vw[0], 'height': vw[1]})
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(BASE + '?fakecloud&fakereset#/szezonok/mcsm31/fordulo/1'); pg.wait_for_timeout(2800)
        tabs = [x.inner_text() for x in pg.query_selector_all('.seg button') if x.inner_text() in ('Kvalifikáció', 'Sprint', "Gran'Prix", 'Összesítés', 'GP rajtrács', 'Névsor')]
        check(tabs[:6] == ['Kvalifikáció', 'Sprint', "Gran'Prix", 'Összesítés', 'GP rajtrács', 'Névsor'], f'{size}: tab after GP ({tabs})')
        for L in ('A', 'B'):
            pg.click(f'.seg button:has-text("{L} lobby")'); pg.wait_for_timeout(500)
            pg.click('.seg button:has-text("Összesítés")'); pg.wait_for_timeout(1500)
            rows = pg.evaluate(ROWS)
            lobby_n = pg.evaluate(f"(() => {{ const db = JSON.parse(localStorage.getItem('mcsm:fakecloud:v1')); return db.race.mcsm31.rounds['1'].lobbies['{L}'].length; }})()")
            check(len(rows) == lobby_n and [r['pos'] for r in rows] == list(range(1, len(rows) + 1)), f'{size} {L}: every driver of the lobby, positions 1..{lobby_n} ({len(rows)})')
            check([r['pts'] for r in rows] == sorted([r['pts'] for r in rows], reverse=True), f'{size} {L}: ranked by round points')
            if size == 'd':
                check(all(sum(r['cols']) == r['pts'] for r in rows), f'{size} {L}: Kv. + Sprint + GP + FL = total')
                check([x.inner_text() for x in pg.query_selector_all('.tower-head .cols span')] == ['Kv.', 'Sprint', 'GP', 'FL'], f'{size} {L}: breakdown columns')
            else:
                check(pg.query_selector('.tower .rb-mini') is not None and pg.query_selector('.tower .rb-mini').is_visible(), f'{size} {L}: compact breakdown line on phones')
            check(not any(r['lobby'] for r in rows), f'{size} {L}: no lobby badge (one lobby)')
        check(pg.evaluate('document.documentElement.scrollWidth - innerWidth') <= 0, f'{size}: no sideways overflow')
        pg.close()
    b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
