# tests/smoke_v105.py - round recap: the four preview scenarios on small phones (no scrolling inside the
# card), the real flow (finalising a round writes notes; the driver sees it first, once), the replay button.
import json, sys
from playwright.sync_api import sync_playwright
BASE = 'http://localhost:8765/'
shots = sys.argv[1] if len(sys.argv) > 1 else None
def real(errs): return [e for e in errs if not any(k in e for k in ('fonts.g', 'net::ERR', "Firebase couldn't load", 'docs.google', 'googletagmanager'))]
fails, passes, errs = [], 0, []
def check(c, m):
    global passes
    if c: passes += 1
    else: fails.append(m)
def db(pg, js):
    pg.goto(BASE + 'tests/'); pg.wait_for_timeout(150)
    return pg.evaluate("() => { const k='mcsm:fakecloud:v1'; const db=JSON.parse(localStorage.getItem(k)); const r=(" + js + ")(db); localStorage.setItem(k, JSON.stringify(db)); Object.keys(localStorage).filter((x) => x.startsWith('mcsm:pc:')).forEach((x) => localStorage.removeItem(x)); return r; }")
EXPECT = {'up': ['Eredményeid', '▲ +2,4', 'Új csúcs', '▲ 2'], 'down': ['Eredményeid', '▼ −1,3', 'DNF', '▼ 1'], 'ranked': ['Besorolva', '#23', '61'], 'calib': ['Eredményeid', '2/3', 'Kalibráció']}
with sync_playwright() as p:
    b = p.chromium.launch()
    # 1. previews on small phones and desktop: content right, nothing scrolls inside the card
    for vw in ((360, 640), (375, 667), (1440, 900)):
        for sc, words in EXPECT.items():
            pg = b.new_page(viewport={'width': vw[0], 'height': vw[1]}, device_scale_factor=2)
            pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
            pg.goto(BASE + f'?fakecloud&resultsdemo={sc}#/'); pg.wait_for_timeout(4200)
            card = pg.query_selector('.rr-card')
            txt = card.inner_text() if card else ''
            check(all(w.upper() in txt.upper() for w in words), f'{vw}: {sc} shows {words} ({txt[:60]!r})')
            fits = pg.evaluate("(() => { const c = document.querySelector('.rr-card'); return c && c.scrollHeight <= c.clientHeight + 1; })()")
            check(fits, f'{vw}: {sc} fits without scrolling')
            if shots and vw == (375, 667): pg.screenshot(path=f'{shots}/recap_{sc}.png')
            pg.close()
    # 2. real flow: finalising round 2 writes notes; the driver sees the recap first (before news), once
    ctx = b.new_context(viewport={'width': 390, 'height': 844})
    pg = ctx.new_page()
    pg.on('pageerror', lambda e: errs.append('PAGEERROR ' + str(e)))
    pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
    pg.goto(BASE + '?fakecloud&fakereset#/'); pg.wait_for_timeout(1200)
    db(pg, """(db) => { const P = db.accounts['pilota@mcsm.test'].uid; const X = db.race.mcsm31.rounds['2'].lobbies.A[1];
      db.race.mcsm31 = JSON.parse(JSON.stringify(db.race.mcsm31).split(X).join(P));
      const e = db.entries.mcsm31[X]; const u = db.users[P]; delete db.entries.mcsm31[X];
      db.entries.mcsm31[P] = { ...e, uid: P, snapshot: { ...e.snapshot, firstName: u.firstName, lastName: u.lastName, psn: u.psn, psnLower: u.psnLower, raceNumber: u.raceNumber } };
      db.content = db.content || {}; db.content.news = { items: [{ id: 'nx', title: 'Hír', body: 'x', carousel: true, at: Date.now() }] }; }""")
    pg.goto(BASE + '?fakecloud&autoconfirm&fakeuser=owner&v=1#/szezonok/mcsm31/fordulo/2'); pg.wait_for_timeout(2600)
    if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(300)
    fin = pg.query_selector('button:has-text("Véglegesítés")') or pg.query_selector('button:has-text("Végleges")')
    if fin: fin.click(); pg.wait_for_timeout(7000)
    n = db(pg, "(db) => Object.values(db.users).filter((u) => u.roundRecap && u.roundRecap.n === 2).length")
    check(fin is not None and n >= 5, f'finalising writes recap notes ({n})')
    pg.evaluate("() => { sessionStorage.clear(); localStorage.removeItem('mcsm:newsDismissed'); }")
    pg.goto(BASE + '?fakecloud&fakeuser=pilota&v=2#/'); pg.wait_for_timeout(2800)
    check(pg.query_selector('.rr-overlay') is not None and pg.query_selector('.nc-overlay') is None, 'the recap comes first, news waits')
    check('2. FORDULÓ' in (pg.inner_text('.rr-kicker') if pg.query_selector('.rr-kicker') else ''), 'it is the round 2 recap')
    pg.click('.rr-actions .btn:not(.primary)'); pg.wait_for_timeout(1600)
    check(pg.query_selector('.rr-overlay') is None and pg.query_selector('.nc-overlay') is not None, 'Bezárás closes it, then the news')
    if pg.query_selector('.nc-overlay'): pg.click('.nc-bottom .btn.primary'); pg.wait_for_timeout(300)
    cleared = db(pg, "(db) => db.users[db.accounts['pilota@mcsm.test'].uid].roundRecap == null")
    check(cleared, 'note cleared (shows once)')
    # 3. replay from the round page
    pg.goto(BASE + '?fakecloud&fakeuser=pilota&v=3#/szezonok/mcsm31/fordulo/2'); pg.wait_for_timeout(2800)
    btn = pg.query_selector('.final-box .fh-recap')
    check(btn is not None and btn.is_visible(), 'Összefoglaló button on the final box')
    if btn:
        btn.click(); pg.wait_for_timeout(1200)
        check(pg.query_selector('.rr-overlay') is not None, 'replay plays the recap')
        pg.click('.rr-actions .btn.primary'); pg.wait_for_timeout(1500)
        check('#/szezonok/mcsm31/fordulo/2' in pg.url and pg.query_selector('.rr-overlay') is None, 'Teljes eredmények goes to the round')
    ctx.close(); b.close()
print(json.dumps({'passed': passes, 'failed': fails, 'errors': real(errs)}, ensure_ascii=False, indent=1))
