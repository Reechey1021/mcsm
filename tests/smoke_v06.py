# tests/smoke_v06.py - 0.6 walk-through: import, account activation, roles, photos, track visuals.
# Uses a small made-up export (no real data). Needs the server on :8765 and playwright.
import sys, json, os, base64
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

D = '/tmp/mcsm-fake-export'; os.makedirs(D, exist_ok=True)
profiles = [
  {'id': 'old-1', 'psn_id': 'OLD_Racer', 'firstname': 'Béla', 'lastname': 'KISS', 'email': 'bela@old.test', 'dr': 'B', 'sr': 'S', 'controlling': 'steering_wheel', 'view': 'tv', 'number': 31, 'mcsm_team': 'RÉGI CSAPAT', 'gt_team': 'MGTK', 'role': 'user', 'created_at': '2026-01-01T00:00:00Z'},
  {'id': 'old-2', 'psn_id': 'OLD_RACER', 'firstname': 'Béla', 'lastname': 'KISS', 'email': 'bela2@old.test', 'dr': 'B', 'sr': 'S', 'controlling': 'steering_wheel', 'view': 'tv', 'number': 31, 'mcsm_team': 'RÉGI CSAPAT', 'gt_team': 'MGTK', 'role': 'user', 'created_at': '2026-02-01T00:00:00Z'},
  {'id': 'old-3', 'psn_id': 'OLD_Second', 'firstname': 'Anna', 'lastname': 'NAGY', 'email': 'anna@old.test', 'dr': 'A', 'sr': 'S', 'controlling': 'controller', 'view': 'vr', 'number': 12, 'mcsm_team': 'RÉGI CSAPAT', 'gt_team': '', 'role': 'user', 'created_at': '2026-01-05T00:00:00Z'},
]
cups = [{'id': 'cup-28', 'name': '🏆MCSM28 • RÉGI KUPA [GR.3]', 'is_active': False, 'lobby_size': 16, 'image_url': '', 'created_at': '2026-03-01T00:00:00Z', 'description': 'Régi szezon'}]
races = [{'id': 'q28', 'cup_id': 'cup-28', 'type': 'PREQUALIFICATION', 'title': 'PREQUALI', 'location': 'SUZUKA', 'start': '2026-03-10', 'start_time': '20:00:00'},
         {'id': 'r28', 'cup_id': 'cup-28', 'type': 'NAGYFUTAM', 'title': 'SUZUKA', 'location': 'SUZUKA CIRCUIT', 'start': '2026-03-12', 'start_time': '19:00:00'}]
race_results = [{'race_id': 'q28', 'profile_id': 'old-1', 'position': 1, 'points': 0, 'time_result': '1:55.100', 'status': 'A lobby'},
                {'race_id': 'r28', 'profile_id': 'old-1', 'position': 1, 'points': 676, 'fastest_lap': True},
                {'race_id': 'r28', 'profile_id': 'old-3', 'position': 2, 'points': 600, 'fastest_lap': False}]
apps = [{'cup_id': 'cup-28', 'profile_id': 'old-1', 'created_at': '2026-03-02T00:00:00Z', 'mcsm_team': 'RÉGI CSAPAT', 'gt_team': 'MGTK'},
        {'cup_id': 'cup-28', 'profile_id': 'old-3', 'created_at': '2026-03-03T00:00:00Z', 'mcsm_team': 'RÉGI CSAPAT', 'gt_team': ''}]
for n, d in [('profiles_with_emails', profiles), ('cups', cups), ('races', races), ('race_results', race_results), ('cup_applications', apps)]:
    json.dump(d, open(f'{D}/{n}.json', 'w'), ensure_ascii=False)
PNG = base64.b64decode('iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAYAAADED76LAAAAJklEQVR4nGP8z8Dwn4EIwESMIlYGhv+MDAz/GRgY/jMyMDAwEAMAlUQGAQ6m7qYAAAAASUVORK5CYII=')
open('/tmp/mcsm-photo.png', 'wb').write(PNG)

