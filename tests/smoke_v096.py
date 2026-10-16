# tests/smoke_v096.py - 0.9.6: percentile standings, compare layout, sort figures, live streams (demo),
# rules doc, no photo upload, neutral avatars, Compare beside the back button.
import sys, json
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
    n[0] += 1; pg.goto(BASE + f'?fakecloud{extra}&v={n[0]}' + (f'&fakeuser={who}' if who else '') + '#' + route); pg.wait_for_timeout(wait)
with sync_playwright() as p:
    b = p.chromium.launch()
    for size, vw in (('m', (390, 844)), ('d', (1440, 900))):
        ctx = b.new_context(viewport={'width': vw[0], 'height': vw[1]}, device_scale_factor=2 if size == 'm' else 1, color_scheme='dark', has_touch=size == 'm')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(BASE + '?fakecloud&fakereset&fakeuser=owner#/admin/mcsm-rating'); pg.wait_for_timeout(2200)
        pg.set_input_files('input[type=file]', '/mnt/user-data/uploads/MCSM_Rating_V3_2_Latent_Import.json'); pg.wait_for_timeout(800)
        pg.click('button:has-text("Kiindulás mentése")'); pg.wait_for_timeout(900)
        pg.click('button:has-text("Újraszámolás és közzététel")'); pg.wait_for_timeout(4000)
        go(pg, '/pilotak/igtsh_saby', 'owner')
        card = text(pg, '.mr-card')
        check(len(pg.query_selector_all('.mr-card .stars')) == 4 and '100,0' not in card, f'{size}: stars (since 0.9.7), no 100 marker ({card[:90]!r})')
        check(len(pg.query_selector_all('.mr-parts .mr-part')) == 3, f'{size}: three parts in a row')
        top = pg.evaluate("(() => { const r = document.querySelector('.top-row'); return r ? [r.children.length, Math.round(r.getBoundingClientRect().height)] : null; })()")
        check(top and top[0] == 2 and top[1] < 60, f'{size}: Compare on the back-button line ({top})')
        snap(pg, f'v96_profile_{size}')
        pg.click('.top-row button:has-text("Összevetés")'); pg.wait_for_timeout(600)
        first = pg.query_selector_all('.sheet .row-card')[0].inner_text()
        check('HORVÁTH' in first, f'{size}: you are first in the picker ({first[:30]!r})')
        pg.query_selector_all('.sheet .row-card')[1].click(); pg.wait_for_timeout(2200)
        widths = pg.evaluate("[...document.querySelectorAll('.cmp-row')].slice(0,3).map(r => [...r.children].map(c => Math.round(c.getBoundingClientRect().width)))")
        check(all(w[0] == w[2] for w in widths), f'{size}: equal columns ({widths})')
        check(pg.query_selector('.cmp-v.win') is not None and 'DR PONT' in text(pg).upper(), f'{size}: winner highlighted, DR points')
        snap(pg, f'v96_compare_{size}')
        # drivers: the figure follows the sort
        go(pg, '/pilotak', None)
        check(pg.query_selector('.drv-card .rating') is None and pg.query_selector('.drv-card .tcount') is None, f'{size}: basics only by default')
        pg.select_option('select.select', 'mcsm'); pg.wait_for_timeout(700)
        check('MCSM' in pg.query_selector_all('.drv-card')[0].inner_text(), f'{size}: rating shown when sorting by it')
        pg.select_option('select.select', 'dr'); pg.wait_for_timeout(700)
        check('DR' in pg.query_selector_all('.drv-card')[0].inner_text(), f'{size}: DR shown when sorting by DR')
        # live streams: hidden without data, shown in demo
        go(pg, '/', 'owner')
        if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(300)
        check(not pg.is_visible('.live-box'), f'{size}: live row hidden when nobody is live')
        go(pg, '/', 'owner', '&livedemo', 3000)
        if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(300)
        check(pg.is_visible('.live-box') and len(pg.query_selector_all('.live-card')) == 4 and 'Élő streamek (4)' in text(pg, '.live-box'), f'{size}: live row in demo')
        href = pg.get_attribute('.live-card', 'href') or ''
        check(href.startswith('https://twitch.tv/'), f'{size}: opens Twitch ({href})')
        snap(pg, f'v96_live_{size}')
        # rules: the Google Doc
        go(pg, '/szabalyzat', None)
        check(pg.query_selector('iframe.rules-frame[src*="docs.google.com"]') is not None, f'{size}: rules doc embedded')
        # my page: no photo upload pencil, neutral avatar colour
        go(pg, '/sajat', 'owner')
        if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(300)
        check(pg.query_selector('.avatar-edit') is None, f'{size}: no photo upload')
        bgs = pg.evaluate("[...new Set([...document.querySelectorAll('.avatar')].map(a => getComputedStyle(a).backgroundColor))]")
        check(len(bgs) == 1, f'{size}: one avatar colour ({bgs})')
        ctx.close()
    b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
