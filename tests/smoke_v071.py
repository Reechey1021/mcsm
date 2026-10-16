# tests/smoke_v071.py - trophies, team grid, title cards, lobby settings, practice room, season delete.
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
def go(pg, route, who=None, wait=1800):
    pg.goto(BASE + '?fakecloud&autoconfirm' + (f'&fakeuser={who}' if who else '') + '#' + route); pg.wait_for_timeout(wait)
with sync_playwright() as p:
    b = p.chromium.launch()
    for size, vw in (('m', (390, 844)), ('d', (1440, 900))):
        ctx = b.new_context(viewport={'width': vw[0], 'height': vw[1]}, device_scale_factor=2 if size == 'm' else 1, color_scheme='dark', has_touch=size == 'm')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(BASE + '?fakecloud&autoconfirm&fakereset#/csapatok'); pg.wait_for_timeout(2200)
        widths = pg.eval_on_selector_all('.team-card', 'els => [...new Set(els.map(e => Math.round(e.getBoundingClientRect().width)))]')
        check(len(widths) == 1, f'{size}: team cards same width ({widths})')
        check('🥇' not in text(pg) and pg.query_selector('.team-card .trophy') is not None, f'{size}: trophy icons on teams')
        snap(pg, f'v71_teams_{size}')
        go(pg, '/pilotak/igtsh_saby', None, 2600)
        check(pg.query_selector('.medal.m0 .trophy') is not None and pg.query_selector('.head-titles .trophy') is not None, f'{size}: title cards and trophy by the name')
        snap(pg, f'v71_profile_{size}')
        go(pg, '/eredmenyek?nezet=dicsosegfal', None, 2200)
        check('🥇' not in text(pg) and len(pg.query_selector_all('.hof .trophy')) > 50, f'{size}: hall of fame uses trophies')
        # wizard: lobby settings on a round
        go(pg, '/admin/szezon/uj', 'owner')
        inputs = pg.query_selector_all('.wizard-body input'); inputs[1].fill(f'Lobbi teszt {size}')
        pg.click('.wizard-foot .btn.primary'); pg.wait_for_timeout(600)
        # step 2: pre-qualifying sessions + the PQ room settings
        pg.click('button:has-text("Alapértelmezett PQ")'); pg.wait_for_timeout(200)
        check(pg.eval_on_selector('.wizard-body .lobby-sec select', 'e => e.value') == '30 perc + 1 kör Finish Delay', f'{size}: PQ room default')
        pg.click('.wizard-foot .btn.primary'); pg.wait_for_timeout(600)
        # step 3: a round with its own lobby settings (General, Qualifying, Sprint, Gran'Prix)
        pg.click('button:has-text("Forduló hozzáadása")'); pg.wait_for_timeout(400)
        pg.select_option('.round-edit select', 'suzuka'); pg.wait_for_timeout(200)
        pg.click('.round-edit .seg button:has-text("Lobby beállítások")'); pg.wait_for_timeout(300)
        secs = [x.inner_text().strip() for x in pg.query_selector_all('.round-edit .lobby-sec > summary')]
        check(secs[:4] == ['ÁLTALÁNOS BEÁLLÍTÁSOK', 'KVALIFIKÁCIÓ', 'SPRINTFUTAM', "GRAN'PRIX"], f'{size}: round sessions ({secs})')
        pg.click('.lobby-sec summary:has-text("Gran\'Prix")'); pg.wait_for_timeout(200)
        gp = pg.query_selector_all('.round-edit .lobby-sec')[3]
        gp.query_selector('select').select_option('25 kör')
        gp.query_selector_all('.ticker')[0].query_selector_all('.icon-btn')[1].click()
        check('4X' in gp.inner_text(), f'{size}: tyre wear ticker 3X -> 4X')
        gp.query_selector_all('select')[-1].select_option('Custom'); pg.wait_for_timeout(200)
        gp = pg.query_selector_all('.round-edit .lobby-sec')[3]
        chips = gp.query_selector_all('.lobby-chips .chip'); check(len(chips) == 32, f'{size}: 32 weather cards ({len(chips)})')
        chips[19].click(); chips[25].click()
        snap(pg, f'v71_wizard_{size}')
        pg.click('.wizard-foot .btn.primary'); pg.wait_for_timeout(500)
        pg.fill('.wizard-body .car-pick input', 'Teszt autó')
        pg.click('.wizard-foot .btn.primary'); pg.wait_for_timeout(500)
        pg.click('button:has-text("Alapértelmezett időszak")'); pg.wait_for_timeout(200)
        pg.click('.wizard-foot .btn.primary'); pg.wait_for_timeout(500)
        # step 6: lobbies: A has a streamer slot, host for A
        cards = pg.query_selector_all('.wizard-body .round-edit')
        check(len(cards) == 3, f'{size}: three lobby cards')
        cards[0].query_selector('input').fill('15'); cards[0].query_selector('select').select_option(index=1)
        pg.click('.wizard-foot .btn.primary'); pg.wait_for_timeout(500); pg.click('.wizard-foot .btn.primary'); pg.wait_for_timeout(700)
        check('A: 15' in text(pg), f'{size}: review shows lobby sizes')
        pg.click('button:has-text("Meghirdetés")'); pg.wait_for_timeout(1800)
        sid = pg.url.split('/szezonok/')[-1].split('/')[0] if '/szezonok/' in pg.url else ''
        check(sid.startswith('mcsm'), f'{size}: season saved ({pg.url})')
        go(pg, f'/szezonok/{sid}/fordulo/1', 'owner')
        pg.click('button:has-text("Gyakorlószoba beállítások")'); pg.wait_for_timeout(700)
        sheet = text(pg, '.sheet')
        full = pg.evaluate("document.querySelector('.sheet').textContent")
        check('BOP / Tuning Prohibited • ON' in full and '25 kör' in full and 'Tyre Wear • 4X' in full and 'C02 → R02' in full, f'{size}: practice room sheet shows the settings')
        snap(pg, f'v71_practice_{size}')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(400)
        # delete the season
        go(pg, f'/szezonok/{sid}', 'owner')
        pg.click('button:has-text("Szezon törlése")'); pg.wait_for_timeout(600)
        check(pg.is_disabled('.sheet .btn.danger.block'), f'{size}: delete needs the typed name')
        pg.fill('.sheet input', sid.upper()); pg.wait_for_timeout(200)
        pg.click('.sheet .btn.danger.block'); pg.wait_for_timeout(1800)
        go(pg, '/szezonok', 'owner')
        check(f'MCSM{sid[4:]}' not in text(pg), f'{size}: season gone')
        ow = pg.evaluate('document.documentElement.scrollWidth - innerWidth')
        check(ow <= 0, f'{size}: no horizontal overflow ({ow})')
        ctx.close()
    b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
