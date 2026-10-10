# MCSM

The new mcsm.hu: accounts, driver profiles, teams and (in later phases) seasons,
results and protests for the MCSM Gran Turismo 7 championship. Hungarian first,
English second. Plain JavaScript modules, no build step, Firebase behind it.

## Run it locally

```
cd mcsm
python3 -m http.server 8765
```

Open http://localhost:8765/?fakecloud . The build points at the real Firebase project; `?fakecloud`
switches the tab to the **test backend**: everything lives in your browser, and each tab is its own "device".

Test accounts (password `demo1234`):

- `owner@mcsm.test` – owner, sees Admin
- `pilota@mcsm.test` – a driver with a finished profile

Seeded seasons: MCSM31 (running, real dates, with PQ times and simulated results for rounds 1–2), MCSM30 and MCSM29 (archive), and a made-up MCSM32
whose entries are always open, so you can try entering. MCSM31 also has a published protest
decision (round 1), an open case with two votes (round 2, whose protest window is kept open in the
test data) and four judges; the owner account is also judge chair.

The yellow "Teszt mód" pill opens the menu with quick sign-in buttons and a data reset.

URL helpers: `?fakecloud` forces the test backend even with a config, `?realcloud` undoes it,
`?fakeuser=owner` signs the tab in as a test account, `?fakereset` wipes test data.

## Tests

```
node tests/run.mjs                 # scoring engine, profile rules, translations, test backend
python3 tests/smoke.py [shot-dir]          # accounts, wizard, directory, admin
python3 tests/smoke_seasons.py [shot-dir]  # seasons, entering, waitlist, season wizard
python3 tests/smoke_race.py [shot-dir]     # standings, rounds, PQ, lobbies, results entry
python3 tests/smoke_protests.py [shot-dir] # protests, stewards, penalties, Spec picks
python3 tests/smoke_v05.py [shot-dir]      # signed-out pages, rules editor, GT7 data, car picker, notifications
# both need the server above and playwright
```

## Layout

```
index.html, manifest.webmanifest, css/app.css   page shell and the whole design system
js/main.js          boot
js/router.js        routes, guards, view transitions
js/shell.js         header, tab bar, menu
js/core/            DOM builder, icons, motion system, storage, event bus, data cache
js/ui/              sheets, toasts, segmented controls, form fields, shared pieces
js/i18n/            hu.js (default), en.js
js/model/profile.js profile fields, validation, completeness
js/engine/          scoring.js: points, standings, tie-breaks, promotion/relegation, grids
js/model/           profile.js, season.js (entry list, entry checks, windows), time.js (Budapest time),
                    race.js (time formats, PQ ranking, results to standings, penalties, no-shows),
                    protest.js (filing window, panel eligibility, vote tally, DSQ triggers, Spec picks)
js/data/tracks.js   GT7 locations and layouts
js/services/        backend picker, session, cloud/firebase.js and cloud/fake.js (same interface)
js/screens/         one module per page; admin/ for the admin area
firestore.rules, storage.rules, firebase.json
```
