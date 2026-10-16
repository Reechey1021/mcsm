# tests/smoke_v1.py - v1.0: smooth collapsibles (and instant under reduced motion), list entrance,
# photo fade-in, results visible to visitors for imported seasons, last round by default.
import sys, json
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
def real(errs): return [e for e in errs if not any(k in e for k in ('fonts.g', 'net::ERR', "Firebase couldn't load", 'docs.google', 'googletagmanager'))]
fails, passes, errs = [], 0, []
def check(c, m):
    global passes
    if c: passes += 1
    else: fails.append(m)
n = [0]
def go(pg, route, who=None, wait=2400):
    n[0] += 1; pg.goto(BASE + f'?fakecloud&v={n[0]}' + (f'&fakeuser={who}' if who else '') + '#' + route); pg.wait_for_timeout(wait)
    if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(300)
def db(pg, js):
    pg.goto(BASE + 'tests/'); pg.wait_for_timeout(150)
    return pg.evaluate("() => { const k='mcsm:fakecloud:v1'; const db=JSON.parse(localStorage.getItem(k)); const r=(" + js + ")(db); localStorage.setItem(k, JSON.stringify(db)); return r; }")
pressed = "(() => [...document.querySelectorAll('.seg button[aria-pressed=\"true\"]')].map(b => b.innerText).join('|'))()"
with sync_playwright() as p:
    b = p.chromium.launch()
    for size, vw in (('m', (390, 844)), ('d', (1440, 900))):
        ctx = b.new_context(viewport={'width': vw[0], 'height': vw[1]}, has_touch=size == 'm')
        pg = ctx.new_page()
        pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.goto(BASE + '?fakecloud&fakereset&fakeuser=owner#/'); pg.wait_for_timeout(1500)
        # collapsible: animates open and closed, ends in the right state
        go(pg, '/admin', 'owner')
        d = 'details.adv:not(.dev-tools)'
        pg.click(d + ' > summary'); pg.wait_for_timeout(60)
        mid = pg.evaluate(f"(() => {{ const e = document.querySelector('{d}'); return [e.open, e.getAnimations().length]; }})()")
        pg.wait_for_timeout(450)
        end = pg.evaluate(f"(() => {{ const e = document.querySelector('{d}'); return [e.open, e.style.overflow, Math.round(e.getBoundingClientRect().height)]; }})()")
        check(mid[0] and mid[1] >= 1 and end[0] and end[1] == '' and end[2] > 100, f'{size}: section opens smoothly ({mid} → {end})')
        pg.click(d + ' > summary'); pg.wait_for_timeout(60)
        still = pg.evaluate(f"document.querySelector('{d}').open")
        pg.wait_for_timeout(450)
        closed = pg.evaluate(f"document.querySelector('{d}').open")
        check(still and not closed, f'{size}: section folds away, then closes ({still} → {closed})')
        # list entrance on first paint, then the class is gone
        go(pg, '/pilotak', None, 900)
        had = pg.evaluate("(() => { const g = document.querySelector('.drv-grid'); return g ? [g.classList.contains('reveal'), g.children.length] : null; })()")
        pg.wait_for_timeout(1200)
        gone = pg.evaluate("document.querySelector('.drv-grid').classList.contains('reveal')")
        check(had and had[1] > 3 and not gone, f'{size}: driver cards rise in once ({had}, cleared={not gone})')
        # imported season: rounds 2-3 visible to visitors once an admin has opened the site
        db(pg, """(db) => { const s = db.seasons.mcsm30; s.state = 'finished';
          const ids = Object.keys(db.users).slice(0, 12);
          db.race.mcsm30 = { rounds: {}, sheets: {}, pq: {}, protests: {}, votes: {}, notes: {}, penalties: {} };
          [1, 2, 3].forEach((n) => { db.race.mcsm30.rounds[String(n)] = { n, lobbies: n === 1 ? { A: ids, B: [], C: [] } : { A: [], B: [], C: [] }, lobbiesPublished: n === 1, resultsState: 'final', legacy: { rows: ids.map((id, i) => ({ id, pos: i + 1, points: 600 - i * 20 - n, status: 'OK' })) } }; });
          db.entries.mcsm30 = Object.fromEntries(ids.map((id, i) => [id, { uid: id, type: 'driver', status: 'entered', approved: true, order: i + 1, snapshot: { firstName: db.users[id].firstName || 'A', lastName: db.users[id].lastName || 'B', psn: db.users[id].psn || 'x' + i, raceNumber: i + 1 } }]));
          s.rounds = [1, 2, 3].map((n) => ({ ...(s.rounds && s.rounds[0] || {}), n, date: Date.now() - (40 - n) * 86400000 }));
          delete (db.content || {})['summary-mcsm30']; }""")
        go(pg, '/', 'owner', 6500)   # admin visit: summaries are refreshed in the background
        pg.evaluate("() => Object.keys(sessionStorage).filter(k => k.includes('fakeuid')).forEach(k => sessionStorage.removeItem(k))")
        go(pg, '/eredmenyek/mcsm30', None, 3000)
        chips = pg.evaluate("[...document.querySelectorAll('.seg button')].map(b => b.innerText).filter(x => /ut[áa]n/.test(x))")
        check(len(chips) == 3, f'{size}: visitors see all three rounds of an imported season ({chips})')
        check('3.' in pg.evaluate(pressed), f'{size}: opens on the last round ({pg.evaluate(pressed)})')
        # photos fade in, never stay hidden
        go(pg, '/pilotak', None, 3500)
        hidden = pg.evaluate("[...document.querySelectorAll('.avatar img.gt7')].filter(i => !i.classList.contains('in')).length")
        check(hidden == 0, f'{size}: no photo left hidden ({hidden})')
        # GT teams: switch on Csapatok, cards, their own page, editing with colours, delete needs an empty team
        go(pg, '/csapatok', None)
        check('MCSM csapatok' in pg.inner_text('#view') and 'GT csapatok' in pg.inner_text('#view'), f'{size}: MCSM / GT switch')
        pg.click('.seg button:has-text("GT csapatok")'); pg.wait_for_timeout(1500)
        cards = pg.query_selector_all('.team-grid a.team-card[href*="/csapatok/gt/"]')
        check(len(cards) >= 1, f'{size}: GT team cards ({len(cards)})')
        if cards:
            cards[0].click(); pg.wait_for_timeout(2200)
            check('#/csapatok/gt/' in pg.url and pg.query_selector('.team-hero') is not None, f'{size}: GT team page')
        go(pg, '/csapatok/gt/MGTK', 'owner')
        if pg.query_selector('button:has-text("Szerkesztés")'):
            pg.click('button:has-text("Szerkesztés")'); pg.wait_for_timeout(600)
            check(len(pg.query_selector_all('.sheet input[type=color]')) == 2, f'{size}: GT team colours')
            members = pg.query_selector_all('#view .drv-card')
            pg.click('.sheet .btn.danger'); pg.wait_for_timeout(1200)
            check(not members or 'Előbb mindenkit ki kell venni' in pg.inner_text('.sheet'), f'{size}: delete blocked while drivers are in it')
            pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        # user editor: GT team picker
        go(pg, '/admin/felhasznalok', 'owner')
        pg.query_selector_all('.row-card, button.person-row')[0].click(); pg.wait_for_timeout(800)
        check(pg.query_selector('.sheet .f-row:has-text("GT csapat") select') is not None, f'{size}: GT team in the user editor')
        pg.keyboard.press('Escape'); pg.wait_for_timeout(300)
        ctx.close()
    # reduced motion: sections open instantly
    ctx = b.new_context(viewport={'width': 1280, 'height': 900}, reduced_motion='reduce')
    pg = ctx.new_page()
    pg.goto(BASE + '?fakecloud&fakereset&fakeuser=owner#/admin'); pg.wait_for_timeout(2200)
    pg.click('details.adv:not(.dev-tools) > summary'); pg.wait_for_timeout(30)
    r = pg.evaluate("(() => { const e = document.querySelector('details.adv:not(.dev-tools)'); return [e.open, e.getAnimations().length]; })()")
    check(r[0] and r[1] == 0, f'reduced motion: opens instantly ({r})')
    ctx.close(); b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