with sync_playwright() as p:
    b = p.chromium.launch()
    for size, vw in (('m', (390, 844)), ('d', (1440, 900))):
        ctx = b.new_context(viewport={'width': vw[0], 'height': vw[1]}, device_scale_factor=2 if size == 'm' else 1, color_scheme='dark', has_touch=size == 'm')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(BASE + '?fakecloud&autoconfirm&fakereset&fakeuser=owner#/admin/import'); pg.wait_for_timeout(1800)
        pg.set_input_files('input[type=file]', [f'{D}/{n}.json' for n in ['profiles_with_emails', 'cups', 'races', 'race_results', 'cup_applications']]); pg.wait_for_timeout(800)
        v = text(pg)
        check('OLD_Racer → OLD_RACER' in v and 'Suzuka' in v, f'{size}: import preview ({v[:0]})')
        pg.click('button:has-text("Adatok mentése")'); pg.wait_for_timeout(1800)
        check('dokumentum mentve' in text(pg), f'{size}: data written')
        pg.click('button:has-text("Fiókok létrehozása")'); pg.wait_for_timeout(1500)
        check('2 fiók létrehozva' in text(pg), f'{size}: accounts created ({text(pg)[-120:]!r})')
        snap(pg, f'v6_import_{size}')
        # imported season and its round
        go(pg, '/szezonok/mcsm28/fordulok')
        check('Suzuka' in text(pg), f'{size}: imported season rounds')
        go(pg, '/szezonok/mcsm28/fordulo/1')
        check('régi oldalról' in text(pg) and '676' in text(pg), f'{size}: legacy round table')
        go(pg, '/eredmenyek/mcsm28')
        check(len(pg.query_selector_all('.tower li')) == 2, f'{size}: legacy standings')
        # roles: owner gives pilota the admin role
        go(pg, '/admin/szerepkorok', 'owner')
        pg.click('button:has-text("Szerepkör kiosztása")'); pg.wait_for_timeout(700)
        pg.fill('.sheet input[type=search]', 'teszt'); pg.wait_for_timeout(300)
        pg.query_selector_all('.sheet .row-card')[0].click(); pg.wait_for_timeout(200)
        pg.click('.sheet .btn.primary.block'); pg.wait_for_timeout(1500)
        check('TESZT Elek' in text(pg) or 'Teszt' in text(pg), f'{size}: role granted')
        snap(pg, f'v6_roles_{size}')
        # tracks + decorated rounds
        go(pg, '/admin/gt7', 'owner')
        pg.click('button:has-text("Pályalista frissítése")'); pg.wait_for_timeout(1500)
        check('4 pálya' in text(pg), f'{size}: tracks imported')
        go(pg, '/szezonok/mcsm31/fordulok', None, 2200)
        check(len(pg.query_selector_all('.round-item.trk')) >= 3 and len(pg.query_selector_all('.trk-map')) >= 3, f'{size}: round boxes show photo and map')
        snap(pg, f'v6_rounds_{size}')
        # activation of an imported account
        pg.goto(BASE + '?fakecloud&autoconfirm#/'); pg.wait_for_timeout(800)
        pg.evaluate("sessionStorage.removeItem('mcsm:fakeuid')"); pg.goto(BASE + '?fakecloud&autoconfirm&signedout=1#/belepes'); pg.wait_for_timeout(1600)
        check('Régi MCSM-tag vagy' in text(pg), f'{size}: returning drivers callout')
        pg.click('a:has-text("Régi MCSM-tag vagy")'); pg.wait_for_timeout(900)
        pg.fill('input[type=email]', 'bela2@old.test'); pg.click('button[type=submit]'); pg.wait_for_timeout(1200)
        pg.click('a:has-text("Teszt mód: link megnyitása")'); pg.wait_for_timeout(1800)
        pg.fill('input[type=password]', 'ujjelszo123'); pg.click('button[type=submit]'); pg.wait_for_timeout(2500)
        check('#/udv' in pg.url and 'KISS' in text(pg), f'{size}: welcome shows imported profile ({pg.url})')
        snap(pg, f'v6_welcome_{size}')
        pg.click('button:has-text("Igen, ez az én profilom")'); pg.wait_for_timeout(1800)
        check('#/sajat' in pg.url or '#/profil' in pg.url, f'{size}: confirmed ({pg.url})')
        # photo upload
        go(pg, '/sajat', None, 1800)
        btn = pg.query_selector('.avatar-edit')
        if btn:
            btn.click(); pg.wait_for_timeout(500)
            with pg.expect_file_chooser() as fc:
                pg.click('.sheet button:has-text("Kép kiválasztása")')
            fc.value.set_files('/tmp/mcsm-photo.png'); pg.wait_for_timeout(2000)
        check(pg.query_selector('.profile-head .avatar img') is not None, f'{size}: profile photo shown')
        snap(pg, f'v6_photo_{size}')
        # 0.6.1: advanced section, settings, phone notifications switch, cover drop zone, date fields
        go(pg, '/admin', 'owner')
        check(pg.query_selector('details.adv') is not None and not pg.query_selector('details.adv').get_attribute('open'), f'{size}: advanced tools folded away')
        go(pg, '/admin/beallitasok', 'owner')
        check('Web Push' in text(pg), f'{size}: settings page')
        go(pg, '/sajat', 'owner', 2000)
        sw = pg.query_selector('.toggle-row:has-text("Telefonos értesítések") .switch')
        if sw: sw.click(); pg.wait_for_timeout(900)
        check('Bekapcsolva ezen az eszközön' in text(pg), f'{size}: push switch turns on (test mode)')
        go(pg, '/admin/szezon/uj', 'owner', 1800)
        check(pg.query_selector('.dropzone') is not None and 'Borítókép linkje' not in text(pg), f'{size}: cover drop zone, no link field')
        pg.click('.seg button:has-text("Nevezés")'); pg.wait_for_timeout(600)
        over = pg.evaluate("[...document.querySelectorAll('input[type=datetime-local]')].map(i => { const r = i.getBoundingClientRect(), p = i.closest('.panel, .wizard-body, main').getBoundingClientRect(); return Math.round(r.right - p.right); })")
        check(all(o <= 0 for o in over), f'{size}: date fields stay inside ({over})')
        ow = pg.evaluate('document.documentElement.scrollWidth - innerWidth')
        check(ow <= 0, f'{size}: no horizontal overflow ({ow})')
        ctx.close()
    b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
